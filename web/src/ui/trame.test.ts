import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BAND, activity, approach, front, grid, lit, seeds } from "./trame";

const area = (p: number, cols: number) => {
  const f = front(p, cols);
  let s = 0;
  for (let c = 0; c < cols; c++) s += lit(c, f);
  return s;
};

describe("trame de l'envoi (honnêteté de la progression)", () => {
  it("p = 0 : aucune colonne allumée ; p = 1 : toutes", () => {
    for (const cols of [1, 12, 36, 57]) {
      expect(area(0, cols)).toBe(0);
      expect(area(1, cols)).toBe(cols);
    }
  });

  it("surface allumée à moins de BAND / 2 colonnes de p × cols, croissante avec p", () => {
    for (const cols of [20, 36, 57]) {
      let prev = -1;
      for (let i = 0; i <= 200; i++) {
        const p = i / 200;
        const a = area(p, cols);
        expect(Math.abs(a - p * cols)).toBeLessThanOrEqual(BAND / 2 + 0.05);
        expect(a).toBeGreaterThanOrEqual(prev);
        prev = a;
      }
    }
  });

  it("aucune colonne pleinement allumée au-delà de la part envoyée", () => {
    const cols = 40;
    for (let i = 0; i < 100; i++) {
      const p = i / 100;
      const f = front(p, cols);
      for (let c = 0; c < cols; c++) if (lit(c, f) === 1) expect(c + 1).toBeLessThanOrEqual(p * cols + BAND / 2 + 1e-9);
    }
  });

  it("approach : jamais au-delà de la cible, la rejoint, suit un recul tout de suite", () => {
    let v = 0;
    for (let i = 0; i < 120; i++) {
      v = approach(v, 0.6, 16);
      expect(v).toBeLessThanOrEqual(0.6);
    }
    expect(v).toBe(0.6);
    expect(approach(0.6, 0.2, 16)).toBe(0.2);
    expect(approach(0.3, 0.9, 0)).toBe(0.3);
    expect(approach(0.3, 0.9, 1e9)).toBe(0.9);
  });

  it("activity : monte quand des octets passent, retombe sans eux", () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = activity(a, true, 16);
    expect(a).toBeGreaterThan(0.9);
    for (let i = 0; i < 120; i++) a = activity(a, false, 16);
    expect(a).toBeLessThan(0.01);
  });

  it("grid : centrée, au moins un demi-pas de marge", () => {
    const g = grid(400, 70);
    expect(g.cols).toBe(40);
    expect(g.rows).toBe(7);
    expect(g.ox).toBeGreaterThanOrEqual(4.5);
    expect(g.oy).toBeGreaterThanOrEqual(4.5);
    expect(grid(0, 0)).toMatchObject({ cols: 0, rows: 0 });
  });

  it("seeds : déterministes, dans [0, 1)", () => {
    const a = seeds(50);
    expect([...a]).toEqual([...seeds(50)]);
    expect(a.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("n'importe que ./decor (aucune donnée réelle : ni crypto, ni transfert, ni flux)", () => {
    const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "trame.ts"), "utf8");
    const imports = [...raw.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports).toEqual(["./decor"]);
  });
});
