// Synchronisation de l'historique de l'appareil avec le coffre privé (conception compte §21.8,
// §21.2.3 point 4, §37.11 A-G2 et A-G8 ; plan, lot 11) contre le faux serveur du compte :
// fusion à l'ouverture, écriture différée de 2 à 12 min après un événement, entrées « compte »
// retirées à la déconnexion (celles de l'appareil restent), retour des entrées de l'appareil
// dans le nouveau coffre après « Mot de passe oublié ».
import { randomFillSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { b64u, unb64u } from "../engine/pure";
import { fakeIndexedDB, type FakeIdb } from "../history/fake-idb.test-helper";
import { linkKey, type HistoryEntry } from "../history/store";
import { deriverCompte } from "../engine/index";
import { clesDuCompte, ouvrirEnveloppe } from "./keys";
import { ouvrir, priveDeJson, REGLAGES_DEFAUT, type CoffrePrive, type Profil } from "./vaults";
import { deCoffre, fusionner, renommerEntree, versCoffre } from "./sync";
import * as C from "./session.svelte";

const MDP = "correct horse battery";
const CODE = "123456";
const PREUVE = { altcha: "preuve", hp: "", shown_at: "t" };
const profil = (p: Partial<Profil> = {}): Profil => ({ pseudo: "Lea", photo: null, langue: "fr", reglages: { ...REGLAGES_DEFAUT }, pass: null, ...p });

type Compte = { h: Uint8Array; aAuth: string; envMdp: Uint8Array; sProfil: Uint8Array; pCanon: string; coffres: Record<"profil" | "prive", { blob: Uint8Array; gen: number }>; totp: boolean };

/** Faux serveur (copie de celui de session.test.ts) : routes du compte, mêmes formes que handlers_compte.go. */
function fauxServeur() {
  const comptes = new Map<string, Compte>(); // e-mail exact → compte
  const etapes = new Map<string, { email: string; h: Uint8Array; sorte: "inscription" | "oubli" | "totp"; verifie?: boolean }>();
  const sessions = new Map<string, string>(); // jeton → e-mail
  const pseudos = new Set<string>();
  const requetes: { method: string; path: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const etiquettes: string[] = [];
  const rnd = (n: number) => randomFillSync(new Uint8Array(n)); // pas crypto.getRandomValues : `tires` ne voit que l'appareil
  const ok = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
  const err = (status: number, error: string, extra = {}) => ok({ error, ...extra }, status);
  const ouvrirSession = (email: string) => {
    const t = b64u(rnd(32));
    sessions.set(t, email);
    return t;
  };
  const ouverture = (email: string) => {
    const c = comptes.get(email)!;
    return { session: ouvrirSession(email), h: b64u(c.h as Uint8Array<ArrayBuffer>), env_mdp: b64u(c.envMdp as Uint8Array<ArrayBuffer>), s_profil: b64u(c.sProfil as Uint8Array<ArrayBuffer>), blob_profil: b64u(c.coffres.profil.blob as Uint8Array<ArrayBuffer>), gen_profil: c.coffres.profil.gen, blob_prive: b64u(c.coffres.prive.blob as Uint8Array<ArrayBuffer>), gen_prive: c.coffres.prive.gen };
  };
  const fetch = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const headers = { ...(init.headers as Record<string, string>) };
    const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
    requetes.push({ method: init.method ?? "GET", path, headers, body });
    const qui = sessions.get(headers["X-Shh-Session"] ?? "");
    const r = path.replace(/^\/api\/compte\/?/, "");
    switch (`${init.method} ${r}`) {
      case "POST inscription/debut": {
        const e = b64u(rnd(32)), h = rnd(16);
        etapes.set(e, { email: body.email as string, h, sorte: "inscription" });
        return ok({ h: b64u(h), etape: e });
      }
      case "POST inscription/fin": {
        const e = etapes.get(body.etape as string);
        if (!e) return err(404, "not_found");
        if (body.code !== CODE) return err(403, "code_faux", { attempts_left: 4 });
        if (pseudos.has(body.p_canon as string)) return err(409, "pseudo_pris");
        pseudos.add(body.p_canon as string);
        if (body.etiquette) etiquettes.push(body.etiquette as string);
        comptes.set(e.email, { h: e.h, aAuth: body.a_auth as string, envMdp: unb64u(body.env_mdp as string), sProfil: unb64u(body.s_profil as string), pCanon: body.p_canon as string, coffres: { profil: { blob: unb64u(body.blob_profil as string), gen: 1 }, prive: { blob: unb64u(body.blob_prive as string), gen: 1 } }, totp: false });
        etapes.delete(body.etape as string);
        return ok({ session: ouvrirSession(e.email) }, 201);
      }
      case "POST connexion": {
        const c = comptes.get(body.email as string);
        if (!c || c.aAuth !== body.a_auth) return err(403, "identifiants");
        if (c.totp) {
          const e = b64u(rnd(32));
          etapes.set(e, { email: body.email as string, h: c.h, sorte: "totp" });
          return ok({ totp_requis: true, etape: e });
        }
        return ok(ouverture(body.email as string));
      }
      case "POST connexion/totp": {
        const e = etapes.get(body.etape as string);
        if (!e || e.sorte !== "totp") return err(404, "not_found");
        if (body.code !== "654321") return err(403, "totp_faux");
        return ok(ouverture(e.email));
      }
      case "POST oubli/debut": {
        const e = b64u(rnd(32));
        etapes.set(e, { email: body.email as string, h: comptes.get(body.email as string)?.h ?? rnd(16), sorte: "oubli" });
        return ok({ etape: e });
      }
      case "POST oubli/verifier": {
        const e = etapes.get(body.etape as string);
        const c = e && comptes.get(e.email);
        if (!e || !c || body.code !== CODE) return err(403, "code_faux", { attempts_left: 4 });
        e.verifie = true;
        return ok({ h: b64u(c.h as Uint8Array<ArrayBuffer>), gen_prive: c.coffres.prive.gen });
      }
      case "POST oubli/fin": {
        const e = etapes.get(body.etape as string);
        if (!e?.verifie) return err(404, "not_found");
        const c = comptes.get(e.email)!;
        const blob = unb64u(body.blob_prive as string);
        if (new DataView(blob.buffer, 9, 8).getBigUint64(0) !== BigInt(c.coffres.prive.gen + 1)) return err(400, "bad_request");
        c.aAuth = body.a_auth as string;
        c.envMdp = unb64u(body.env_mdp as string);
        c.coffres.prive = { blob, gen: c.coffres.prive.gen + 1 };
        for (const [t, m] of sessions) if (m === e.email) sessions.delete(t);
        const o = ouverture(e.email);
        return ok({ session: o.session, h: o.h, s_profil: o.s_profil, blob_profil: o.blob_profil, gen_profil: o.gen_profil, gen_prive: o.gen_prive });
      }
      case "POST pseudo/verifier":
        if (!qui && !(body.etape && etapes.has(body.etape as string))) return err(401, "session");
        return ok({ libre: !pseudos.has(body.p_canon as string) });
      case "POST pseudo": {
        if (!qui) return err(401, "session");
        if (pseudos.has(body.p_canon as string)) return err(409, "pseudo_pris");
        const c = comptes.get(qui)!;
        pseudos.delete(c.pCanon);
        pseudos.add((c.pCanon = body.p_canon as string));
        return ok({});
      }
      case "GET coffre/profil":
      case "GET coffre/prive": {
        if (!qui) return err(401, "session");
        const v = comptes.get(qui)!.coffres[r.slice(7) as "profil" | "prive"];
        return ok({ blob: b64u(v.blob as Uint8Array<ArrayBuffer>), gen: v.gen });
      }
      case "PUT coffre/profil":
      case "PUT coffre/prive": {
        if (!qui) return err(401, "session");
        const v = comptes.get(qui)!.coffres[r.slice(7) as "profil" | "prive"];
        if (body.if_gen !== v.gen) return err(409, "conflict", { gen: v.gen });
        v.blob = unb64u(body.blob as string);
        v.gen++;
        return ok({ gen: v.gen });
      }
      case "GET ": {
        if (!qui) return err(401, "session");
        return ok({ h: b64u(comptes.get(qui)!.h as Uint8Array<ArrayBuffer>), cree_le: "2026-11-14", palier: "neuf", confirme_le: "2026-11-21", limites: { salons: 1, places: 4, heures: 24 }, salons_actifs: 0, totp: false, banni: false, recup_jusqu: null, retrait_totp_le: null, banni_jusqu: null, banni_motif: null });
      }
      case "POST sessions/etiquette":
        if (!qui) return err(401, "session");
        etiquettes.push(body.etiquette as string);
        return ok({});
      case "POST deconnexion":
        if (!qui) return err(401, "session");
        sessions.delete(headers["X-Shh-Session"]!);
        return ok({});
    }
    return err(404, "not_found");
  }) as unknown as typeof globalThis.fetch;
  return { comptes, sessions, requetes, etiquettes, fetch };
}

