// Clés du compte (conception compte §6, §21.2.2) : enveloppe du mot de passe et clés des coffres,
// rejouées sur engine/vectors/compte.json (sections enveloppes, cles, coffre_prive, coffre_profil).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aleatoire32, clesDuCompte, ouvrirEnveloppe, scellerEnveloppe } from "./keys";
import { sceller } from "./vaults";

const V = JSON.parse(readFileSync(new URL("../../../engine/vectors/compte.json", import.meta.url), "utf8"));
const unhex = (s: string) => new Uint8Array(Buffer.from(s, "hex"));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const sha = async (b: Uint8Array) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>)));

describe("enveloppe du mot de passe (vecteurs « enveloppes »)", () => {
  it("scelle exactement le vecteur (60 octets) et l'ouvre", async () => {
    expect(V.enveloppes.length).toBeGreaterThan(0);
    for (const c of V.enveloppes) {
      const env = await scellerEnveloppe(unhex(c.kek_mdp), unhex(c.h), unhex(c.k_compte), unhex(c.nonce));
      expect(env.length).toBe(60);
      expect(hex(env), c.label).toBe(c.env_mdp);
      expect(hex(await ouvrirEnveloppe(unhex(c.kek_mdp), unhex(c.h), unhex(c.env_mdp))), c.label).toBe(c.k_compte);
    }
  });

  it("refuse un autre h, une autre clé, une enveloppe abîmée ou de mauvaise taille", async () => {
    const c = V.enveloppes[0];
    const env = unhex(c.env_mdp);
    await expect(ouvrirEnveloppe(unhex(c.kek_mdp), new Uint8Array(16), env)).rejects.toThrow("enveloppe_invalide");
    await expect(ouvrirEnveloppe(new Uint8Array(32), unhex(c.h), env)).rejects.toThrow("enveloppe_invalide");
    const bad = env.slice();
    bad[30]! ^= 1;
    await expect(ouvrirEnveloppe(unhex(c.kek_mdp), unhex(c.h), bad)).rejects.toThrow("enveloppe_invalide");
    await expect(ouvrirEnveloppe(unhex(c.kek_mdp), unhex(c.h), env.slice(0, 59))).rejects.toThrow("enveloppe_invalide");
  });

  it("sans nonce donné : nonce aléatoire, deux enveloppes différentes qui s'ouvrent", async () => {
    const kek = aleatoire32();
    const h = new Uint8Array(16).fill(7);
    const k = aleatoire32();
    const a = await scellerEnveloppe(kek, h, k);
    const b = await scellerEnveloppe(kek, h, k);
    expect(hex(a)).not.toBe(hex(b));
    expect(hex(await ouvrirEnveloppe(kek, h, b))).toBe(hex(k));
  });
});

describe("clés des coffres (vecteurs « cles », « coffre_prive », « coffre_profil »)", () => {
  it("K_prive et K_profil, non extractibles, scellent exactement les coffres des vecteurs", async () => {
    for (const [section, champ, cle] of [
      ["coffre_prive", "k_compte", "prive"],
      ["coffre_profil", "s_profil", "profil"],
    ] as const) {
      for (const c of V[section]) {
        const src = V.cles.find((x: Record<string, string>) => x[champ] === c[champ]);
        const k = await clesDuCompte(unhex(src.k_compte), unhex(src.s_profil));
        expect(k[cle].extractable).toBe(false);
        expect(k.etiquette.extractable).toBe(false);
        const blob = await sceller(cle, k[cle], unhex(c.h), c.gen, unhex(c.json_hex), unhex(c.nonce));
        expect(blob.length, c.label).toBe(c.blob_len);
        expect(await sha(blob), c.label).toBe(c.blob_sha256);
      }
    }
  });

  it("aleatoire32 : 32 octets tirés par crypto.getRandomValues", () => {
    const a = aleatoire32();
    expect(a.length).toBe(32);
    expect(hex(a)).not.toBe(hex(aleatoire32()));
  });
});
