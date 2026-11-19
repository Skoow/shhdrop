// Portefeuille de jetons (conception du paiement §7) : formules disponibles d'après le serveur,
// jeton gardé d'abord, sinon un lot obtenu en aveugle (signé ici par node:crypto, RSA brut sur la
// clé de test des vecteurs), gardé chiffré ; jetons d'une clé trop vieille jetés.
import { constants, createPrivateKey, privateDecrypt } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { b64u, unb64u } from "../engine/pure";
import { fakeIndexedDB } from "../history/fake-idb.test-helper";
import type { Net } from "./api";
import { JETONS_PAR_LOT, formulesDisponibles, jetonValable, prendreJeton } from "./jetons";
import { garder, garderJeton, lireJetons, nouvelId, tirerPass } from "./pass";

const PP = JSON.parse(readFileSync(new URL("../../../engine/vectors/privacypass.json", import.meta.url), "utf8"));
const sk = createPrivateKey({ key: Buffer.from(PP.sk_pkcs8_hex, "hex"), format: "der", type: "pkcs8" });
const MAINTENANT = new Date("2026-11-20T10:00:00Z");
const rep = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });

function serveur(etat: "payee" | "revoquee" = "payee", reserve = 30) {
  const appels: string[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    appels.push(`${init.method} ${path}`);
    if (path === "/api/paiement/etat") return rep({ v: 1, etat, offre: "plus", fin: "2026-12-20", renouvelle: true, droits: [] });
    if (path === "/api/paiement/jetons/cles")
      return rep({ v: 1, emetteur: PP.issuer_name, cles: [{ jour: "2026-11-20", offre: "plus", spki: b64u(Buffer.from(PP.spki_hex, "hex") as unknown as Uint8Array<ArrayBuffer>) }] });
    if (path === "/api/paiement/jetons") {
      const { requetes } = JSON.parse(init.body as string) as { requetes: string[] };
      if (reserve < requetes.length) return rep({ error: "aucun_jeton" }, 409);
      reserve -= requetes.length;
      return rep({ offre: "plus", reponses: requetes.map((r) => b64u(new Uint8Array(privateDecrypt({ key: sk, padding: constants.RSA_NO_PADDING }, unb64u(r).slice(3))))) });
    }
    return rep({ error: "not_found" }, 404);
  }) as unknown as typeof globalThis.fetch;
  return { n: { origin: "https://shh.test", fetch } as Net, appels };
}

async function avecPass(idb: IDBFactory) {
  await garder(idb, { id: nouvelId(), pass: tirerPass(), offre: "plus", jours: 30, renouvelle: true, moyen: "carte", enAttente: false, cree: 1 });
}

describe("portefeuille de jetons", () => {
  it("aucun pass : aucune formule, aucune requête", async () => {
    const { n, appels } = serveur();
    expect(await formulesDisponibles(fakeIndexedDB(), n, MAINTENANT)).toEqual([]);
    expect(appels).toEqual([]);
  });

  it("pass payé : Plus disponible ; révoqué : rien", async () => {
    const idb = fakeIndexedDB();
    await avecPass(idb);
    expect(await formulesDisponibles(idb, serveur().n, MAINTENANT)).toEqual(["plus"]);
    expect(await formulesDisponibles(idb, serveur("revoquee").n, MAINTENANT)).toEqual([]);
  });

  it("un lot obtenu en aveugle, un jeton rendu, les autres gardés puis pris d'abord", async () => {
    const idb = fakeIndexedDB();
    await avecPass(idb);
    const { n, appels } = serveur();
    const j1 = await prendreJeton(idb, "plus", n, MAINTENANT);
    expect(j1).toMatch(/^[A-Za-z0-9_-]{472}$/);
    expect(appels.filter((a) => a.endsWith("/api/paiement/jetons"))).toHaveLength(1);
    expect(await lireJetons(idb)).toHaveLength(JETONS_PAR_LOT - 1);
    const j2 = await prendreJeton(idb, "plus", n, MAINTENANT);
    expect(j2).not.toBe(j1);
    expect(appels.filter((a) => a.endsWith("/api/paiement/jetons"))).toHaveLength(1); // pris dans le portefeuille
    expect(await lireJetons(idb)).toHaveLength(JETONS_PAR_LOT - 2);
    // Pro : aucun pass Pro.
    await expect(prendreJeton(idb, "pro", n, MAINTENANT)).rejects.toThrow("aucun_jeton");
  });

  it("réserve épuisée : aucun_jeton ; jeton d'une clé d'avant-hier jeté", async () => {
    const idb = fakeIndexedDB();
    await avecPass(idb);
    await expect(prendreJeton(idb, "plus", serveur("payee", 0).n, MAINTENANT)).rejects.toThrow("aucun_jeton");
    await garderJeton(idb, { jeton: "A".repeat(472), offre: "plus", jour: "2026-11-18" });
    await expect(prendreJeton(idb, "plus", serveur("payee", 0).n, MAINTENANT)).rejects.toThrow("aucun_jeton");
    expect(await lireJetons(idb)).toEqual([]);
    expect(jetonValable("2026-11-19", MAINTENANT)).toBe(true);
    expect(jetonValable("2026-11-20", MAINTENANT)).toBe(true);
    expect(jetonValable("2026-11-18", MAINTENANT)).toBe(false);
  });
});
