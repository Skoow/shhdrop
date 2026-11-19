import { describe, expect, it } from "vitest";
import { doitSonner, finSilence, SILENCE_TOUJOURS } from "./son";

const base = { n: 1, silence: 0, maintenant: 100_000, dernier: 0, visible: false, enBas: false };

describe("son de nouveau message (v3 §14.4)", () => {
  it("sonne pour un message d'un autre, page cachée ou pas en bas", () => {
    expect(doitSonner(base)).toBe(true);
    expect(doitSonner({ ...base, visible: true, enBas: false })).toBe(true);
    expect(doitSonner({ ...base, visible: false, enBas: true })).toBe(true);
  });
  it("jamais quand le message se voit, ni sans message", () => {
    expect(doitSonner({ ...base, visible: true, enBas: true })).toBe(false);
    expect(doitSonner({ ...base, n: 0 })).toBe(false);
  });
  it("au plus un son toutes les 2 s", () => {
    expect(doitSonner({ ...base, dernier: base.maintenant - 1999 })).toBe(false);
    expect(doitSonner({ ...base, dernier: base.maintenant - 2000 })).toBe(true);
  });
  it("silencieux : toujours, ou jusqu'à l'échéance (1 h, 8 h)", () => {
    expect(doitSonner({ ...base, silence: SILENCE_TOUJOURS })).toBe(false);
    const h1 = finSilence(1, base.maintenant);
    expect(h1).toBe(base.maintenant + 3_600_000);
    expect(finSilence(8, 0)).toBe(8 * 3_600_000);
    expect(finSilence("toujours", 5)).toBe(SILENCE_TOUJOURS);
    expect(doitSonner({ ...base, silence: h1 })).toBe(false);
    expect(doitSonner({ ...base, silence: h1, maintenant: h1 })).toBe(true);
  });
});
