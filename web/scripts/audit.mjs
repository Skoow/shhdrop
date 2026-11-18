// npm audit (CI, job web) : échec dès « high », sauf avis listés dans audit-exceptions.json,
// chacun avec sa raison et une date de fin (au-delà, l'exception ne vaut plus et la CI échoue).
// Usage : node scripts/audit.mjs [dossier]  (dossier contenant package-lock.json ; défaut « . »).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? ".";
const here = new URL(".", import.meta.url).pathname;
const allow = JSON.parse(readFileSync(join(here, "..", "audit-exceptions.json"), "utf8"));
const today = new Date().toISOString().slice(0, 10);
const live = new Map(allow.filter((a) => a.until >= today).map((a) => [a.id, a]));

let out;
try {
  out = execFileSync("npm", ["audit", "--json"], { cwd: dir, encoding: "utf8" });
} catch (e) {
  out = e.stdout; // npm audit sort en erreur dès qu'il trouve un avis
}
const report = JSON.parse(out);
const LEVELS = ["info", "low", "moderate", "high", "critical"];
const bad = [];
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via !== "object") continue; // dépendance d'un paquet vulnérable : compté à la source
    if (LEVELS.indexOf(via.severity) < LEVELS.indexOf("high")) continue;
    const id = String(via.url ?? "").split("/").pop();
    if (live.has(id)) console.log(`exception (${live.get(id).until}) : ${name} ${id} — ${live.get(id).reason}`);
    else bad.push(`${name} ${via.severity} ${via.url}`);
  }
}
for (const a of allow) if (a.until < today) console.log(`exception échue (${a.until}) : ${a.id}`);
if (bad.length) {
  console.error("Avis « high » ou plus sans exception :\n" + bad.join("\n"));
  process.exit(1);
}
console.log(`npm audit (${dir}) : rien de « high » hors exceptions.`);
