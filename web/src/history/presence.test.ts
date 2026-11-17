import { describe, expect, it } from "vitest";
import { presence, probeHistory } from "./presence.svelte";

describe("« Mes partages » seulement s'il y a des partages (17 novembre)", () => {
  it("pages d'information : vrai seulement si la base de l'historique existe ; rien n'est créé ni ouvert", async () => {
    presence.any = false;
    await probeHistory({ databases: async () => [{ name: "autre", version: 1 }] });
    expect(presence.any).toBe(false);
    await probeHistory({ databases: async () => [{ name: "shhdrop-history", version: 1 }] });
    expect(presence.any).toBe(true);
  });
  it("stockage refusé ou absent : rien à montrer, aucune erreur", async () => {
    presence.any = false;
    await probeHistory({ databases: async () => Promise.reject(new Error("refusé")) });
    await probeHistory(undefined);
    expect(presence.any).toBe(false);
  });
});
