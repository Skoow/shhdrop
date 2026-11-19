// Offres payantes (conception du paiement §7, §11) : vecteurs communs du moteur Rust rejoués par le
// build WebAssembly et par pure.ts : paliers payants (v5-paliers.json) et jetons Privacy Pass
// (privacypass.json, même jeton depuis le même état et la même réponse ; aller-retour avec une
// signature aveugle RSA faite par node:crypto, RSA brut sur la clé de test).
import { constants, createPrivateKey, privateDecrypt } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { loadEngine, type Wasm } from "./load";
import { jetonFinaliser, jetonPreparer } from "../paiement/moteur";
import * as P from "./pure";

const PAL = JSON.parse(readFileSync(new URL("../../../engine/vectors/v5-paliers.json", import.meta.url), "utf8"));
const PP = JSON.parse(readFileSync(new URL("../../../engine/vectors/privacypass.json", import.meta.url), "utf8"));
const unhex = (s: string) => new Uint8Array(Buffer.from(s, "hex"));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const num = { gratuit: 0, plus: 1, pro: 2 } as const;

let W: Wasm;
beforeAll(async () => {
  W = (await loadEngine()).wasm;
});

describe("paliers payants (v5-paliers.json)", () => {
  it("pure.ts et WebAssembly : paliers, données au plus, palier canonique, réservation", () => {
    expect([...P.PAID_BUCKETS]).toEqual(PAL.paid_buckets);
    for (const [nom, d] of Object.entries(PAL.paliers) as [keyof typeof num, { content_max: number; data_segments: number }][]) {
      expect(P.contentMaxOf(num[nom])).toBe(d.content_max);
      expect(P.dataSegmentsOf(num[nom])).toBe(d.data_segments);
    }
    const consts = W.constants() as Record<string, unknown>;
    expect(consts.PAID_BUCKETS).toEqual(PAL.paid_buckets);
    expect(consts.CONTENT_MAX_PLUS).toBe(PAL.paliers.plus.content_max);
    expect(consts.CONTENT_MAX_PRO).toBe(PAL.paliers.pro.content_max);
    for (const c of PAL.bucket_for) {
      const p = num[c.palier as keyof typeof num];
      if (c.bucket) {
        expect(P.bucketFor(c.data_end, p)).toBe(c.bucket);
        expect(W.bucketFor(c.data_end, p)).toBe(c.bucket);
      } else {
        expect(() => P.bucketFor(c.data_end, p)).toThrow("trop_gros");
        expect(() => W.bucketFor(c.data_end, p)).toThrow("trop_gros");
      }
    }
    for (const c of PAL.reservation_for) {
      const p = num[c.palier as keyof typeof num];
      if (c.bucket) {
        expect(P.reservationFor(c.used, p)).toBe(c.bucket);
        expect(W.reservationFor(c.used, p)).toBe(c.bucket);
      } else expect(() => P.reservationFor(c.used, p)).toThrow("trop_gros");
    }
    // Sans formule : gratuit, inchangé.
    expect(P.bucketFor(P.CONTENT_MAX)).toBe(32769);
    expect(() => P.bucketFor(P.CONTENT_MAX + 1)).toThrow("trop_gros");
    expect(() => W.bucketFor(0, 3)).toThrow("palier_invalide");
  });
});

describe("jetons anonymes (privacypass.json)", () => {
  const spki = unhex(PP.spki_hex);
  it("même jeton que le moteur natif depuis le même état et la même réponse (module des jetons, à part)", async () => {
    const j = await jetonFinaliser(spki, PP.issuer_name, unhex(PP.etat_hex), unhex(PP.token_response_hex));
    expect(hex(j)).toBe(PP.token_hex);
  });
  it("aller-retour : demande, signature aveugle (RSA brut, node:crypto), jeton vérifié ; refus", async () => {
    const sk = createPrivateKey({ key: Buffer.from(PP.sk_pkcs8_hex, "hex"), format: "der", type: "pkcs8" });
    const d = await jetonPreparer(spki, PP.issuer_name);
    expect(d.requete.length).toBe(259);
    expect([d.requete[0], d.requete[1], d.requete[2]]).toEqual([0, 2, unhex(PP.token_key_id_hex)[31]]);
    expect(d.etat.length).toBe(288);
    const sig: Uint8Array<ArrayBuffer> = new Uint8Array(privateDecrypt({ key: sk, padding: constants.RSA_NO_PADDING }, d.requete.slice(3)));
    const j = await jetonFinaliser(spki, PP.issuer_name, d.etat, sig);
    expect(j.length).toBe(354);
    expect(hex(j.slice(66, 98))).toBe(PP.token_key_id_hex);
    sig[10]! ^= 1;
    await expect(jetonFinaliser(spki, PP.issuer_name, d.etat, sig)).rejects.toThrow("jeton_invalide");
    await expect(jetonPreparer(spki.slice(1), PP.issuer_name)).rejects.toThrow("jeton_invalide");
    // Le moteur des partages n'a pas de jetons (module à part, poids des pages de partage).
    expect("jetonPreparer" in W).toBe(false);
  });
});
