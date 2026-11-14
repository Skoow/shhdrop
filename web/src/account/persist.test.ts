// « Rester connecté sur cet appareil » (conception compte §9, D7) : jeton, K_compte et s_profil
// chiffrés par une clé AES-GCM NON EXTRACTIBLE dans IndexedDB `shhdrop-compte` ; rien en clair.
import { describe, expect, it } from "vitest";
import { fakeIndexedDB } from "../history/fake-idb.test-helper";
import { COMPTE_DB, effacer, lire, sauver, type Sauvegarde } from "./persist";

const sv = (): Sauvegarde => ({
  jeton: "J".repeat(42) + "A", // base64url canonique de 32 octets
  h: new Uint8Array(16).fill(0x11),
  kCompte: new Uint8Array(32).fill(0x22),
  sProfil: new Uint8Array(32).fill(0x33),
  genProfil: 4,
  genPrive: 9,
});

/** Tout ce qui est « sur disque », en octets et en texte. */
function disque(idb: ReturnType<typeof fakeIndexedDB>): { bytes: Uint8Array[]; keys: CryptoKey[]; text: string } {
  const bytes: Uint8Array[] = [];
  const keys: CryptoKey[] = [];
  let text = "";
  const walk = (v: unknown) => {
    if (v instanceof Uint8Array) bytes.push(v);
    else if (v instanceof CryptoKey) keys.push(v);
    else if (typeof v === "string") text += v;
    else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x);
  };
  for (const [, stores] of idb.raw()) for (const [, m] of stores) for (const [k, v] of m) (walk(k), walk(v));
  return { bytes, keys, text };
}
const has = (hay: Uint8Array, needle: Uint8Array) => Buffer.from(hay).includes(Buffer.from(needle));

describe("persistance de la session", () => {
  it("lire sans base : null, et rien n'est créé", async () => {
    const idb = fakeIndexedDB();
    expect(await lire(idb)).toBeNull();
    expect([...idb.raw().keys()]).toEqual([]);
  });

  it("sauver puis lire : même contenu ; base shhdrop-compte ; clé non extractible ; aucun clair", async () => {
    const idb = fakeIndexedDB();
    await sauver(idb, sv());
    expect(await lire(idb)).toEqual(sv());
    expect([...idb.raw().keys()]).toEqual([COMPTE_DB]);
    expect(COMPTE_DB).toBe("shhdrop-compte");
    const d = disque(idb);
    expect(d.keys.length).toBe(1);
    expect(d.keys[0]!.extractable).toBe(false);
    expect(d.text).not.toContain("JJJJ");
    for (const b of d.bytes) {
      for (const secret of [sv().kCompte, sv().sProfil, sv().h, new TextEncoder().encode("JJJJJJJJ")]) expect(has(b, secret)).toBe(false);
    }
  });

  it("effacer : la base disparaît ; lire rend null", async () => {
    const idb = fakeIndexedDB();
    await sauver(idb, sv());
    await effacer(idb);
    expect([...idb.raw().keys()]).toEqual([]);
    expect(await lire(idb)).toBeNull();
  });

  it("enregistrement abîmé ou illisible : null (la session redemande le mot de passe)", async () => {
    const idb = fakeIndexedDB();
    await sauver(idb, sv());
    for (const [, stores] of idb.raw()) for (const [, m] of stores) for (const [, v] of m) if ((v as { ct?: Uint8Array }).ct) (v as { ct: Uint8Array }).ct[0]! ^= 1;
    expect(await lire(idb)).toBeNull();
  });
});