const EMAIL = "lea@exemple.fr";
const T0 = Date.now();
const H = 3600_000;

let n = 0;
function entree(o: Partial<HistoryEntry> = {}): HistoryEntry {
  const c = String.fromCharCode(65 + (n++ % 26));
  const sorte = o.sorte ?? "recu";
  return {
    id: (c + "id").repeat(8).slice(0, 22),
    sorte,
    origine: "local",
    manage: sorte === "envoi" ? "https://shh.test/#m" + c.repeat(43) : "",
    link: sorte === "envoi" ? "" : sorte === "recu" ? "https://shh.test/#" + c.repeat(43) : "https://shh.test/#c" + c.repeat(43),
    label: sorte.startsWith("salon") ? "Équipe" : "",
    format: sorte === "recu" ? "image" : "",
    createdAt: T0 - H,
    sizeBytes: sorte === "envoi" || sorte === "recu" ? 1234 : 0,
    itemsCount: sorte === "envoi" || sorte === "recu" ? 3 : 0,
    expiresAt: T0 + 6 * H,
    maxOpens: sorte === "envoi" ? 2 : 0,
    opensUsed: 0,
    opens: [],
    state: "ready",
    lastSeenAt: T0 - H,
    endedAt: 0,
    destroyedHere: false,
    ...o,
  };
}

