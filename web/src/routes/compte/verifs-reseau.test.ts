// Liste des domaines jetables illisible (production : fichier à part lu par fetch, U13) : la
// vérification sur l'appareil ne bloque pas l'inscription (le serveur refait le contrôle), et la
// lecture est retentée à l'adresse suivante.
import { describe, expect, it, vi } from "vitest";

const lire = vi.fn<() => Promise<readonly string[]>>();
vi.mock("../../listes/jetables", () => ({ lireJetables: () => lire() }));

describe("liste illisible", () => {
  it("échec : faux, sans exception ; lecture retentée, puis gardée une fois réussie", async () => {
    const { estJetable } = await import("./verifs");
    lire.mockRejectedValueOnce(new Error("reseau"));
    expect(await estJetable("a@yopmail.com")).toBe(false);
    lire.mockResolvedValueOnce(["yopmail.com"]);
    expect(await estJetable("a@yopmail.com")).toBe(true);
    expect(await estJetable("a@x.yopmail.com")).toBe(true);
    expect(lire).toHaveBeenCalledTimes(2);
  });
});
