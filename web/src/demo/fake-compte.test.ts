// Faux serveur du compte de la démo (demo/fake-compte.ts) : mêmes réponses que handlers_compte.go
// pour le client account/api.ts ; TOTP contre les vecteurs de la RFC 6238 ; codes à 5 essais ;
// adresse déjà prise refusée seulement après le code juste ; session « récente » ; rejeu refusé.
import { describe, expect, it } from "vitest";
import * as A from "../account/api";
import { codeTotp, createFauxCompte, verifierTotp, type InstantaneCompte } from "./fake-compte";

const PREUVE = { altcha: "demo", hp: "", shown_at: "demo" };
const octets = (n: number, v = 7) => new Uint8Array(n).fill(v) as Uint8Array<ArrayBuffer>;
/** Coffre privé factice dont les octets 9 à 16 portent `gen` (comme le vrai, données authentifiées). */
const coffre = (gen: number) => {
  const b = new Uint8Array(40) as Uint8Array<ArrayBuffer>;
  new DataView(b.buffer).setBigUint64(9, BigInt(gen));
  return b;
};

function monter(now = () => 1_700_000_000_000, restore: InstantaneCompte | null = null) {
  let dernier: InstantaneCompte | null = null;
  const f = createFauxCompte({ now, restore, onChange: (s) => (dernier = s) });
  const net: A.Net = { origin: "https://demo.test", fetch: ((u: RequestInfo | URL, i?: RequestInit) => f.handle(new Request(u, i))) as typeof fetch };
  return { f, net, sauve: () => dernier };
}

async function inscrire(net: A.Net, f: ReturnType<typeof createFauxCompte>, email = "Lea@Exemple.fr", pCanon = "léa") {
  const { etape } = await A.inscriptionDebut(net, { email, langue: "fr", ...PREUVE });
  const code = f.dernierCode()!.code;
  return A.inscriptionFin(net, { etape, code, aAuth: octets(32, 1), envMdp: octets(60, 2), sProfil: octets(32, 3), pCanon, blobProfil: octets(50), blobPrive: coffre(1), persistante: false, etiquette: null });
}

