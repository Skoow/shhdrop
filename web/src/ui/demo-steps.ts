// Infographie de l'accueil (SecureDemo.svelte, refonte du 12 novembre) : rythme et étapes.
/** Durée la plus longue d'une étape (borne des tests et des attentes). */
export const STEP_MS = 9000;
/** Durée la plus courte d'une étape. */
export const STEP_MIN_MS = 3500;
/**
 * Durée d'une étape selon la quantité de texte affichée sous la scène (titre et description ;
 * propriétaire, 20 novembre : « adapter la vitesse à la quantité de texte ») : 1,5 s, plus
 * 55 ms par caractère (environ 18 caractères par seconde, une lecture posée), entre 3,5 et 9 s.
 */
export function dureeEtape(texte: string): number {
  return Math.min(STEP_MS, Math.max(STEP_MIN_MS, 1500 + [...texte].length * 55));
}
/** Frappe du journal : une lettre toutes les 35 ms (18 novembre). */
export const TYPE_MS = 35;
/** Pause avant la ligne de l'attaquant, en lettres (8 × 35 ms ≈ 0,3 s). */
export const PAUSE = 8;
/** Étapes, dans l'ordre (textes demo.sN.t et demo.sN.d). */
export const STEPS = [1, 2, 3, 4, 5, 6, 7] as const;
