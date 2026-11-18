// Infographie de l'accueil (SecureDemo.svelte, refonte du 12 novembre) : rythme et étapes.
/** Durée d'une étape : 7 × 3 s = une boucle de 21 s (la plus longue, l'étape 4, tape deux lignes
 *  et leurs états, soit 71 lettres à TYPE_MS, environ 2,5 s, avant l'étape suivante). */
export const STEP_MS = 3000;
/** Frappe du journal : une lettre toutes les 35 ms (18 novembre). */
export const TYPE_MS = 35;
/** Pause avant la ligne de l'attaquant, en lettres (8 × 35 ms ≈ 0,3 s). */
export const PAUSE = 8;
/** Étapes, dans l'ordre (textes demo.sN.t et demo.sN.d). */
export const STEPS = [1, 2, 3, 4, 5, 6, 7] as const;