describe("faux serveur du compte (démo)", () => {
  it("TOTP : vecteurs SHA-1 de la RFC 6238 (6 chiffres), fenêtre ± 1 pas, rejeu refusé", async () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // « 12345678901234567890 »
    expect(await codeTotp(secret, 59_000)).toBe("287082");
    expect(await codeTotp(secret, 1_111_111_109_000)).toBe("081804");
    expect(await codeTotp(secret, 1_234_567_890_000)).toBe("005924");
    expect(await codeTotp(secret, 2_000_000_000_000)).toBe("279037");
    const pas = await verifierTotp(secret, "081804", 1_111_111_109_000 + 30_000, -1); // pas suivant : accepté (fenêtre)
    expect(pas).toBe(Math.floor(1_111_111_109 / 30));
    expect(await verifierTotp(secret, "081804", 1_111_111_109_000, pas)).toBe(-1); // déjà servi
    expect(await verifierTotp(secret, "081804", 1_111_111_109_000 + 90_000, -1)).toBe(-1); // hors fenêtre
  });

  it("inscription : code à 6 chiffres « envoyé » à l'adresse tapée ; 5 essais puis l'étape disparaît", async () => {
    const { f, net } = monter();
    const { etape } = await A.inscriptionDebut(net, { email: "lea@exemple.fr", langue: "fr", ...PREUVE });
    expect(f.dernierCode()).toEqual({ email: "lea@exemple.fr", code: expect.stringMatching(/^\d{6}$/) });
    const fin = (code: string) => A.inscriptionFin(net, { etape, code, aAuth: octets(32), envMdp: octets(60), sProfil: octets(32), pCanon: "léa", blobProfil: octets(10), blobPrive: coffre(1), persistante: false, etiquette: null });
    const faux = f.dernierCode()!.code === "000000" ? "111111" : "000000";
    for (const reste of [4, 3, 2, 1]) await expect(fin(faux)).rejects.toMatchObject({ status: 403, code: "code_faux", attemptsLeft: reste });
    await expect(fin(faux)).rejects.toMatchObject({ status: 404, code: "not_found" });
    await expect(fin(f.dernierCode()!.code)).rejects.toMatchObject({ status: 404 });
  });

  it("adresse déjà prise : même réponse au début, refus seulement après le code juste ; pseudo unique", async () => {
    const { f, net } = monter();
    await inscrire(net, f);
    const { etape } = await A.inscriptionDebut(net, { email: "lea@exemple.fr", langue: "fr", ...PREUVE });
    await expect(A.inscriptionFin(net, { etape, code: f.dernierCode()!.code, aAuth: octets(32), envMdp: octets(60), sProfil: octets(32), pCanon: "autre", blobProfil: octets(10), blobPrive: coffre(1), persistante: false, etiquette: null })).rejects.toMatchObject({ status: 409, code: "deja_inscrit" });
    await expect(inscrire(net, f, "autre@exemple.fr", "léa")).rejects.toMatchObject({ status: 409, code: "pseudo_pris" });
  });

  it("connexion : adresse sans casse, A_auth comparé ; mauvais : « identifiants » ; ouverture complète", async () => {
    const { f, net } = monter();
    await inscrire(net, f);
    await expect(A.connexion(net, { email: "lea@exemple.fr", aAuth: octets(32, 9), persistante: false, etiquette: null })).rejects.toMatchObject({ status: 403, code: "identifiants" });
    const o = await A.connexion(net, { email: "LEA@exemple.fr", aAuth: octets(32, 1), persistante: true, etiquette: null });
    expect("session" in o && o.genPrive).toBe(1);
    const e = await A.etat(net, (o as A.Ouverture).session);
    expect(e).toMatchObject({ palier: "neuf", totp: false, creeLe: "2023-11-14" });
  });

  it("session récente exigée (5 min) ; reauth la rafraîchit ; mot de passe changé : autres sessions fermées", async () => {
    let t = 1_700_000_000_000;
    const { f, net } = monter(() => t);
    const { session } = await inscrire(net, f);
    const o = (await A.connexion(net, { email: "lea@exemple.fr", aAuth: octets(32, 1), persistante: false, etiquette: null })) as A.Ouverture;
    t += 6 * 60_000;
    await expect(A.changerMdp(net, session, octets(32, 5), octets(60, 6))).rejects.toMatchObject({ status: 403, code: "recent" });
    await A.reauth(net, session, octets(32, 1), "");
    await A.changerMdp(net, session, octets(32, 5), octets(60, 6));
    await expect(A.etat(net, o.session)).rejects.toMatchObject({ status: 401, code: "session" });
    await expect(A.etat(net, session)).resolves.toBeTruthy();
  });

  it("double authentification : activation par un vrai code, connexion en deux temps, rejeu refusé", async () => {
    let t = 1_700_000_000_000;
    const { f, net } = monter(() => t);
    const { session } = await inscrire(net, f);
    const { etape, secret } = await A.totpDebut(net, session);
    await expect(A.totpFin(net, session, etape, "000000")).rejects.toMatchObject({ code: "totp_faux" });
    const code = await codeTotp(secret, t);
    await A.totpFin(net, session, etape, code);
    const r = await A.connexion(net, { email: "lea@exemple.fr", aAuth: octets(32, 1), persistante: false, etiquette: null });
    expect(r).toEqual({ totp: expect.any(String) });
    await expect(A.connexionTotp(net, (r as { totp: string }).totp, code)).rejects.toMatchObject({ code: "totp_faux" }); // déjà servi
    t += 30_000;
    const o = await A.connexionTotp(net, (r as { totp: string }).totp, await codeTotp(secret, t));
    expect(o.session).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("mot de passe oublié : code seulement pour une adresse connue ; nouveau coffre gen + 1 ; sessions fermées", async () => {
    const { f, net } = monter();
    const { session } = await inscrire(net, f);
    const avant = f.dernierCode();
    await A.oubliDebut(net, { email: "inconnu@exemple.fr", langue: "fr", ...PREUVE });
    expect(f.dernierCode()).toEqual(avant); // aucun code « envoyé » à une adresse sans compte
    const { etape } = await A.oubliDebut(net, { email: "lea@exemple.fr", langue: "fr", ...PREUVE });
    const v = await A.oubliVerifier(net, { etape, code: f.dernierCode()!.code, totp: "", totpPerdu: false });
    expect(v).toMatchObject({ genPrive: 1 });
    await expect(A.oubliFin(net, { etape, aAuth: octets(32, 8), envMdp: octets(60, 8), blobPrive: coffre(1), persistante: false, etiquette: null })).rejects.toMatchObject({ code: "bad_request" });
    const fin = await A.oubliFin(net, { etape, aAuth: octets(32, 8), envMdp: octets(60, 8), blobPrive: coffre(2), persistante: false, etiquette: null });
    expect(fin.genPrive).toBe(2);
    await expect(A.etat(net, session)).rejects.toMatchObject({ code: "session" });
    await expect(A.connexion(net, { email: "lea@exemple.fr", aAuth: octets(32, 1), persistante: false, etiquette: null })).rejects.toMatchObject({ code: "identifiants" });
  });

  it("état de l'onglet : rechargé tel quel ; jamais de mot de passe, pseudo seulement en p_canon ; suppression libère le pseudo", async () => {
    const { f, net, sauve } = monter();
    const { session } = await inscrire(net, f);
    const s = sauve()!;
    expect(JSON.stringify(s)).not.toContain("Léa");
    const re = monter(undefined, JSON.parse(JSON.stringify(s)) as InstantaneCompte);
    await expect(A.etat(re.net, session)).resolves.toBeTruthy();
    await A.supprimer(re.net, session);
    await expect(A.etat(re.net, session)).rejects.toMatchObject({ code: "session" });
    await expect(inscrire(re.net, re.f, "autre@exemple.fr", "léa")).resolves.toBeTruthy();
  });
});
