// Pseudo provisoire de l'inscription (20 novembre) : reconnu à sa forme, jamais choisi par
// quelqu'un (verifierSaisie le dit réservé) ; lettres et chiffres seulement (règle du moteur).
import { describe, expect, it } from "vitest";
import { estPseudoProvisoire, verifierSaisie } from "./session.svelte";

describe("pseudo provisoire", () => {
  it("forme reconnue : « Membre » ou « Member » et 6 chiffres, rien d'autre", () => {
    for (const p of ["Membre123456", "Member000001"]) expect(estPseudoProvisoire(p), p).toBe(true);
    for (const p of ["Membre12345", "Membre1234567", "membre123456", "Lea", "MembreLéa", "", null, undefined]) expect(estPseudoProvisoire(p), String(p)).toBe(false);
  });
  it("choisi à la main : réservé ; espaces et signes refusés ; « Lea42 » accepté", async () => {
    expect(await verifierSaisie({ pseudo: "Membre123456" })).toEqual({ pseudo: "pseudo_reserve" });
    // Toute casse (l'unicité l'ignore) : audit du 20 novembre.
    for (const p of ["membre123456", "MEMBER654321", "mEmBrE000000"]) expect(await verifierSaisie({ pseudo: p }), p).toEqual({ pseudo: "pseudo_reserve" });
    expect(await verifierSaisie({ pseudo: "Léa Dupont" })).toEqual({ pseudo: "pseudo_caracteres" });
    expect(await verifierSaisie({ pseudo: "Jean-Luc" })).toEqual({ pseudo: "pseudo_caracteres" });
    expect(await verifierSaisie({ pseudo: "admin" })).toEqual({ pseudo: "pseudo_reserve" });
    expect(await verifierSaisie({ pseudo: "Lea42" })).toEqual({});
    expect(await verifierSaisie({ pseudo: "Léa42" })).toEqual({ pseudo: "pseudo_caracteres" });
  });
});