/** Historique de l'appareil en mémoire, au port attendu par la session. */
function fauxHistorique(init: HistoryEntry[] = []) {
  let list = [...init];
  const ecoutes = new Set<(c: { kind: "add" | "remove"; entry: HistoryEntry }) => void>();
  const f = {
    reglages: undefined as unknown,
    get list() {
      return list;
    },
    emettre(kind: "add" | "remove", entry: HistoryEntry) {
      if (kind === "add") list.push(entry);
      else list = list.filter((e) => e.id !== entry.id);
      for (const g of ecoutes) g({ kind, entry });
    },
    port: {
      lister: async () => list.map((e) => ({ ...e })),
      importer: async (es: readonly HistoryEntry[]) => {
        for (const e of es) if (!list.some((x) => linkKey(x) === linkKey(e))) list.push({ ...e });
      },
      retirer: async (ids: readonly string[]) => void (list = list.filter((e) => !ids.includes(e.id))),
      retirerCompte: async () => void (list = list.filter((e) => e.origine !== "compte")),
      ecouter: (g: (c: { kind: "add" | "remove"; entry: HistoryEntry }) => void) => {
        ecoutes.add(g);
        return () => void ecoutes.delete(g);
      },
      regler: (p: unknown) => void (f.reglages = p),
    },
  };
  return f;
}

let srv: ReturnType<typeof fauxServeur>;
let idb: FakeIdb;
let planifies: { ms: number; f: () => void; annule: boolean }[];
const derives = new Map<string, { aAuth: Uint8Array; kekMdp: Uint8Array }>();
async function deriver(mdp: string, canon: string) {
  const k = `${mdp}\0${canon}`;
  if (!derives.has(k)) derives.set(k, await deriverCompte(mdp, canon));
  const d = derives.get(k)!;
  return { aAuth: d.aAuth.slice(), kekMdp: d.kekMdp.slice() };
}
function appareil(h: ReturnType<typeof fauxHistorique>) {
  C._oublierMemoire(); // autre appareil : rien en mémoire
  C.configurerCompte({ historique: h.port });
}

