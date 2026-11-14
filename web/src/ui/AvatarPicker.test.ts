// @vitest-environment happy-dom
// Photo de profil (conception compte §21.15.3, salon v3 §7.2) : ré-encodage sur l'appareil en
// 256 × 256, carré pris au centre, 64 Ko au plus, sans métadonnées (le canevas ne recopie que les
// pixels) ; qualité baissée jusqu'à tenir ; image illisible : message, rien de gardé.
import { describe, expect, it, vi } from "vitest";
import { AVATAR_MAX, AVATAR_PX, carreCentre, reencoder } from "./avatar";

describe("avatar", () => {
  it("carré au centre : paysage, portrait, carré", () => {
    expect(carreCentre(400, 300)).toEqual({ sx: 50, sy: 0, s: 300 });
    expect(carreCentre(300, 500)).toEqual({ sx: 0, sy: 100, s: 300 });
    expect(carreCentre(256, 256)).toEqual({ sx: 0, sy: 0, s: 256 });
  });
  it("256 × 256, JPEG, qualité baissée jusqu'à 64 Ko au plus", async () => {
    const qualites: number[] = [];
    const draw = vi.fn();
    const out = await reencoder(new Blob(["x"]), {
      decoder: async () => ({ width: 1000, height: 800, close: () => undefined }),
      toile: (w, h) => {
        expect([w, h]).toEqual([AVATAR_PX, AVATAR_PX]);
        return { dessiner: draw, encoder: async (type, q) => (expect(type).toBe("image/jpeg"), qualites.push(q), new Uint8Array(q > 0.7 ? AVATAR_MAX + 1 : 30_000)) };
      },
    });
    expect(out.length).toBe(30_000);
    expect(qualites[0]).toBeGreaterThan(0.7);
    expect(qualites.at(-1)).toBeLessThanOrEqual(0.7);
    expect(draw).toHaveBeenCalledWith(expect.anything(), { sx: 100, sy: 0, s: 800 });
  });
  it("trop lourde même à la plus basse qualité, ou illisible : photo_illisible", async () => {
    const toile = () => ({ dessiner: () => undefined, encoder: async () => new Uint8Array(AVATAR_MAX + 1) });
    await expect(reencoder(new Blob(["x"]), { decoder: async () => ({ width: 10, height: 10, close: () => undefined }), toile })).rejects.toThrow("photo_illisible");
    await expect(reencoder(new Blob(["x"]), { decoder: async () => Promise.reject(new Error("x")), toile })).rejects.toThrow("photo_illisible");
  });
});
