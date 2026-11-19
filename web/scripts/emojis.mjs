// Liste des émojis du sélecteur du salon (spec §39.5, v3 §3.6.1 : « le sélecteur du site utilise
// la même liste » que le moteur) : séquences « fully-qualified » de engine/salon/data/
// emoji-test-15.0.txt (Unicode émoji 15.0, fichier commité avec son empreinte), par groupe
// Unicode (9 groupes, sans « Component »), SANS les variantes de teinte de peau (U+1F3FB à
// U+1F3FF) : le sélecteur applique la teinte par modificateur. Écrit web/src/salon/emojis.gen.ts ;
// un test (src/salon/emojis.test.ts) vérifie que le fichier écrit est celui que donne la source.
// Usage : node scripts/emojis.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function liste(source) {
  const groupes = [];
  let g = null;
  for (const l of source.split("\n")) {
    const m = /^# group: (.+)$/.exec(l);
    if (m) {
      g = m[1] === "Component" ? null : { nom: m[1], e: [] };
      if (g) groupes.push(g);
      continue;
    }
    if (!g || !/; fully-qualified\s/.test(l)) continue;
    const cps = l.split(";")[0].trim().split(/\s+/).map((h) => parseInt(h, 16));
    if (cps.some((c) => c >= 0x1f3fb && c <= 0x1f3ff)) continue;
    g.e.push(String.fromCodePoint(...cps));
  }
  return groupes;
}

/** Teinte appliquée par modificateur : après le premier point de code, sans le U+FE0F qui suit. */
export function teinter(e, ton) {
  const cps = [...e].map((c) => c.codePointAt(0));
  const reste = cps.slice(1);
  if (reste[0] === 0xfe0f) reste.shift();
  return String.fromCodePoint(cps[0], ton, ...reste);
}
const TONS = [0x1f3fb, 0x1f3fc, 0x1f3fd, 0x1f3fe, 0x1f3ff];

export function module(source) {
  const g = liste(source);
  const toutes = new Set();
  for (const l of source.split("\n")) {
    if (!/; fully-qualified\s/.test(l)) continue;
    toutes.add(String.fromCodePoint(...l.split(";")[0].trim().split(/\s+/).map((h) => parseInt(h, 16))));
  }
  // Indices (dans l'ordre de GROUPES aplati) des émojis dont les 5 teintes par modificateur existent.
  const teintables = [];
  let i = 0;
  for (const x of g)
    for (const e of x.e) {
      if (TONS.every((t) => toutes.has(teinter(e, t)))) teintables.push(i);
      i++;
    }
  return (
    "// Généré par web/scripts/emojis.mjs depuis engine/salon/data/emoji-test-15.0.txt : ne pas modifier.\n" +
    `export const GROUPES: readonly { nom: string; e: readonly string[] }[] = ${JSON.stringify(g.map((x) => ({ nom: x.nom, e: x.e.join(" ") })))}.map((x) => ({ nom: x.nom, e: x.e.split(" ") }));\n` +
    `/** Indices (GROUPES aplati) des émojis qui prennent une teinte de peau par modificateur. */\n` +
    `export const TEINTABLES: ReadonlySet<number> = new Set(${JSON.stringify(teintables)});\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = readFileSync(new URL("../../engine/salon/data/emoji-test-15.0.txt", import.meta.url), "utf8");
  writeFileSync(new URL("../src/salon/emojis.gen.ts", import.meta.url), module(src));
}