/** Coffre privé tel que le serveur le garde, ouvert avec le mot de passe (comme un appareil). */
async function coffreDuServeur(mdp = MDP): Promise<CoffrePrive> {
  const c = srv.comptes.get(EMAIL)!;
  const { kekMdp } = await deriverCompte(mdp, EMAIL);
  const k = await clesDuCompte(await ouvrirEnveloppe(kekMdp, c.h, c.envMdp), c.sProfil);
  return priveDeJson(await ouvrir("prive", k.prive, c.h, c.coffres.prive.blob, c.coffres.prive.gen));
}
const liens = (p: CoffrePrive) => [...p.envois.map((e) => e.gestion), ...p.recus.map((e) => e.lien), ...p.salons.map((e) => e.invitation), ...p.rejoints.map((e) => e.invitation)];
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  srv = fauxServeur();
  idb = fakeIndexedDB();
  planifies = [];
  C.configurerCompte({
    deriver,
    net: { origin: "https://shh.test", fetch: srv.fetch },
    idb: () => idb,
    agent: () => "Firefox",
    planifier: (ms, f) => {
      const p = { ms, f, annule: false };
      planifies.push(p);
      return () => (p.annule = true);
    },
  });
});
afterEach(async () => {
  await C.seDeconnecter();
  vi.restoreAllMocks();
});

async function inscription(h: ReturnType<typeof fauxHistorique>) {
  appareil(h);
  await C.inscrire(EMAIL, "fr", PREUVE);
  await C.confirmer(CODE, MDP, profil(), false);
  await settle();
}

