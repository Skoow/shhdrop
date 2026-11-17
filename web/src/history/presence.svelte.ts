// « Mes partages » n'est montré que s'il y a quelque chose dedans (décision du propriétaire du
// 17 novembre). Module léger, sans dépendance : l'en-tête et le menu des pages d'information le
// lisent sans charger l'historique ni le moteur. Rien n'est écrit : on lit seulement.
//  - Accueil, envoi, page « /s » : l'historique de l'appareil est lu (live.svelte.ts) et pose
//    `any` d'après ses entrées.
//  - Pages d'information : seule l'existence de la base de l'historique est vérifiée
//    (indexedDB.databases(), sans l'ouvrir ni la créer) ; une base vide compte comme « quelque
//    chose » (rare : la liste dit alors qu'elle est vide).
export const presence = $state({ any: false });

const HISTORY_DB = "shhdrop-history";

/** Pages d'information : vrai si la base de l'historique existe sur cet appareil. */
export async function probeHistory(idb: Pick<IDBFactory, "databases"> | undefined = globalThis.indexedDB): Promise<void> {
  try {
    const dbs = (await idb?.databases?.()) ?? [];
    if (dbs.some((d) => d.name === HISTORY_DB)) presence.any = true;
  } catch {
    // Navigation privée, stockage refusé : rien à montrer.
  }
}
