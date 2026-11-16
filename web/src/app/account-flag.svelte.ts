// Compte ouvert sur cet appareil, vu par la coque (en-tête, menu, pied, onglets) : un seul
// booléen, posé par history/live.svelte.ts (setAccountPrefs). Module à part pour que la coque des
// pages d'information n'emporte ni l'historique, ni le client d'envoi, ni le moteur (pages
// séparées, conception du 16 novembre).
export const accountFlag = $state({ connected: false });