describe("format des entrées du coffre privé", () => {
  it("aller-retour pour les quatre sortes ; jamais de mot de passe, de nom ni d'état de relecture", () => {
    for (const sorte of ["envoi", "recu", "salon_cree", "salon_rejoint"] as const) {
      const e = entree({ sorte });
      const { liste, valeur } = versCoffre(e);
      expect(liste).toBe({ envoi: "envois", recu: "recus", salon_cree: "salons", salon_rejoint: "rejoints" }[sorte]);
      expect(Object.keys(valeur).sort()).toEqual(
        { envoi: ["id", "gestion", "cree", "expire", "taille", "elements", "ouvertures_max"], recu: ["id", "lien", "cree", "expire", "taille", "elements", "format"], salon_cree: ["id", "invitation", "libelle", "cree", "expire"], salon_rejoint: ["id", "invitation", "libelle", "cree", "expire"] }[sorte].sort(),
      );
      const back = deCoffre(liste, valeur, T0)!;
      expect(back).toMatchObject({ id: e.id, sorte, origine: "compte", manage: e.manage, link: e.link, label: e.label, format: e.format, createdAt: e.createdAt, expiresAt: e.expiresAt, state: "ready" });
    }
    expect(deCoffre("recus", { id: "x".repeat(22), lien: "https://shh.test/#m" + "a".repeat(43), cree: 1, expire: 2, taille: 1, elements: 1, format: "image" }, T0)).toBeNull();
    expect(deCoffre("recus", { id: "x".repeat(22), lien: "https://shh.test/#" + "a".repeat(43), cree: 1, expire: 2, taille: 1, elements: 1, format: "image", mot_de_passe: "x" }, T0)).not.toHaveProperty("mot_de_passe");
  });

  // Nom du partage (19 novembre) : `libelle` d'un envoi, seulement s'il y en a un ; entrée d'avant
  // (sans libellé) relue sans titre ; renommage : seul le libellé de l'entrée du même lien change.
  it("envoi : titre du partage dans le coffre (libelle), aller-retour, renommage", () => {
    const e = entree({ sorte: "envoi", label: "Contrat Dupont" });
    const { liste, valeur } = versCoffre(e);
    expect(valeur.libelle).toBe("Contrat Dupont");
    expect(deCoffre(liste, valeur, T0)!.label).toBe("Contrat Dupont");
    const sans = versCoffre(entree({ sorte: "envoi" })).valeur;
    expect(sans).not.toHaveProperty("libelle");
    expect(deCoffre("envois", sans, T0)!.label).toBe("");
    // Mal formé (trop long, commande) : entrée refusée à la relecture, comme toute entrée mal formée.
    expect(deCoffre("envois", { ...valeur, libelle: "a".repeat(81) }, T0)).toBeNull();
    expect(deCoffre("envois", { ...valeur, libelle: "a\u0000" }, T0)).toBeNull();
    expect(deCoffre("envois", { ...valeur, libelle: 5 }, T0)).toBeNull();
    const autre = entree({ sorte: "envoi" });
    const p: CoffrePrive = { salons: [], recus: [], rejoints: [], envois: [valeur, versCoffre(autre).valeur] };
    const r = renommerEntree(p, { ...e, label: "Contrat signé" });
    expect(r.envois.map((v) => v.libelle)).toEqual(["Contrat signé", undefined]);
    expect(r.envois[0]).toEqual({ ...valeur, libelle: "Contrat signé" });
    // Titre retiré : plus de libellé ; entrée absente du coffre : ajoutée.
    expect(renommerEntree(p, { ...e, label: "" }).envois[0]).not.toHaveProperty("libelle");
    const neuve = entree({ sorte: "envoi", label: "Neuve" });
    expect(renommerEntree(p, neuve).envois.map((v) => v.libelle)).toEqual(["Contrat Dupont", undefined, "Neuve"]);
  });

  it("fusion : appareil → coffre (sans doublon), coffre → appareil (origine compte), retraits et entrées finies depuis 7 jours", () => {
    const loc = entree({ sorte: "recu" });
    const commun = entree({ sorte: "envoi" });
    const ailleurs = entree({ sorte: "salon_rejoint" });
    const vieux = entree({ sorte: "recu", expiresAt: T0 - 8 * 24 * H });
    const retireAilleurs = entree({ sorte: "recu", origine: "compte" });
    const coffre: CoffrePrive = { salons: [], recus: [versCoffre(vieux).valeur], rejoints: [versCoffre(ailleurs).valeur], envois: [versCoffre({ ...commun, id: "Z".repeat(22) }).valeur] };
    const r = fusionner([loc, commun, retireAilleurs], coffre, { now: T0, recuperation: false });
    expect(r.importer.map((e) => [e.link, e.origine])).toEqual([[ailleurs.link, "compte"]]);
    expect(r.retirer).toEqual([retireAilleurs.id]);
    expect(liens(r.coffre!).sort()).toEqual([loc.link, commun.manage, ailleurs.link].sort());
    // Récupération : le coffre est neuf, tout ce que garde l'appareil y revient, rien n'est retiré.
    const r2 = fusionner([loc, retireAilleurs], { salons: [], recus: [], rejoints: [], envois: [] }, { now: T0, recuperation: true });
    expect(r2.retirer).toEqual([]);
    expect(liens(r2.coffre!).sort()).toEqual([loc.link, retireAilleurs.link].sort());
    // Rien à changer : pas d'écriture.
    expect(fusionner([], { salons: [], recus: [], rejoints: [], envois: [] }, { now: T0, recuperation: false }).coffre).toBeNull();
  });
});

