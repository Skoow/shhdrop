import { describe, expect, it } from "vitest";
import { accueil, DEPUIS_REPRISE, lire, lu, ping, PREND_UN_RANG, quitter, retirer, TAILLE_TRAME, trame } from "./protocole";

/** Enregistrement serveur : type ‖ seq (8) ‖ données. */
function enr(type: number, seq: number, ...donnees: (number | Uint8Array)[]): Uint8Array {
  const parts = donnees.map((d) => (typeof d === "number" ? new Uint8Array([d]) : d));
  const n = parts.reduce((a, p) => a + p.length, 0);
  const b = new Uint8Array(9 + n);
  b[0] = type;
  new DataView(b.buffer).setBigUint64(1, BigInt(seq));
  let o = 9;
  for (const p of parts) {
    b.set(p, o);
    o += p.length;
  }
  return b;
}
const u64 = (v: number) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(v));
  return b;
};
const u32 = (v: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v);
  return b;
};
const nonce = new Uint8Array(16).fill(7);

describe("protocole : lecture", () => {
  it("0x01 : siège, heure de réception, trame", () => {
    const t = new Uint8Array(TAILLE_TRAME).fill(3);
    const r = lire(enr(0x01, 12, 2, u64(1_700_000_000_000), t));
    expect(r).toMatchObject({ type: 0x01, seq: 12, siege: 2, recuMs: 1_700_000_000_000 });
    expect((r as { trame: Uint8Array }).trame).toEqual(t);
  });
  it("annonces, départ, fin, présence, pong", () => {
    expect(lire(enr(0x02, 3, 1, nonce))).toEqual({ type: 0x02, seq: 3, siege: 1, nonce });
    expect(lire(enr(0x0a, 4, 1, nonce))).toEqual({ type: 0x0a, seq: 4, siege: 1, nonce });
    expect(lire(enr(0x03, 5, 1))).toEqual({ type: 0x03, seq: 5, siege: 1 });
    expect(lire(enr(0x05, 5, 2))).toEqual({ type: 0x05, seq: 5, raison: 2 });
    expect(lire(enr(0x07, 5, 1, 0, u64(29_000_000)))).toEqual({ type: 0x07, seq: 5, siege: 1, enLigne: false, derniereMin: 29_000_000 });
    expect(lire(enr(0x07, 5, 1, 1, u64(0)))).toMatchObject({ enLigne: true });
    expect(lire(enr(0x08, 5, new Uint8Array(8).fill(9)))).toEqual({ type: 0x08, seq: 5, ping: new Uint8Array(8).fill(9) });
  });
  it("0x09 : siège 0xFF sans exclu, numéro r", () => {
    expect(lire(enr(0x09, 8, 0xff, nonce, u32(3)))).toEqual({ type: 0x09, seq: 8, siege: undefined, nonce, r: 3 });
    expect(lire(enr(0x09, 8, 2, nonce, u32(1)))).toMatchObject({ siege: 2, r: 1 });
  });
  it("limite, plein, effacée, acceptée, réglages", () => {
    expect(lire(enr(0x0b, 8, u32(4)))).toEqual({ type: 0x0b, seq: 8, secondes: 4 });
    expect(lire(enr(0x0c, 8))).toEqual({ type: 0x0c, seq: 8 });
    expect(lire(enr(0x0e, 8, u64(6)))).toEqual({ type: 0x0e, seq: 8, cible: 6 });
    expect(lire(enr(0x0f, 9))).toEqual({ type: 0x0f, seq: 9 });
    expect(lire(enr(0x10, 9, u64(9), u32(3600), 4))).toEqual({ type: 0x10, seq: 9, depart: 9, secondes: 3600, places: 4 });
  });
  it("0x0D : créateur et n annonces de 25 octets", () => {
    const r = lire(enr(0x0d, 2, 0, 2, 0, nonce, u64(0), 1, nonce, u64(42)));
    expect(r).toEqual({ type: 0x0d, seq: 2, createur: 0, annonces: [{ siege: 0, nonce, derniereMin: 0 }, { siege: 1, nonce, derniereMin: 42 }] });
    expect(lire(enr(0x0d, 2, 0, 2, 0, nonce, u64(0)))).toBeNull();
  });
  it("taille fausse ou type inconnu : refusé", () => {
    expect(lire(enr(0x03, 5))).toBeNull();
    expect(lire(enr(0x03, 5, 1, 1))).toBeNull();
    expect(lire(enr(0x01, 5, 1))).toBeNull();
    expect(lire(enr(0x06, 5))).toBeNull();
    expect(lire(enr(0x44, 5))).toBeNull();
    expect(lire(new Uint8Array(8))).toBeNull();
  });
  it("rangs : 0x01, 0x02, 0x03, 0x09, 0x0A seulement", () => {
    expect([...PREND_UN_RANG].sort((a, b) => a - b)).toEqual([1, 2, 3, 9, 10]);
  });
});

describe("protocole : messages du client", () => {
  it("accueil : jeton ‖ depuis, 51 octets ; reprise = 2^64 − 1", () => {
    const j = "A".repeat(42) + "_";
    const a = accueil(j, 17n);
    expect(a.length).toBe(51);
    expect(new TextDecoder().decode(a.slice(0, 43))).toBe(j);
    expect(new DataView(a.buffer).getBigUint64(43)).toBe(17n);
    expect(new DataView(accueil(j, DEPUIS_REPRISE).buffer).getBigUint64(43)).toBe(0xffffffffffffffffn);
    expect(() => accueil("court", 0n)).toThrow("argument_invalide");
  });
  it("0x01 avec ou sans pièce ; mauvaise taille refusée", () => {
    const t = new Uint8Array(TAILLE_TRAME).fill(1);
    expect(trame(t).length).toBe(4141);
    const p = trame(t, new Uint8Array(16).fill(2));
    expect(p.length).toBe(4157);
    expect(p[0]).toBe(1);
    expect(p[4141]).toBe(2);
    expect(() => trame(new Uint8Array(10))).toThrow();
    expect(() => trame(t, new Uint8Array(3))).toThrow();
  });
  it("0x02, 0x05 : type ‖ seq ; 0x03 ; 0x04", () => {
    expect([...retirer(5)]).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 5]);
    expect([...lu(258)]).toEqual([5, 0, 0, 0, 0, 0, 0, 1, 2]);
    expect([...quitter()]).toEqual([3]);
    expect(ping(new Uint8Array(8).fill(4)).length).toBe(9);
    expect(() => lu(0)).toThrow();
  });
});
