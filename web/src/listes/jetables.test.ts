// Domaines jetables de l'inscription (U13) : liste intégrée (tests, dev, démo) et fichier à part
// de la production (jetables.verified.ts, assets/jetables-EMPREINTE.js écrit par vite.config.ts).
import { afterEach, describe, expect, it, vi } from "vitest";
import { jetablesJson } from "../../vite.config";
import { domainesDe, lireJetables } from "./jetables";

vi.mock("virtual:shh-jetables", () => ({ src: "/assets/jetables-AbCd1234.js", integrity: "sha384-liste" }));

afterEach(() => vi.unstubAllGlobals());

describe("liste intégrée", () => {
  it("un domaine par ligne, en minuscules ; commentaires et lignes vides ignorés", () => {
    expect(domainesDe("# titre\n\n  Mailinator.COM \nyopmail.com\r\n# fin")).toEqual(["mailinator.com", "yopmail.com"]);
  });
  it("les deux listes du serveur (jetables.txt, jetables-ajouts.txt)", async () => {
    const l = await lireJetables();
    expect(l.length).toBeGreaterThan(10_000);
    expect(l).toContain("guerrillamail.com");
    expect(l.some((d) => d.startsWith("#") || d !== d.trim().toLowerCase() || d === "")).toBe(false);
  });
  it("le fichier de la production (vite.config.ts, jetablesJson) a exactement les mêmes domaines, dans le même ordre", async () => {
    expect(JSON.parse(jetablesJson().toString("utf8"))).toEqual(await lireJetables());
  });
});

describe("production (jetables.verified.ts)", () => {
  it("lu avec son empreinte, sans cookie ni redirection", async () => {
    const f = vi.fn(async () => new Response('["a.example","b.example"]'));
    vi.stubGlobal("fetch", f);
    const { lireJetables: lire } = await import("./jetables.verified");
    expect(await lire()).toEqual(["a.example", "b.example"]);
    expect(f.mock.calls).toEqual([["/assets/jetables-AbCd1234.js", { integrity: "sha384-liste", credentials: "omit", redirect: "error" }]]);
  });
  it("statut d'erreur, coupure ou contenu qui n'est pas une liste de chaînes : erreur", async () => {
    const { lireJetables: lire } = await import("./jetables.verified");
    for (const r of [async () => new Response("", { status: 404 }), async () => Promise.reject(new TypeError("Failed to fetch")), async () => new Response('{"a":1}'), async () => new Response("[1]")]) {
      vi.stubGlobal("fetch", r);
      await expect(lire()).rejects.toThrow();
    }
  });
});
