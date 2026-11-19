// Client de PRODUCTION du salon (web/src/salon/client.ts, plan C-3 Task 3) contre le vrai binaire
// Go (SHH_SALONS=1) et le vrai module du salon, sous Node : création (preparer), entrée, trois
// membres qui échangent des messages chiffrés dans les deux sens, accusés, reconnexion avec
// `depuis` sans perte ni doublon, reprise (nouvelle identité au même siège), départ. Les
// parcours par l'interface, dans de vrais navigateurs : web/ui-e2e/salon.spec.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { passwordKey, generatePassword } from "../src/engine";
import { loadSalonEngine, type SalonEngine } from "../src/salon/engine";
import { ClientSalon, type EvClient, type WsLike } from "../src/salon/client";
import { preparer } from "../src/salon/creation";
import * as api from "../src/salon/api";
import { solveAltcha } from "./altcha";
import { startServer, type TestServer } from "./server";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Membre = { c: ClientSalon; evs: EvClient[]; ws: () => WsLike | undefined };

function deps(srv: TestServer, eng: SalonEngine, garde: { ws?: WsLike }) {
  return {
    net: { origin: srv.origin, fetch: (...a: Parameters<typeof fetch>) => fetch(...a) },
    eng,
    ouvrirWS: (url: string) => {
      const ws = new WebSocket(url, { headers: { Origin: srv.origin } } as never) as unknown as WsLike;
      garde.ws = ws;
      return ws;
    },
  };
}

async function attendre(m: Membre, pred: (e: EvClient) => boolean, ms = 30_000): Promise<EvClient> {
  const fin = Date.now() + ms;
  for (;;) {
    const e = m.evs.find(pred);
    if (e) return e;
    if (Date.now() > fin) throw new Error(`attente dépassée (siège ${m.c.siege}) : ${JSON.stringify(m.evs.map((x) => x.k))}`);
    await dormir(20);
  }
}
const texteRecu = (x: string) => (e: EvClient) => e.k === "message" && e.enveloppe.message.k === "texte" && e.enveloppe.message.x === x;

