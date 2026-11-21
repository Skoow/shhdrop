// Domaines d'adresses jetables (conception du compte §5.3) : mêmes listes que le serveur
// (server/internal/compte/jetables*.txt). Ce module sert aux tests, à `vite dev` et à la démo
// (sa CSP, connect-src 'none', interdit tout fetch) : listes intégrées au script. En production,
// le greffon shh-jetables (vite.config.ts) le remplace par jetables.verified.ts : un fichier à
// part, lu seulement par la page d'inscription (U13 : 52 Ko en brotli de moins pour l'accueil).
import jetablesTxt from "../../../server/internal/compte/jetables.txt?raw";
import jetablesAjoutsTxt from "../../../server/internal/compte/jetables-ajouts.txt?raw";

/** Domaines d'un fichier de liste : une ligne par domaine, « # » pour un commentaire. */
export function domainesDe(txt: string): string[] {
  const out: string[] = [];
  for (const l of txt.split("\n")) {
    const d = l.trim().toLowerCase();
    if (d && !d.startsWith("#")) out.push(d);
  }
  return out;
}

export async function lireJetables(): Promise<readonly string[]> {
  return [...domainesDe(jetablesTxt), ...domainesDe(jetablesAjoutsTxt)];
}
