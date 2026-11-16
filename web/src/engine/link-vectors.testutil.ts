// Vecteurs des liens pour les tests (pas pour le site) : v2.json est figé ; ses liens écrits à la
// racine et ses deux refus de « …/s#… » sont remplacés par v3-liens.json (liens sous /s, décision
// du propriétaire du 16 novembre), comme dans engine/core/tests/vectors.rs.
import { readFileSync } from "node:fs";

export type LinkCase = { fn: string; args: string[]; result?: any; error?: string };

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../../engine/vectors/${name}`, import.meta.url), "utf8"));

function superseded(c: LinkCase): boolean {
  if (c.fn === "shareLink" || c.fn === "manageLink") return typeof c.result === "string";
  if (c.fn !== "parseLink" || c.error === undefined) return false;
  const path = c.args[0]!.split("#")[0]!;
  return path.endsWith("://x/s") || path.endsWith("/shhdrop/s");
}

/** Cas de liens en vigueur : v2.json sans les 12 cas remplacés, puis les 49 de v3-liens.json. */
export function linkCases(): LinkCase[] {
  const v2 = read("v2.json").link as LinkCase[];
  const kept = v2.filter((c) => !superseded(c));
  if (v2.length - kept.length !== 12) throw new Error("cas remplacés de v2.json : 12 attendus");
  const v3 = read("v3-liens.json").link as LinkCase[];
  if (v3.length !== 49) throw new Error("v3-liens.json : 49 cas attendus");
  return [...kept, ...v3];
}

/** Lien écrit d'un partage de v2.json (forme racine) dans la forme en vigueur : « s » avant « # ». */
export const toS = (link: string) => link.replace("#", "s#");