describe("salon : client de production, vrai serveur", () => {
  let srv: TestServer;
  let eng: SalonEngine;
  const membres: Membre[] = [];
  let kLien: Uint8Array;
  let mdp: string;

  beforeAll(async () => {
    srv = await startServer({ salons: true });
    eng = await loadSalonEngine();
  });
  afterAll(async () => {
    for (const m of membres) m.c.fermer();
    await srv?.dispose();
  });

  async function membre(o: { kLien: Uint8Array; mdp: string; sGestion?: Uint8Array; creerGroupe?: boolean; cles?: ReturnType<SalonEngine["clesSalon"]> }): Promise<Membre> {
    let cles = o.cles;
    if (!cles) {
      const acces = eng.cleAcces(o.kLien);
      const meta = await api.meta({ origin: srv.origin, fetch }, acces.k);
      const kMdp = await passwordKey(o.mdp, meta.salt, { ops: meta.kdfOps, mem: meta.kdfMem });
      cles = eng.clesSalon(o.kLien, kMdp);
      kMdp.fill(0);
    }
    const garde: { ws?: WsLike } = {};
    const evs: EvClient[] = [];
    const { client } = await ClientSalon.entrer(deps(srv, eng, garde), { kLien: o.kLien, cles, sGestion: o.sGestion, creerGroupe: o.creerGroupe });
    client.ecouter((e) => evs.push(e));
    const m = { c: client, evs, ws: () => garde.ws };
    membres.push(m);
    return m;
  }

  it("création, puis deux invités ajoutés au groupe, messages dans tous les sens", async () => {
    mdp = generatePassword();
    const p = await preparer(eng, mdp, { ttlHours: 1, maxMembers: 4, membersCanDestroy: false });
    kLien = p.kLien.slice();
    secret.sGestion = p.sGestion.slice();
    const cap = await (await fetch(srv.origin + "/api/captcha")).json();
    const recu = Date.now();
    const { shown_at, fallback: _f, ...defi } = cap;
    const preuve = await solveAltcha(defi);
    await dormir(Math.max(0, recu + 3100 - Date.now()));
    const r = await fetch(srv.origin + "/api/salons", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shh-Access": p.entetes.acces, "X-Shh-Manage": p.entetes.gestion },
      body: JSON.stringify({ ...p.corps, altcha: (preuve as { payload: string }).payload, hp: "", shown_at }),
    });
    expect(r.status).toBe(201);
    const a = await membre({ kLien, mdp, sGestion: p.sGestion, creerGroupe: true, cles: p.cles });
    expect(a.c.siege).toBe(0);
    await attendre(a, (e) => e.k === "connexion" && e.etat === "ouvert");
    const b = await membre({ kLien, mdp });
    expect(b.c.siege).toBe(1);
    await attendre(b, (e) => e.k === "groupe" && e.dansLeGroupe);
    const c = await membre({ kLien, mdp });
    await attendre(c, (e) => e.k === "groupe" && e.dansLeGroupe);
    for (const m of [a, b, c]) {
      const deadline = Date.now() + 20_000;
      while (JSON.stringify(m.c.membres()) !== "[0,1,2]") {
        if (Date.now() > deadline) throw new Error(`membres ${JSON.stringify(m.c.membres())}`);
        await dormir(20);
      }
    }
    const l = a.c.envoyer({ k: "texte", x: "bonjour de A" }, 2);
    const acc = (await attendre(a, (e) => e.k === "accepte" && e.local === l)) as Extract<EvClient, { k: "accepte" }>;
    expect(acc.seq).toBeGreaterThan(0);
    const mb = (await attendre(b, texteRecu("bonjour de A"))) as Extract<EvClient, { k: "message" }>;
    expect(mb.siege).toBe(0);
    expect(mb.seq).toBe(acc.seq);
    await attendre(c, texteRecu("bonjour de A"));
    b.c.envoyer({ k: "texte", x: "réponse de B" }, 2);
    c.c.envoyer({ k: "reaction", cible: mb.enveloppe.id, emoji: "👍" }, 2);
    await attendre(a, texteRecu("réponse de B"));
    await attendre(a, (e) => e.k === "message" && e.enveloppe.message.k === "reaction");
    // Accusés groupés (2,5 s) : « vu » de B chez A.
    b.c.accuser("vu", [mb.enveloppe.id]);
    await attendre(a, (e) => e.k === "message" && e.enveloppe.message.k === "vu" && e.siege === 1, 10_000);
  });

  it("reconnexion : rattrapage avec `depuis`, ni perte ni doublon", async () => {
    const [a, b] = membres;
    b!.ws()!.close(1000);
    await dormir(100);
    for (let i = 0; i < 5; i++) a!.c.envoyer({ k: "texte", x: `pendant la coupure ${i}` }, 2);
    for (let i = 0; i < 5; i++) await attendre(b!, texteRecu(`pendant la coupure ${i}`), 40_000);
    for (let i = 0; i < 5; i++) expect(b!.evs.filter(texteRecu(`pendant la coupure ${i}`))).toHaveLength(1);
  });

  it("départ : le siège parti est retiré du groupe, l'envoi continue", async () => {
    const [a, b, c] = membres;
    c!.c.quitter();
    await attendre(a!, (e) => e.k === "depart" && e.siege === 2);
    a!.c.envoyer({ k: "texte", x: "après le départ" }, 2);
    await attendre(b!, texteRecu("après le départ"), 40_000);
    expect(a!.c.membres()).toEqual([0, 1]);
  });

  it("créateur revenu sur un autre appareil : l'ancien est délogé (4005, sans reconnexion), le rôle est rendu", async () => {
    const [a, b] = membres;
    const sGestion = (a!.c as unknown as { jetonGestion(): Uint8Array | null }).jetonGestion();
    expect(sGestion).not.toBeNull(); // le client garde S_gestion (le jeton en est tiré à la demande)
    sGestion!.fill(0);
    // S_gestion est celui de la création : relu depuis la préparation gardée par le test.
    const a2 = await membre({ kLien, mdp, sGestion: secret.sGestion });
    expect(a2.c.siege).toBe(0);
    await attendre(a!, (e) => e.k === "fin" && e.raison === "remplace");
    await attendre(b!, (e) => e.k === "membres" && e.createurRevenu, 30_000);
    await attendre(a2, (e) => e.k === "groupe" && e.dansLeGroupe, 30_000);
    a2.c.envoyer({ k: "texte", x: "de retour" }, 2);
    await attendre(b!, texteRecu("de retour"), 30_000);
    await dormir(1500);
    expect(a!.c.fini).toBe(true);
  });
});

const secret: { sGestion: Uint8Array } = { sGestion: new Uint8Array(32) };
