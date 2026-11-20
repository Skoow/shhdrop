// « Le serveur ne voit rien », étendu au compte (conception du compte §14, §21.17 ; plan du
// compte, lot 16) — CE TEST BLOQUE TOUTE MISE EN LIGNE, et toute activation de SHH_COMPTES=1.
// Vrai binaire Go (SHH_COMPTES=1), faux SMTP de la boucle locale, vrai module de compte du site
// (src/account/session.svelte.ts : Argon2id et dérivations du moteur Rust, coffres AES-GCM de
// WebCrypto). Parcours complet, avec des repères partout :
//   A : inscription (adresse à majuscules, points et « + », pseudo à accents, photo) ;
//       connexion par une variante de l'adresse ; double authentification ; connexion avec code
//       de l'application ; coffre privé rempli de liens repères ; changement de pseudo le jour
//       même, de mot de passe et d'adresse ; « adresse déjà inscrite » ; mot de passe oublié
//       (code e-mail et code de l'application) ; export ; suppression refusée (attente de 7 j).
//   C : adresse bannie depuis le tableau de bord, puis inscription refusée après le code.
//   B : inscription, salon créé avec la session, partage créé et rangé dans le coffre, export,
//       suppression totale (salon fermé pour tous, partage détruit).
// On fouille ensuite, en octets bruts, base64url/base64 et hex : le dossier de données
// (comptes.db, ses -wal/-shm, shares.db…), stdout et stderr du serveur, chaque requête et
// chaque réponse (site et tableau de bord), chaque e-mail et toute la transcription SMTP, la
// mémoire du processus. Chaque fouille a son témoin (un repère qu'on sait présent, retrouvé).
// Ce que la conception dit lisible par le serveur (profil séquestré, R-D1) est vérifié chiffré
// au repos : cle_profil, rouvert ici avec K_serveur, rend bien s_profil ; s_profil, lui,
// n'est jamais sur le disque.
import { createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deriverCompte, normaliserAdresse, type Adresse } from "../src/engine/index";
import { b64u, generatePassword, unb64u, utf8 } from "../src/engine/pure";
import { ouvrirEnveloppe } from "../src/account/keys";
import { REGLAGES_DEFAUT } from "../src/account/vaults";
import * as C from "../src/account/session.svelte";
import { loadSalonEngine } from "../src/salon/engine";
import { createShare, destroyShare } from "../src/transfer/client";
import type { HistoryEntry } from "../src/history/store";
import { solveAltcha } from "./altcha";
import { ClientSalon } from "./salon-client";
import { capturingFetch, findIn, listFiles, needle, scanDir, scanProcessMemory, type Captured, type Needle } from "./scan";
import { startServer, type TestServer } from "./server";
import { demarrerSMTP, qp, type Courriel, type FauxSMTP } from "./smtp";
import { base32, horlogeTotp } from "./totp";

type Bytes = Uint8Array<ArrayBuffer>;

const FROM = "Shhgone <ne-pas-repondre@shhgone.test>";
const SMTP_MDP = "SmtpSecretZq83vTx"; // sans sous-chaîne commune avec les mots de passe repères (il est en mémoire du serveur)
const ADMIN = "JetonAdminRepere_" + randomBytes(32).toString("base64url");
const UA = "ReperUACompte/1.0";
const IP = { a: "203.0.113.21", b: "203.0.113.22", c: "203.0.113.23" } as const;

const EMAIL_A = "Lea.ReperMailQx7+Tag@GMAIL.com"; // telle que tapée à l'inscription
const EMAIL_A_VARIANTE = "LEAREPERMAILQX7+autre@googlemail.com"; // même canonique : connexion
const EMAIL_A2 = "Nouvelle.AdresseZw5k@Exemple.fr"; // après le changement d'adresse
const EMAIL_B = "Bob.ReperBv3k@exemple.org";
const EMAIL_C = "Carole.ReperCj8m@exemple.net";
const MDP_A = "MotDePasseRepereA-Hq4z";
const MDP_A_NOUVEAU = "NouveauMdpRepere-Wk7c";
const MDP_A_RECUP = "MdpRecupRepere-Tn2x";
const MDP_B = "MotDePasseRepereB-Yv5d";
const MDP_C = "MotDePasseRepereC-Pz6m";
const PSEUDO_A = "LéaRepèreQx";
const PSEUDO_A2 = "LéoNouveauZk"; // changé le jour même de l'inscription (correction de faute)
const PSEUDO_B = "BobRepèreVw";
const PSEUDO_C = "CaroleRepèreJ";
const PHOTO_MARQUE = "PhotoRepereHt5wQ";
const LIBELLE = "LibelleSalonRepereKp2";
const LIEN_RECU = new Uint8Array(randomBytes(32)) as Bytes; // K_lien d'un partage reçu (repère)
const INVITATION = new Uint8Array(randomBytes(32)) as Bytes; // K_lien d'un salon rejoint (repère)

const fenetres = (label: string, s: string) => Array.from({ length: s.length - 7 }, (_, i) => needle(`${label}[${i}]`, s.slice(i, i + 8)));
const hk = (ikm: Uint8Array, info: string) => new Uint8Array(hkdfSync("sha256", ikm, new Uint8Array(0), info, 32)) as Bytes;
const hmac = (k: Uint8Array, ...xs: Uint8Array[]) => {
  const m = createHmac("sha256", k);
  for (const x of xs) m.update(x);
  return new Uint8Array(m.digest()) as Bytes;
};
const sha256 = (b: Uint8Array) => new Uint8Array(createHash("sha256").update(b).digest()) as Bytes;
const cat = (...xs: Uint8Array[]) => new Uint8Array(Buffer.concat(xs.map((x) => Buffer.from(x)))) as Bytes;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const octets = (label: string, b: Uint8Array) => needle(label, b as Bytes);

