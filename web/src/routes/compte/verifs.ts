// Vérifications faites sur l'appareil pendant la saisie (propriétaire, 20 novembre) : adresse
// jetable (même liste que le serveur, chargée seulement sur la page d'inscription), faute de
// frappe probable dans un domaine courant, et ce qui manque à un nouveau mot de passe. Rien
// n'est envoyé : le serveur refait ses propres contrôles (jetable, format) à l'inscription.
// Import statique (règle des sources : pas de chargement dynamique dans routes/) ; ce module n'est inclus
// que dans le site avec compte (__COMPTES__ : pages du compte), jamais dans le site public. La
// liste elle-même n'est pas dans le script en production : listes/jetables.verified.ts la lit
// (fichier à part, empreinte vérifiée) à la première adresse vérifiée.
import { lireJetables } from "../../listes/jetables";
import type { Key } from "../../i18n/i18n.svelte";

let liste: Promise<Set<string>> | null = null;

/** Domaines jetables (server/internal/compte/jetables*.txt, mêmes listes que le serveur), lus une fois ; un échec de lecture sera retenté. */
function domainesJetables(): Promise<Set<string>> {
  if (liste) return liste;
  const p = lireJetables().then((l) => new Set(l));
  p.catch(() => {
    if (liste === p) liste = null;
  });
  return (liste = p);
}

/**
 * Vrai si le domaine de l'adresse (ou un domaine parent) est jetable. Liste illisible (réseau) :
 * faux, l'inscription continue ; le serveur refait le contrôle (même liste) et refuse l'adresse.
 */
export async function estJetable(adresse: string): Promise<boolean> {
  const i = adresse.lastIndexOf("@");
  if (i < 0) return false;
  const parts = adresse.slice(i + 1).trim().toLowerCase().replace(/\.$/, "").split(".");
  let s: Set<string>;
  try {
    s = await domainesJetables();
  } catch {
    return false;
  }
  for (let k = 0; k < parts.length - 1; k++) if (s.has(parts.slice(k).join("."))) return true;
  return false;
}

/** Domaines courants : une faute de frappe proche (« gmial.com ») est signalée avec la correction. */
const COURANTS = [
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.fr",
  "outlook.com",
  "outlook.fr",
  "live.com",
  "live.fr",
  "msn.com",
  "yahoo.com",
  "yahoo.fr",
  "icloud.com",
  "me.com",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "bbox.fr",
  "proton.me",
  "protonmail.com",
  "gmx.fr",
  "gmx.com",
];

/**
 * Vrais domaines de messagerie à une lettre d'un domaine courant (audit du 20 novembre) : jamais
 * « corrigés » (« ymail.com » n'est pas une faute pour « gmail.com »).
 */
const REELS = new Set([
  "ymail.com",
  "mail.com",
  "email.com",
  "gmx.de",
  "gmx.net",
  "aol.com",
  "aol.fr",
  "mac.com",
  "pm.me",
  "live.be",
  "live.ca",
  "hotmail.be",
  "hotmail.de",
  "hotmail.it",
  "hotmail.es",
  "outlook.be",
  "outlook.de",
  "outlook.es",
  "outlook.it",
  "yahoo.de",
  "yahoo.es",
  "yahoo.it",
  "yahoo.ca",
  "proton.ch",
  "neuf.fr",
  "club.fr",
]);

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + c);
      // Deux lettres inversées (« gmial ») comptent pour une seule faute.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  return d[a.length]![b.length]!;
}

/** Adresse corrigée si son domaine ressemble à un domaine courant sans l'être, sinon null. */
export function suggestion(adresse: string): string | null {
  const i = adresse.lastIndexOf("@");
  if (i <= 0) return null;
  const dom = adresse.slice(i + 1).trim().toLowerCase();
  if (dom.length < 4 || COURANTS.includes(dom) || REELS.has(dom)) return null;
  let mieux: string | null = null;
  let best = 3;
  for (const c of COURANTS) {
    const n = distance(dom, c);
    // Une seule faute (lettre en trop, en moins, changée, ou deux lettres inversées) : à deux,
    // « yopmail.com » ressemblerait à « hotmail.com ».
    if (n < best && n <= 1) {
      best = n;
      mieux = c;
    }
  }
  return mieux ? `${adresse.slice(0, i)}@${mieux}` : null;
}

/** Règles d'un nouveau mot de passe, dans l'ordre affiché sous le champ. */
export const REGLES_MDP = ["longueur", "minuscule", "majuscule", "chiffre", "signe", "adresse"] as const;
export type RegleMdp = (typeof REGLES_MDP)[number];
export const cleRegle = (r: RegleMdp) => `account.mdp.regle.${r}` as Key;

/**
 * Ce que remplit un nouveau mot de passe (20 novembre : « assez fort ») : 10 caractères au moins
 * (comme le moteur), une minuscule, une majuscule, un chiffre, un signe, et différent de
 * l'adresse. Les apps appliquent la même règle (spécification, conception du compte §6).
 */
export function reglesMdp(mdp: string, adresse: string): Record<RegleMdp, boolean> {
  const t = mdp.trim();
  const a = adresse.trim().toLowerCase();
  const local = a.includes("@") ? a.slice(0, a.lastIndexOf("@")) : a;
  const bas = t.toLowerCase();
  return {
    longueur: [...t].length >= 10,
    minuscule: /\p{Ll}/u.test(t),
    majuscule: /\p{Lu}/u.test(t),
    chiffre: /\p{Nd}/u.test(t),
    signe: /[^\p{L}\p{N}\s]/u.test(t),
    adresse: t.length > 0 && (a === "" || (bas !== a && bas !== local)),
  };
}

/** Vrai si toutes les règles sont remplies. */
export const mdpFort = (mdp: string, adresse: string) => Object.values(reglesMdp(mdp, adresse)).every(Boolean);
