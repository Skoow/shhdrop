// Démo GitHub Pages : aucun serveur, donc aucun paiement ni jeton ; le module n'est pas livré.
export async function jetonsWasmBytes(): Promise<ArrayBuffer> {
  throw new Error("aucun_jeton");
}