describe("synchronisation de la session", () => {
  it("inscription sur un appareil qui a déjà un historique : ses entrées entrent dans le coffre privé, chiffrées", async () => {
    const a = fauxHistorique([entree({ sorte: "recu" }), entree({ sorte: "envoi" })]);
    await inscription(a);
    const p = await coffreDuServeur();
    expect(liens(p).sort()).toEqual([a.list[0]!.link, a.list[1]!.manage].sort());
    // Le serveur ne voit que le coffre chiffré : aucun lien en clair dans une requête.
    expect(JSON.stringify(srv.requetes)).not.toContain(a.list[0]!.link.slice(-43));
    expect(a.reglages).toEqual({ keepReceived: true });
  });

  it("connexion sur un autre appareil : entrées du compte reçues (origine compte), les siennes ajoutées au coffre", async () => {
    const a = fauxHistorique([entree({ sorte: "recu" })]);
    await inscription(a);
    const b = fauxHistorique([entree({ sorte: "salon_rejoint" })]);
    appareil(b);
    await C.seConnecter(EMAIL, MDP, false);
    await settle();
    expect(b.list.map((e) => e.origine).sort()).toEqual(["compte", "local"]);
    expect(C.account.recupere).toBe(false);
    expect(b.list.find((e) => e.origine === "compte")).toMatchObject({ id: a.list[0]!.id, link: a.list[0]!.link });
    expect(liens(await coffreDuServeur()).sort()).toEqual([a.list[0]!.link, b.list[0]!.link].sort());
  });

  it("événement de partage connecté : écriture du coffre différée de 2 à 12 min, retraits aussi", async () => {
    const a = fauxHistorique();
    await inscription(a);
    const puts = () => srv.requetes.filter((r) => r.method === "PUT" && r.path.endsWith("coffre/prive")).length;
    const avant = puts();
    const e = entree({ sorte: "recu" });
    a.emettre("add", e);
    await settle();
    expect(puts()).toBe(avant);
    expect(planifies).toHaveLength(1);
    expect(planifies[0]!.ms).toBeGreaterThanOrEqual(120_000);
    expect(planifies[0]!.ms).toBeLessThanOrEqual(720_000);
    planifies[0]!.f();
    await settle();
    expect(puts()).toBe(avant + 1);
    expect(liens(await coffreDuServeur())).toEqual([e.link]);
    a.emettre("remove", e);
    await settle();
    expect(planifies).toHaveLength(2);
    planifies[1]!.f();
    await settle();
    expect(liens(await coffreDuServeur())).toEqual([]);
  });

  it("une entrée retirée du compte sur un autre appareil part de celui-ci à la connexion suivante", async () => {
    const a = fauxHistorique([entree({ sorte: "recu" })]);
    await inscription(a);
    const b = fauxHistorique();
    appareil(b);
    await C.seConnecter(EMAIL, MDP, false);
    await settle();
    expect(b.list).toHaveLength(1);
    // Retirée sur A (« Retirer de la liste »), écrite dans le coffre.
    appareil(a);
    await C.seConnecter(EMAIL, MDP, false);
    await settle();
    a.emettre("remove", a.list[0]!);
    await settle();
    planifies.at(-1)!.f();
    await settle();
    appareil(b);
    await C.seConnecter(EMAIL, MDP, false);
    await settle();
    expect(b.list).toEqual([]);
  });

  it("déconnexion : entrées venues du compte retirées de l'appareil, les siennes restent ; plus d'écoute", async () => {
    const a = fauxHistorique([entree({ sorte: "recu" })]);
    await inscription(a);
    const b = fauxHistorique([entree({ sorte: "envoi" })]);
    appareil(b);
    await C.seConnecter(EMAIL, MDP, false);
    await settle();
    expect(b.list).toHaveLength(2);
    await C.seDeconnecter();
    expect(b.list.map((e) => e.origine)).toEqual(["local"]);
    expect(b.reglages).toBeNull();
    b.emettre("add", entree({ sorte: "recu" }));
    await settle();
    expect(planifies).toHaveLength(0);
  });

  it("au démarrage sans session gardée : les entrées d'une session précédente ne restent pas sur l'appareil", async () => {
    const b = fauxHistorique([entree({ sorte: "recu", origine: "compte" }), entree({ sorte: "envoi" })]);
    appareil(b);
    await C.restaurer();
    expect(b.list.map((e) => e.origine)).toEqual(["local"]);
  });

  it("mot de passe oublié : les entrées gardées sur cet appareil reviennent dans le nouveau coffre privé", async () => {
    const a = fauxHistorique([entree({ sorte: "recu" })]);
    await inscription(a);
    const b = fauxHistorique([entree({ sorte: "envoi" })]);
    appareil(b);
    await C.seConnecter(EMAIL, MDP, false);
    await settle();
    expect(b.list).toHaveLength(2); // dont l'entrée reçue sur A (origine compte)
    // Sur B, sans le mot de passe : récupération par e-mail, coffre privé neuf.
    C._oublierMemoire();
    await C.oubli.debut(EMAIL, "fr", PREUVE);
    expect(await C.oubli.verifier(CODE, "", false)).toBe("ok");
    await C.oubli.fin("un nouveau mot de passe", false);
    await settle();
    expect(C.account.recupere).toBe(true); // bandeau de l'accueil (§21.15.1)
    expect(liens(await coffreDuServeur("un nouveau mot de passe")).sort()).toEqual(b.list.map((e) => (e.sorte === "envoi" ? e.manage : e.link)).sort());
  });
});