/** Fenêtres de `n` octets (pas de 1) de `aiguilles` présentes dans `meules`. */
function fenetresCommunes(aiguilles: Uint8Array[], meules: Buffer[], n = 32): number {
  const vues = new Set<string>();
  for (const m of meules) for (let i = 0; i + n <= m.length; i++) vues.add(m.toString("latin1", i, i + n));
  let trouvees = 0;
  for (const a of aiguilles) {
    const b = Buffer.from(a);
    for (let i = 0; i + n <= b.length; i++) if (vues.has(b.toString("latin1", i, i + n))) trouvees++;
  }
  return trouvees;
}

// --- TOTP (RFC 6238 : HMAC-SHA-1, 6 chiffres, 30 s), pour jouer l'application (e2e/totp.ts) ---

/** Un code de l'application jamais servi (le serveur refuse un pas déjà accepté, ±1 pas toléré). */
const prochainCode = horlogeTotp();

// --- Modèle unique d'e-mail (conception §21.3), décodé du quoted-printable ----------------------

const CORPS = (code: string) => `Votre code : ${code.slice(0, 3)} ${code.slice(3)}\r\nIl expire dans 15 minutes.\r\nSi vous n'avez rien demandé, ignorez ce message.\r\n`;
/** Code d'un e-mail ; vérifie au passage qu'il est EXACTEMENT le modèle (seuls Date, Message-ID et le code varient). */
function lireCode(m: Courriel, a: string): string {
  const t = m.data.toString("latin1");
  const sep = t.indexOf("\r\n\r\n");
  const entetes = t.slice(0, sep).split("\r\n");
  expect(entetes.map((l) => l.slice(0, l.indexOf(":")))).toEqual(["From", "To", "Subject", "Date", "Message-ID", "MIME-Version", "Content-Type", "Content-Transfer-Encoding"]);
  expect(entetes[0]).toBe(`From: ${FROM}`);
  expect(entetes[1]).toBe(`To: ${a}`);
  expect(entetes[2]).toBe("Subject: Votre code Shhgone");
  expect(entetes[3]).toMatch(/^Date: [A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} \+0000$/);
  expect(entetes[4]).toMatch(/^Message-ID: <[0-9a-f]{32}@shhgone\.test>$/);
  expect(entetes.slice(5)).toEqual(["MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: quoted-printable"]);
  const corps = qp(t.slice(sep + 4)).toString("utf8");
  const code = /^Votre code : (\d{3}) (\d{3})\r\n/.exec(corps);
  expect(code, "code dans l'e-mail").not.toBeNull();
  const c = code![1]! + code![2]!;
  expect(corps).toBe(CORPS(c));
  expect(m.de).toBe("ne-pas-repondre@shhgone.test");
  expect(m.a).toEqual([a]);
  expect(m.ehlo).toBe("localhost"); // ni nom de machine, ni adresse
  expect(m.auth).toBe(`\0shhgone-test\0${SMTP_MDP}`);
  return c;
}

