// Site construit AVEC le compte (SHH_SITE_COMPTES=1, drapeau __COMPTES__ ; vite.config.ts,
// comptesActifs) dans web/dist-comptes, pour compte.spec.ts seulement. Construit à la demande,
// une fois par exécution de Playwright, par le premier worker qui en a besoin : une exécution
// qui ne lance pas compte.spec.ts ne paie rien. Pourquoi pas dans global-setup : Playwright ne
// lui dit pas quels fichiers de test sont choisis (et `--project` prend plusieurs valeurs, ce
// qui rend la lecture de la ligne de commande peu sûre) ; un oubli y casserait les tests du compte.
// Plusieurs workers : un seul construit (verrou = dossier créé atomiquement, avec le pid du
// constructeur) ; les autres attendent la marque de l'exécution (SHH_UI_RUN, tirée par
// global-setup). Le build est vérifié par `check-dist.mjs --comptes` avant d'être servi.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = fileURLToPath(new URL("..", import.meta.url));
export const DIST_COMPTES = join(WEB, "dist-comptes");
const MARQUE = join(DIST_COMPTES, ".execution");
const VERROU = join(WEB, ".dist-comptes.verrou");

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const vivant = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function construire(): void {
  const env = { ...process.env, SHH_SITE_COMPTES: "1" };
  const opts = { cwd: WEB, env, stdio: "inherit" as const };
  // Moteur WebAssembly déjà construit par global-setup (npm run build) : vite seulement.
  execFileSync("npx", ["vite", "build", "--outDir", "dist-comptes"], opts);
  execFileSync("npx", ["vite", "build", "-c", "vite.pdf-frame.config.ts", "--outDir", "dist-comptes"], opts);
  execFileSync(process.execPath, ["scripts/check-dist.mjs", "--comptes", "dist-comptes"], opts);
}

/** Rend le dossier du site avec compte, construit pour CETTE exécution (au plus 5 min d'attente). */
export async function siteComptes(): Promise<string> {
  const run = process.env.SHH_UI_RUN;
  if (!run) throw new Error("SHH_UI_RUN absent : global-setup n'a pas tourné");
  const pret = () => existsSync(MARQUE) && readFileSync(MARQUE, "utf8") === run;
  const fin = Date.now() + 300_000;
  while (!pret()) {
    let pris = false;
    try {
      mkdirSync(VERROU);
      pris = true;
    } catch {
      // un autre worker construit ; verrou abandonné (worker mort) : retiré
      let pid = NaN;
      try {
        pid = Number(readFileSync(join(VERROU, "pid"), "utf8"));
      } catch {
        // pid pas encore écrit
      }
      if (Number.isInteger(pid) && !vivant(pid)) rmSync(VERROU, { recursive: true, force: true });
    }
    if (pris) {
      try {
        writeFileSync(join(VERROU, "pid"), String(process.pid));
        if (!pret()) {
          construire();
          writeFileSync(MARQUE, run);
        }
      } finally {
        rmSync(VERROU, { recursive: true, force: true });
      }
      continue;
    }
    if (Date.now() > fin) throw new Error("dist-comptes : build pas fini en 5 min");
    await dormir(500);
  }
  return DIST_COMPTES;
}
