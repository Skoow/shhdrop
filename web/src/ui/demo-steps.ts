// Infographie de l'accueil (SecureDemo.svelte, refonte du 12 novembre) : rythme et étapes.
/** Durée d'une étape : 7 × 2,8 s ≈ une boucle de 20 s (frappe plus lente, 17 novembre : une
 *  ligne de l'attaquant, tapée 0,9 s après celle de l'étape, doit finir avant l'étape suivante). */
export const STEP_MS = 2800;
/** Étapes, dans l'ordre (textes demo.sN.t et demo.sN.d). */
export const STEPS = [1, 2, 3, 4, 5, 6, 7] as const;