describe("le serveur ne voit rien : compte (lot 16)", () => {
  let srv: TestServer;
  let smtp: FauxSMTP;
  const kServeur = new Uint8Array(randomBytes(32)) as Bytes;
  const kEmail = hk(kServeur, "shhdrop/v2/serveur/compte/email");
  const kPoivre = hk(kServeur, "shhdrop/v2/serveur/compte/mdp");
  const kSequestre = hk(kServeur, "shhdrop/v2/serveur/compte/sequestre");
  const kPseudo = hk(kServeur, "shhdrop/v2/serveur/compte/pseudo");
  const eCanon = (a: Adresse) => hmac(kEmail, utf8("canon"), new Uint8Array([0]), utf8(a.canon));
  const eEnvoi = (a: Adresse) => hmac(kEmail, utf8("envoi"), new Uint8Array([0]), utf8(a.exacte));
  const pEmpreinte = (pCanon: string) => hmac(kPseudo, utf8("pseudo"), new Uint8Array([0]), utf8(pCanon));

  const log: Captured[] = []; // requêtes du site (module de compte, salon, partages)
  const logAdmin: Captured[] = []; // requêtes du tableau de bord
  const captured = capturingFetch(log);
  let ip: string = IP.a;
  const marked: typeof fetch = (input, init) => {
    const h = new Headers(init?.headers);
    h.set("X-Shh-Client-IP", ip);
    h.set("User-Agent", UA);
    return captured(input, { ...init, headers: h });
  };
  const admin = (method: "GET" | "POST", path: string, body?: unknown) =>
    capturingFetch(logAdmin)(`${srv.adminOrigin}${path}`, {
      method,
      headers: { Authorization: `Bearer ${ADMIN}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const local: HistoryEntry[] = []; // historique de l'appareil (vide : le coffre privé est rempli à la main)
  const derivees: { aAuth: Bytes; kek: Bytes }[] = [];
  let nMails = 0;
  const courrier = async (a: Adresse) => lireCode(await smtp.attendre(++nMails), a.exacte);

  let adr: Record<"a" | "aVar" | "a2" | "b" | "c", Adresse>;
  const pCanon: Record<string, string> = {};
  let photo: Bytes;
  let secretTotp = "";
  const codes: string[] = [];
  let hA: Bytes, hB: Bytes;
  let sProfilA: Bytes, sProfilB: Bytes;
  const kComptes: { label: string; k: Bytes }[] = [];
  let blobPriveA: Bytes; // coffre privé de A rempli de liens, avant la récupération (perdu ensuite)
  let ligneB: Record<string, Uint8Array> = {}; // colonnes de B lues avant sa suppression
  let tvB: Uint8Array[] = []; // empreintes des sessions de B
  let salonB: { createur: ClientSalon; lien: Uint8Array; sGestion: Uint8Array; secretGestion: Uint8Array };
  let partageB: { link: string; manage: string };
  let membre: ClientSalon;
  const resultats: Record<string, unknown> = {};
  const etat: Record<string, unknown> = {};

  const body = (r: Captured) => JSON.parse(r.body.toString("utf8") || "{}") as Record<string, string>;
  const rep = (r: Captured) => JSON.parse(r.response.toString("utf8") || "{}") as Record<string, string>;
  const derniere = (route: string) => [...log].reverse().find((r) => new URL(r.url).pathname === `/api/compte/${route}`)!;
  const jetons = () => log.filter((r) => r.status < 300 && /\/api\/compte\/(inscription\/fin|connexion|connexion\/totp|oubli\/fin)$/.test(new URL(r.url).pathname)).map((r) => rep(r).session).filter((s): s is string => typeof s === "string");
  const etapes = () => log.filter((r) => r.status < 300).map((r) => rep(r).etape).filter((s): s is string => typeof s === "string");

  async function preuve(): Promise<C.Preuve> {
    const r = await marked(`${srv.origin}/api/captcha`);
    const recu = Date.now();
    const { shown_at, fallback: _f, ...defi } = (await r.json()) as Record<string, unknown>;
    const p = await solveAltcha(defi);
    await dormir(Math.max(0, recu + 3100 - Date.now()));
    if (p.kind !== "pow") throw new Error("preuve inattendue");
    return { altcha: p.payload, hp: "", shown_at: shown_at as string };
  }
  /** K_compte, rouvert ici depuis l'enveloppe envoyée et la dernière KEK_mdp calculée par le module. */
  async function kCompte(label: string, h: Uint8Array, envMdp: string) {
    for (const d of [...derivees].reverse()) {
      try {
        const k = await ouvrirEnveloppe(d.kek, h, unb64u(envMdp));
        kComptes.push({ label, k });
        return;
      } catch {
        // autre dérivation
      }
    }
    throw new Error(`K_compte de ${label} introuvable`);
  }
  async function base<T>(f: (db: import("node:sqlite").DatabaseSync) => T): Promise<T> {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(srv.dataDir, "comptes.db"), { readOnly: true });
    try {
      return f(db);
    } finally {
      db.close();
    }
  }
  const profil = (pseudo: string, ph: Bytes | null) => ({ pseudo, photo: ph, langue: "fr", reglages: { ...REGLAGES_DEFAUT }, pass: null });

  beforeAll(async () => {
    smtp = await demarrerSMTP();
    srv = await startServer({ comptes: { cle: kServeur, smtpPort: smtp.port, smtpMdp: SMTP_MDP, from: FROM, admin: ADMIN } });
    C.configurerCompte({
      net: { origin: srv.origin, fetch: marked },
      idb: () => null,
      agent: () => UA,
      planifier: () => () => undefined, // aucune écriture différée : le test écrit tout de suite
      deriver: async (m, c) => {
        const r = await deriverCompte(m, c);
        derivees.push({ aAuth: new Uint8Array(r.aAuth) as Bytes, kek: new Uint8Array(r.kekMdp) as Bytes });
        return r;
      },
      historique: {
        lister: async () => [...local],
        importer: async (es) => void local.push(...es),
        retirer: async (ids) => void local.splice(0, local.length, ...local.filter((e) => !ids.includes(e.id))),
        retirerCompte: async () => void local.splice(0, local.length, ...local.filter((e) => e.origine !== "compte")),
        ecouter: () => () => undefined,
        regler: () => undefined,
      },
      detruirePartage: (l) => destroyShare(l, srv.origin, { fetch: marked }),
      effacerAppareil: async () => undefined,
      maintenant: () => Date.now(),
    });
    const sal = await loadSalonEngine();
    for (const p of [PSEUDO_A, PSEUDO_A2, PSEUDO_B, PSEUDO_C]) pCanon[p] = sal.cleUnicite(sal.pseudoValide(p));
    adr = {
      a: await normaliserAdresse(EMAIL_A),
      aVar: await normaliserAdresse(EMAIL_A_VARIANTE),
      a2: await normaliserAdresse(EMAIL_A2),
      b: await normaliserAdresse(EMAIL_B),
      c: await normaliserAdresse(EMAIL_C),
    };
    expect(adr.aVar.canon).toBe(adr.a.canon);
    expect(adr.aVar.exacte).not.toBe(adr.a.exacte);
    photo = new Uint8Array(randomBytes(3000)) as Bytes;
    for (const o of [0, 1000, 2900 - PHOTO_MARQUE.length]) photo.set(utf8(PHOTO_MARQUE), o);

    // ---- A : inscription (adresse libre), pseudo vérifié pendant la saisie --------------------
    ip = IP.a;
    await C.inscrire(EMAIL_A, "fr", await preuve());
    hA = unb64u(rep(derniere("inscription/debut")).h!);
    codes.push(await courrier(adr.a));
    expect(await C.pseudoLibre(PSEUDO_A)).toBe(true);
    await C.confirmer(codes.at(-1)!, MDP_A, profil(PSEUDO_A, photo), false);
    sProfilA = unb64u(body(derniere("inscription/fin")).s_profil!);
    await kCompte("K_compte de A", hA, body(derniere("inscription/fin")).env_mdp!);
    expect(C.account.etat).toBe("ouvert");
    await C.seDeconnecter();

    // ---- Connexion par une variante de l'adresse, double authentification -------------------
    expect(await C.seConnecter(EMAIL_A_VARIANTE, MDP_A, false)).toBe("ouvert");
    expect(C.account.profil?.pseudo).toBe(PSEUDO_A);
    expect(C.account.profil?.photo).toEqual(photo);
    const t = await C.totpCommencer();
    secretTotp = t.secret;
    expect(t.lien).toBe(`otpauth://totp/Shhgone?secret=${t.secret}&issuer=Shhgone&algorithm=SHA1&digits=6&period=30`);
    await C.totpActiver(await prochainCode(secretTotp));
    await C.seDeconnecter();
    expect(await C.seConnecter(EMAIL_A, MDP_A, false)).toBe("totp");
    await C.validerTotp(await prochainCode(secretTotp));

    // ---- Coffre privé : liens repères (reçu, salon rejoint) ; pseudo corrigé le jour même ---
    const now = Date.now();
    await C.ecrirePrive(
      (p) => ({
        ...p,
        recus: [...p.recus, { id: "recu-1", cree: now, expire: now + 3_600_000, lien: `${srv.origin}/s#${b64u(LIEN_RECU)}`, taille: 10, elements: 1, format: "texte" }],
        rejoints: [...p.rejoints, { id: "salon-1", cree: now, expire: now + 3_600_000, invitation: `${srv.origin}/#c${b64u(INVITATION)}`, libelle: LIBELLE }],
      }),
      { differe: false },
    );
    blobPriveA = unb64u(body([...log].reverse().find((r) => r.method === "PUT" && r.url.endsWith("/api/compte/coffre/prive"))!).blob!);
    expect(await C.pseudoLibre(PSEUDO_A2)).toBe(true);
    await C.changerPseudo(PSEUDO_A2); // le jour de l'inscription : permis (premier changement)
    await expect(C.changerPseudo(PSEUDO_A)).rejects.toMatchObject({ code: "limit" }); // le deuxième attend demain

    // ---- Mot de passe, puis adresse (code à la NOUVELLE adresse seulement) -------------------
    await C.changerMotDePasse(MDP_A_NOUVEAU);
    await kCompte("K_compte de A (nouveau mot de passe)", hA, body(derniere("mdp")).env_mdp!);
    await C.changementAdresse.debut(EMAIL_A2, "fr");
    codes.push(await courrier(adr.a2));
    await C.changementAdresse.fin(codes.at(-1)!, MDP_A_NOUVEAU, await prochainCode(secretTotp));
    await kCompte("K_compte de A (nouvelle adresse)", hA, body(derniere("email/fin")).env_mdp!);
    etat.expA = JSON.parse(await C.exporterDonnees());
    await C.seDeconnecter();

    // ---- Adresse déjà inscrite : même e-mail, refus seulement après le code juste -----------
    await C.inscrire(EMAIL_A2, "fr", await preuve());
    codes.push(await courrier(adr.a2));
    resultats.prise = await C.confirmer(codes.at(-1)!, MDP_C, profil(PSEUDO_C, null), false).catch((e: unknown) => e);

    // ---- Mot de passe oublié : code e-mail + code de l'application ------------------------------
    await C.oubli.debut(EMAIL_A2, "fr", await preuve());
    codes.push(await courrier(adr.a2));
    expect(await C.oubli.verifier(codes.at(-1)!, await prochainCode(secretTotp), false)).toBe("ok");
    await C.oubli.fin(MDP_A_RECUP, false);
    await kCompte("K_compte de A (récupération)", hA, body(derniere("oubli/fin")).env_mdp!);
    expect(C.account.profil?.pseudo).toBe(PSEUDO_A2); // profil gardé par le séquestre
    expect(C.account.profil?.photo).toEqual(photo);
    expect(C.account.prive).toEqual({ salons: [], recus: [], rejoints: [], envois: [] }); // coffre privé perdu
    etat.etatA = await C.etatCompte();
    etat.expA2 = JSON.parse(await C.exporterDonnees());
    const it = C.supprimerTout({ effacerAppareil: false });
    resultats.supprimerApresRecup = await it.next().catch((e: unknown) => e);
    // Le serveur refuse aussi, de lui-même (pas seulement l'écran).
    const sessionA = rep(derniere("oubli/fin")).session!;
    const r = await marked(`${srv.origin}/api/compte/supprimer`, { method: "POST", headers: { "X-Shh-Session": sessionA, "Content-Type": "application/json" }, body: "{}" });
    resultats.supprimerServeur = { status: r.status, corps: await r.json() };
    await C.seDeconnecter();

    // ---- C : adresse bannie depuis le tableau de bord ---------------------------------------
    ip = IP.c;
    const ban = await admin("POST", "/api/bannir", { email: EMAIL_C, duree_jours: 30, motif: 6 });
    expect(ban.status).toBe(200);
    await C.inscrire(EMAIL_C, "fr", await preuve());
    codes.push(await courrier(adr.c));
    resultats.bannie = await C.confirmer(codes.at(-1)!, MDP_C, profil(PSEUDO_C, null), false).catch((e: unknown) => e);

    // ---- B : inscription, salon avec la session, partage rangé dans le coffre, suppression ---
    ip = IP.b;
    await C.inscrire(EMAIL_B, "fr", await preuve());
    hB = unb64u(rep(derniere("inscription/debut")).h!);
    codes.push(await courrier(adr.b));
    await C.confirmer(codes.at(-1)!, MDP_B, profil(PSEUDO_B, null), false);
    sProfilB = unb64u(body(derniere("inscription/fin")).s_profil!);
    await kCompte("K_compte de B", hB, body(derniere("inscription/fin")).env_mdp!);
    const sessionB = rep(derniere("inscription/fin")).session!;
    salonB = await ClientSalon.creer({ origin: srv.origin, fetch: marked }, { maxMembers: 4, session: sessionB });
    membre = await ClientSalon.rejoindre({ origin: srv.origin, fetch: marked }, salonB.lien, "Kq7!mP2#x?a");
    await Promise.all([salonB.createur.attendreMembres([0, 1]), membre.attendreMembres([0, 1])]);
    partageB = await createShare(srv.origin, [{ kind: "text", name: "", mime: "text/plain", data: utf8("texte du partage de B") }], {
      ttlHours: 1,
      maxOpens: 1,
      password: generatePassword(),
      solveCaptcha: solveAltcha,
      fetch: marked,
    });
    const n2 = Date.now();
    await C.ecrirePrive(
      (p) => ({
        ...p,
        envois: [...p.envois, { id: "envoi-1", cree: n2, expire: n2 + 3_600_000, gestion: partageB.manage, taille: 30, elements: 1, ouvertures_max: 1 }],
        salons: [...p.salons, { id: "salon-b", cree: n2, expire: n2 + 3_600_000, invitation: `${srv.origin}/#c${b64u(salonB.lien as Bytes)}`, libelle: LIBELLE }],
      }),
      { differe: false },
    );
    etat.salonsB = await (await marked(`${srv.origin}/api/compte/salons`, { headers: { "X-Shh-Session": sessionB } })).json();
    etat.expB = JSON.parse(await C.exporterDonnees());
    expect(await C.partagesASupprimer()).toBe(1);
    // Ligne de B et empreintes de ses sessions, lues avant la suppression (pour vérifier ensuite qu'il n'en reste rien).
    [ligneB, tvB] = await base((db) => {
      const l = db.prepare("SELECT * FROM comptes WHERE h = ?").get(hB) as Record<string, Uint8Array | number | null>;
      const s = db.prepare("SELECT t_v FROM sessions WHERE h = ?").all(hB) as { t_v: Uint8Array }[];
      const blobs = Object.fromEntries(Object.entries(l).filter(([, v]) => v instanceof Uint8Array)) as Record<string, Uint8Array>;
      return [blobs, s.map((x) => x.t_v)] as const;
    });
    etat.avantSuppression = await base((db) => ({
      comptes: (db.prepare("SELECT count(*) AS n FROM comptes").get() as { n: number }).n,
      sessionsB: tvB.length,
    }));
    const etapesSuppr: C.Progres[] = [];
    for await (const p of C.supprimerTout({ effacerAppareil: false })) etapesSuppr.push(p);
    resultats.suppression = etapesSuppr.at(-1);
    resultats.fermetureSalon = await membre.attendreFermeture();
    resultats.partageApres = (await marked(`${srv.origin}/api/manage/status`, { headers: { "X-Shh-Manage": partageB.manage.split("#m")[1]! } })).status;
    resultats.sessionBApres = (await marked(`${srv.origin}/api/compte`, { headers: { "X-Shh-Session": sessionB } })).status;

    // ---- Tableau de bord : agrégats, bannis, salons signalés -------------------------------
    for (const [m, p, b] of [["GET", "/api/comptes"], ["POST", "/api/bannis", { filtre: "", page: 0 }], ["GET", "/api/signalements"], ["GET", "/api/etat"]] as const) {
      const r = await admin(m, p, b);
      expect(r.status, p).toBe(200);
    }
    etat.apresSuppression = await base((db) => ({
      comptes: (db.prepare("SELECT count(*) AS n FROM comptes").get() as { n: number }).n,
      bannis: (db.prepare("SELECT count(*) AS n FROM bannis").get() as { n: number }).n,
      dates: db.prepare("SELECT cree_jour, compte_des, pseudo_jour, vu_mois, recup_jour, totp_retrait_jour FROM comptes").all(),
      sessions: db.prepare("SELECT expire_jour, cree_mois FROM sessions").all(),
      bannisDates: db.prepare("SELECT debut_jour, jusqu_jour FROM bannis").all(),
      colonnes: db.prepare("SELECT m.name AS t, p.name AS c, p.type AS ty FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type = 'table' ORDER BY 1, p.cid").all(),
      cleProfilA: (db.prepare("SELECT cle_profil FROM comptes WHERE h = ?").get(hA) as { cle_profil: Uint8Array }).cle_profil,
      totpA: (db.prepare("SELECT totp FROM comptes WHERE h = ?").get(hA) as { totp: Uint8Array | null }).totp,
    }));
  }, 300_000);

  afterAll(async () => {
    await membre?.fermer().catch(() => undefined);
    await salonB?.createur.fermer().catch(() => undefined);
    await srv?.dispose();
    await smtp?.fermer();
  });

  // --- Repères ---------------------------------------------------------------------------------

  const emails = () => {
    const out: Needle[] = [];
    for (const [k, brut] of [["A", EMAIL_A], ["A (variante)", EMAIL_A_VARIANTE], ["A2", EMAIL_A2], ["B", EMAIL_B], ["C", EMAIL_C]] as const) {
      const a = { A: adr.a, "A (variante)": adr.aVar, A2: adr.a2, B: adr.b, C: adr.c }[k];
      out.push(needle(`adresse ${k} (tapée)`, brut), needle(`adresse ${k} (exacte)`, a.exacte), needle(`adresse ${k} (canonique)`, a.canon));
      out.push(needle(`adresse ${k} (partie locale)`, a.exacte.split("@")[0]!.replace(/[.+]/g, "").slice(0, 12)));
    }
    return out;
  };
  const mdps = () => [MDP_A, MDP_A_NOUVEAU, MDP_A_RECUP, MDP_B, MDP_C].flatMap((m, i) => [needle(`mot de passe ${i}`, m), ...fenetres(`mot de passe ${i}`, m)]);
  const pseudosAffiches = () => [PSEUDO_A, PSEUDO_A2, PSEUDO_B, PSEUDO_C].flatMap((p) => [needle(`pseudo « ${p} »`, p), ...fenetres(`pseudo « ${p} »`, p)]);
  const pseudosCanon = () => Object.entries(pCanon).map(([p, c]) => needle(`p_canon de « ${p} »`, c));
  const photoN = () => [needle("photo (marque)", PHOTO_MARQUE), ...[100, 400, 1500, 2500].map((o) => octets(`photo [${o}]`, photo.subarray(o, o + 32)))];
  const liens = () => [
    octets("K_lien reçu", LIEN_RECU),
    octets("invitation rejointe", INVITATION),
    needle("libellé", LIBELLE),
    ...fenetres("libellé", LIBELLE),
    octets("K_lien du salon de B", salonB.lien),
    octets("secret de gestion du salon de B", salonB.secretGestion),
    needle("lien de gestion du partage de B", partageB.manage.split("#m")[1]!),
    needle("lien du partage de B", partageB.link.split("#")[1]!),
  ];
  const ips = () => Object.values(IP).flatMap((x) => [needle(`IP ${x}`, x), { label: `IP ${x} (4 octets)`, forms: [Buffer.from(x.split(".").map(Number))] }]);
  const cles = () => [
    ...kComptes.map((x) => octets(x.label, x.k)),
    ...derivees.flatMap((d, i) => [octets(`KEK_mdp ${i}`, d.kek), octets(`A_auth ${i}`, d.aAuth)]),
    octets("s_profil de A", sProfilA),
    octets("s_profil de B", sProfilB),
    needle("secret TOTP (base32)", secretTotp),
    octets("secret TOTP", base32(secretTotp)),
    octets("K_serveur", kServeur),
    needle("mot de passe SMTP", SMTP_MDP),
    needle("jeton d'administration", ADMIN),
    needle("User-Agent", UA),
  ];
  const jetonsN = () => [
    ...jetons().flatMap((t, i) => [needle(`jeton de session ${i}`, t), octets(`jeton de session ${i} (octets)`, unb64u(t))]),
    ...etapes().flatMap((t, i) => [needle(`étape ${i}`, t), octets(`étape ${i} (octets)`, unb64u(t))]),
  ];
  /** Jamais nulle part sur le disque ni dans les sorties du serveur. */
  const interdits = () => [...emails(), ...mdps(), ...pseudosAffiches(), ...pseudosCanon(), ...photoN(), ...liens(), ...ips(), ...cles(), ...jetonsN()];
  /** Jamais dans la mémoire du serveur : ce qu'il ne reçoit jamais. */
  const jamaisRecus = () => [...mdps(), ...pseudosAffiches(), ...photoN(), octets("K_lien reçu", LIEN_RECU), octets("invitation rejointe", INVITATION), needle("libellé", LIBELLE), ...kComptes.map((x) => octets(x.label, x.k)), ...derivees.map((d, i) => octets(`KEK_mdp ${i}`, d.kek))];
  /** Ce que garde la base pour A, C (témoins) ; pour B, rien après sa suppression. */
  const vMdp = (h: Uint8Array, aAuth: Uint8Array) => hmac(kPoivre, h, aAuth);
  const temoinsA = () => [
    octets("h de A", hA),
    octets("e_canon de A2", eCanon(adr.a2)),
    octets("e_envoi de A2", eEnvoi(adr.a2)),
    octets("p_empreinte de A (pseudo changé)", pEmpreinte(pCanon[PSEUDO_A2]!)),
    octets("v_mdp de A (après récupération)", vMdp(hA, unb64u(body(derniere("oubli/fin")).a_auth!))),
    octets("e_canon de C (banni)", eCanon(adr.c)),
  ];
  const disparusB = () => [
    octets("h de B", hB),
    octets("e_canon de B", eCanon(adr.b)),
    octets("e_envoi de B", eEnvoi(adr.b)),
    octets("p_empreinte de B", pEmpreinte(pCanon[PSEUDO_B]!)),
    ...Object.entries(ligneB).filter(([k]) => k !== "h").map(([k, v]) => octets(`${k} de B`, v.subarray(0, Math.min(v.length, 60)))),
    ...tvB.map((t, i) => octets(`session ${i} de B (t_v)`, t)),
  ];
  const anciensA = () => [
    octets("e_canon de A avant le changement d'adresse", eCanon(adr.a)),
    octets("e_envoi de A avant le changement d'adresse", eEnvoi(adr.a)),
    octets("p_empreinte de A avant le changement de pseudo", pEmpreinte(pCanon[PSEUDO_A]!)),
    octets("v_mdp de A (premier mot de passe)", vMdp(hA, unb64u(body(log.find((r) => r.url.endsWith("/api/compte/inscription/fin") && r.status === 201)!).a_auth!))),
  ];
  const disque = () => listFiles(srv.dataDir).map((f) => readFileSync(f));

  // --- Parcours ---------------------------------------------------------------------------------

  it("parcours : chaque étape a eu l'effet attendu", () => {
    expect(resultats.prise).toMatchObject({ status: 409, code: "deja_inscrit" });
    expect(resultats.bannie).toMatchObject({ status: 403, code: "banni" });
    expect(resultats.supprimerApresRecup).toMatchObject({ status: 403, code: "attente" });
    expect(resultats.supprimerServeur).toMatchObject({ status: 403, corps: { error: "attente" } });
    expect(etat.etatA).toMatchObject({ totp: true, recupJusqu: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), banniJusqu: null });
    expect(resultats.suppression).toEqual({ etape: "fini", salonsFermes: 1, partagesDetruits: 1, partagesEchoues: 0 });
    expect(resultats.fermetureSalon).toBe(1000); // salon de B fermé pour son autre membre
    expect(resultats.partageApres).toBe(404); // partage de B détruit
    expect(resultats.sessionBApres).toBe(401);
    expect((etat.salonsB as { salons: unknown[] }).salons).toHaveLength(1);
    expect(etat.avantSuppression).toEqual({ comptes: 2, sessionsB: 1 });
    expect(etat.apresSuppression).toMatchObject({ comptes: 1, bannis: 1 });
    expect(smtp.recus).toHaveLength(6); // A (libre), A2 (nouvelle adresse), A2 (prise), A2 (récupération), C (bannie), B (libre)
  });

  it("e-mails : exactement le modèle unique, le code seul, dans les cinq cas ; rien d'autre dans la transcription SMTP", () => {
    const attendus = [adr.a, adr.a2, adr.a2, adr.a2, adr.c, adr.b];
    smtp.recus.forEach((m, i) => expect(lireCode(m, attendus[i]!.exacte)).toBe(codes[i]));
    // Octet pour octet : une fois Date, Message-ID, destinataire et code remplacés, tous identiques.
    const gabarits = smtp.recus.map((m, i) =>
      m.data
        .toString("latin1")
        .replace(/^Date: .*$/m, "Date: X")
        .replace(/^Message-ID: .*$/m, "Message-ID: X")
        .replace(`To: ${attendus[i]!.exacte}`, "To: X")
        .replace(`${codes[i]!.slice(0, 3)} ${codes[i]!.slice(3)}`, "C"),
    );
    expect(new Set(gabarits).size).toBe(1);
    // Ni pseudo, ni lien, ni adresse du site, ni identifiant, ni autre adresse que le destinataire.
    const tr = smtp.transcription();
    const site = [needle("origine du site", srv.origin), needle("hôte du site", new URL(srv.origin).host), { label: "http", forms: [Buffer.from("http")] }, { label: "dièse", forms: [Buffer.from("#")] }];
    const ids = [octets("h de A", hA), octets("h de B", hB), ...jetonsN(), ...pseudosAffiches(), ...pseudosCanon(), ...photoN(), ...liens(), ...ips(), needle("User-Agent", UA), ...mdps()];
    smtp.recus.forEach((m, i) => {
      expect(findIn(m.data, [...ids, ...site]), `e-mail ${i}`).toEqual([]);
      // Aucune adresse sauf la forme exacte du destinataire (En-tête To) : ni la tapée, ni la canonique, ni une autre.
      const autres = emails().filter((n) => !n.forms[0]!.equals(Buffer.from(attendus[i]!.exacte)));
      expect(findIn(m.data, autres), `e-mail ${i}`).toEqual([]);
    });
    expect(findIn(tr, [...ids, needle("origine du site", srv.origin)])).toEqual([]);
    // Témoin : la fouille retrouve bien le code et le destinataire dans la transcription.
    expect(findIn(tr, [needle("code", `${codes[0]!.slice(0, 3)} ${codes[0]!.slice(3)}`), needle("destinataire", adr.b.exacte)])).toEqual(["code", "destinataire"]);
  });

  it("disque : aucun repère (comptes.db, -wal, -shm, shares.db…) ; témoins retrouvés", () => {
    const fichiers = listFiles(srv.dataDir).map((f) => f.slice(srv.dataDir.length + 1));
    expect(fichiers.some((f) => f === "comptes.db")).toBe(true);
    expect(fichiers.some((f) => f === "shares.db")).toBe(true);
    expect(scanDir(srv.dataDir, interdits())).toEqual([]);
    const trouves = scanDir(srv.dataDir, temoinsA()).map((h) => h.slice(h.lastIndexOf(" : ") + 3));
    for (const n of temoinsA()) expect(trouves, n.label).toContain(n.label);
  });

  it("profil séquestré : chiffré au repos ; cle_profil rouvert avec K_serveur rend s_profil", () => {
    const a = etat.apresSuppression as { cleProfilA: Uint8Array; totpA: Uint8Array | null };
    const c = Buffer.from(a.cleProfilA);
    expect(c.length).toBe(60);
    const d = createDecipheriv("aes-256-gcm", kSequestre, c.subarray(0, 12));
    d.setAAD(cat(utf8("SHH-CSEQ1"), hA));
    d.setAuthTag(c.subarray(44));
    expect(new Uint8Array(Buffer.concat([d.update(c.subarray(12, 44)), d.final()]))).toEqual(sProfilA);
    // s_profil, les coffres en clair (pseudo, photo, liens) ne sont nulle part ; le coffre de profil
    // est bien sur le disque, chiffré (témoin : son en-tête « SHH-PROF1 » et sa taille de palier).
    expect(scanDir(srv.dataDir, [octets("s_profil de A", sProfilA)])).toEqual([]);
    expect(findIn(Buffer.concat(disque()), [needle("SHH-PROF1", "SHH-PROF1"), needle("SHH-ACCT1", "SHH-ACCT1")]).sort()).toEqual(["SHH-ACCT1", "SHH-PROF1"]);
    // Secret TOTP : 48 octets scellés, jamais le secret.
    expect(a.totpA?.length).toBe(48);
  });

  it("base : seulement des BLOB et des INTEGER ; dates au jour (multiples de 86 400) ou au mois", () => {
    const a = etat.apresSuppression as {
      colonnes: { t: string; c: string; ty: string }[];
      dates: Record<string, number | null>[];
      sessions: { expire_jour: number; cree_mois: number }[];
      bannisDates: { debut_jour: number; jusqu_jour: number }[];
    };
    expect(a.colonnes.length).toBeGreaterThan(20);
    for (const x of a.colonnes) expect(["BLOB", "INTEGER"], `${x.t}.${x.c}`).toContain(x.ty);
    const jour = (v: number | null) => v === null || v % 86_400 === 0;
    const mois = (v: number) => new Date(v * 1000).toISOString().endsWith("-01T00:00:00.000Z");
    for (const l of a.dates) {
      for (const k of ["cree_jour", "compte_des", "pseudo_jour", "recup_jour", "totp_retrait_jour"]) expect(jour(l[k] as number | null), k).toBe(true);
      expect(mois(l.vu_mois as number)).toBe(true);
      expect(l.recup_jour).not.toBeNull(); // récupération de A
      expect(l.pseudo_jour).toBe(Math.floor(Date.now() / 86_400_000) * 86_400); // pseudo changé aujourd'hui
    }
    for (const s of a.sessions) expect(jour(s.expire_jour) && mois(s.cree_mois)).toBe(true);
    for (const b of a.bannisDates) expect(jour(b.debut_jour) && jour(b.jusqu_jour)).toBe(true);
  });

  it("requêtes et réponses : aucun repère hors de la place que le protocole lui donne ; X-Shh-Session seulement vers /api/compte/* et POST /api/salons", () => {
    const hits: string[] = [];
    const avecEmail = /^\/api\/compte\/(inscription\/debut|inscription\/renvoyer|connexion|oubli\/debut|oubli\/renvoyer|email\/debut|email\/renvoyer)$/;
    const avecPCanon = /^\/api\/compte\/(inscription\/fin|pseudo\/verifier|pseudo)$/;
    for (const r of log) {
      const chemin = new URL(r.url).pathname;
      const ou = `${r.method} ${chemin}`;
      for (const l of findIn(Buffer.from(r.url), interdits())) hits.push(`${ou} URL : ${l}`);
      for (const [k, v] of r.headers) {
        if (k === "x-shh-session") {
          if (!chemin.startsWith("/api/compte") && !(chemin === "/api/salons" && r.method === "POST")) hits.push(`${ou} : X-Shh-Session hors des routes permises`);
          continue;
        }
        for (const l of findIn(Buffer.from(`${k}: ${v}`), [...emails(), ...mdps(), ...pseudosAffiches(), ...pseudosCanon(), ...photoN(), ...cles().filter((n) => !n.label.startsWith("User-Agent")), ...jetonsN()])) hits.push(`${ou} en-tête ${k} : ${l}`);
      }
      const corps = [...mdps(), ...pseudosAffiches(), ...photoN(), ...liens(), ...kComptes.map((x) => octets(x.label, x.k)), ...derivees.map((d, i) => octets(`KEK_mdp ${i}`, d.kek)), ...cles().filter((n) => n.label.startsWith("secret TOTP"))];
      if (!avecEmail.test(chemin)) corps.push(...emails());
      if (!avecPCanon.test(chemin)) corps.push(...pseudosCanon());
      for (const l of findIn(r.body, corps)) hits.push(`${ou} corps : ${l}`);
      const reponse = Buffer.concat([r.response, Buffer.from(r.responseHeaders)]);
      const repN = [...emails(), ...mdps(), ...pseudosAffiches(), ...pseudosCanon(), ...photoN(), ...liens(), ...ips(), ...kComptes.map((x) => octets(x.label, x.k)), ...derivees.flatMap((d, i) => [octets(`KEK_mdp ${i}`, d.kek), octets(`A_auth ${i}`, d.aAuth)])];
      if (chemin !== "/api/compte/totp/debut") repN.push(needle("secret TOTP (base32)", secretTotp), octets("secret TOTP", base32(secretTotp)));
      for (const l of findIn(reponse, repN)) hits.push(`${ou} réponse : ${l}`);
    }
    expect(hits).toEqual([]);
    // Témoins : le jeton est bien parti vers POST /api/salons ; l'adresse dans le corps de la connexion ; le secret TOTP dans totp/debut.
    expect(log.some((r) => r.url.endsWith("/api/salons") && r.method === "POST" && r.headers.some(([k]) => k === "x-shh-session"))).toBe(true);
    expect(log.some((r) => r.url.endsWith("/api/compte/connexion") && findIn(r.body, [needle("adresse", adr.aVar.exacte)]).length === 1)).toBe(true);
    expect(log.some((r) => r.url.endsWith("/api/compte/totp/debut") && findIn(r.response, [needle("secret", secretTotp)]).length === 1)).toBe(true);
  });

  it("export : sans adresse, sans lien, sans secret", () => {
    for (const k of ["expA", "expA2", "expB"]) {
      const b = Buffer.from(JSON.stringify(etat[k]));
      // Le libellé local d'un salon est une donnée de la personne : il est exporté, sans le lien.
      expect(findIn(b, [...emails(), ...mdps(), ...liens().filter((n) => !n.label.startsWith("libellé")), ...jetonsN(), ...cles()]), k).toEqual([]);
    }
    expect((etat.expA as { profil: { pseudo: string } }).profil.pseudo).toBe(PSEUDO_A2); // témoin : le profil y est
  });

  it("tableau de bord : jamais une adresse, une empreinte, un h, un pseudo ni un lien", () => {
    expect(logAdmin.length).toBe(5);
    const tous = [...emails(), ...pseudosAffiches(), ...pseudosCanon(), ...temoinsA(), ...disparusB(), ...anciensA(), ...liens(), ...ips(), ...jetonsN()];
    for (const r of logAdmin) {
      const ou = `${r.method} ${new URL(r.url).pathname}`;
      expect(findIn(Buffer.concat([r.response, Buffer.from(r.responseHeaders)]), tous), ou).toEqual([]);
    }
    // Témoin : les agrégats comptent bien un compte et un bannissement.
    const ag = JSON.parse(logAdmin.find((r) => r.url.endsWith("/api/comptes"))!.response.toString("utf8")) as Record<string, unknown>;
    expect(JSON.stringify(ag)).toMatch(/\d/);
  });

  it("mémoire du processus serveur : ni mot de passe, ni KEK, ni K_compte, ni pseudo affiché, ni photo, ni lien du coffre privé", async () => {
    const res = await scanProcessMemory(srv.pid, jamaisRecus());
    if (!res.ok) {
      const why = `lecture de /proc/${srv.pid}/mem impossible (${res.why})`;
      if (process.env.CI) throw new Error(`[le serveur ne voit rien : compte] fouille mémoire obligatoire en CI : ${why}`);
      console.warn(`[le serveur ne voit rien : compte] fouille mémoire IGNORÉE (hors CI) : ${why}`);
      return;
    }
    expect(res.rwRegions).toBeGreaterThan(0);
    expect(res.rwFailedBytes).toBeLessThanOrEqual(res.rwBytes / 2);
    expect(res.hits).toEqual([]);
    // Témoin : l'empreinte d'adresse de A2 (pages de comptes.db dans le cache de SQLite) est retrouvée.
    const ctl = await scanProcessMemory(srv.pid, [octets("e_canon de A2", eCanon(adr.a2))]);
    expect(ctl.ok && ctl.hits).toEqual(["e_canon de A2"]);
  });

  it("après suppression puis arrêt : rien de B, rien des anciennes valeurs de A ; aucun repère ; stdout et stderr propres", async () => {
    await srv.stop();
    const fichiers = disque();
    expect(scanDir(srv.dataDir, [...disparusB(), ...anciensA()])).toEqual([]);
    expect(fenetresCommunes([...Object.values(ligneB), blobPriveA], fichiers)).toBe(0);
    expect(scanDir(srv.dataDir, interdits())).toEqual([]);
    // Témoins : A et le bannissement de C sont toujours là.
    const trouves = scanDir(srv.dataDir, temoinsA()).map((h) => h.slice(h.lastIndexOf(" : ") + 3));
    for (const n of temoinsA()) expect(trouves, n.label).toContain(n.label);
    const tous = [...interdits(), ...temoinsA(), ...disparusB(), ...anciensA(), ...codes.map((c, i) => needle(`code e-mail ${i}`, c))];
    expect(findIn(srv.stdout(), tous)).toEqual([]);
    expect(findIn(srv.stderr(), tous)).toEqual([]);
    expect(srv.stdout().toString("utf8")).toMatch(/^SHH_LISTENING 127\.0\.0\.1:\d+\nSHH_ADMIN_LISTENING 127\.0\.0\.1:\d+\n$/);
    // sha256 utilisé : t_v = SHA-256 du jeton (témoin de la forme gardée).
    expect(tvB.length === 0 || Buffer.from(tvB[0]!).equals(Buffer.from(sha256(unb64u(rep(log.find((r) => r.url.endsWith("/api/compte/inscription/fin") && r.status === 201 && body(r).p_canon === pCanon[PSEUDO_B])!).session!))))).toBe(true);
  });
});
