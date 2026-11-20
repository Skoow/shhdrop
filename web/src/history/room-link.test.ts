import { describe, expect, it } from "vitest";
import { lienDuSalon } from "./room-link";

const K = "A".repeat(43);

describe("ouvrir un salon depuis l'historique", () => {
  it("garde le fragment, jamais l'origine ni le chemin gardés", () => {
    expect(lienDuSalon(`https://shhgone.com/salon#c${K}`, "/salon")).toBe(`/salon#c${K}`);
    expect(lienDuSalon(`https://autre.example/piege?x=1#c${K}`, "/salon")).toBe(`/salon#c${K}`);
    expect(lienDuSalon(`https://shhgone.com/salon#s${K}`, "/base/salon")).toBe(`/base/salon#s${K}`);
  });
  it("fragment absent ou d'une autre forme : la page du salon, sans rien", () => {
    for (const l of ["https://autre.example/", `https://x.example/#${K}`, `javascript:alert(1)#c${K}x`, `https://x.example/#c${K}#zzz`]) expect(lienDuSalon(l, "/salon"), l).toBe("/salon");
  });
});
