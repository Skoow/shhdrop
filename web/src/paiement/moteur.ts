// Module des jetons anonymes (conception du paiement §7) : WebAssembly à part (crate
// shhdrop-jetons-wasm, blind-rsa-signatures épinglée), chargé une fois au premier besoin ; jamais
// par les pages de partage, qui gardent le moteur des partages léger. Deux fonctions sans état.
import init, * as wasm from "./pkg/shhdrop_jetons_wasm.js";
import { jetonsWasmBytes } from "./source";

let pret: Promise<void> | undefined;
function charger(): Promise<void> {
  pret ??= jetonsWasmBytes()
    .then((b) => WebAssembly.compile(b))
    .then((m) => init({ module_or_path: m }))
    .then(() => undefined)
    .catch((e: unknown) => {
      pret = undefined; // réessayer au besoin suivant
      throw e;
    });
  return pret;
}

/**
 * Demande d'un jeton Privacy Pass (RFC 9578 type 2) pour la clé publique SPKI du jour : requête
 * (259 octets) et état SECRET (288 octets) à garder jusqu'à la réponse, puis à mettre à zéro.
 */
export async function jetonPreparer(spki: Uint8Array<ArrayBuffer>, emetteur: string): Promise<{ requete: Uint8Array<ArrayBuffer>; etat: Uint8Array<ArrayBuffer> }> {
  await charger();
  return wasm.jetonPreparer(spki, emetteur) as { requete: Uint8Array<ArrayBuffer>; etat: Uint8Array<ArrayBuffer> };
}

/** Jeton final (354 octets), vérifié (« jeton_invalide » sinon). */
export async function jetonFinaliser(spki: Uint8Array<ArrayBuffer>, emetteur: string, etat: Uint8Array<ArrayBuffer>, reponse: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  await charger();
  return wasm.jetonFinaliser(spki, emetteur, etat, reponse) as Uint8Array<ArrayBuffer>;
}
