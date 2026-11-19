//! Liaison WebAssembly des jetons anonymes (conception du paiement §7) : module à part, chargé
//! par le site seulement pour obtenir des jetons (web/src/paiement/), jamais par les pages de
//! partage. Deux fonctions, sans état : la demande (`jetonPreparer`) et le jeton final
//! (`jetonFinaliser`), sur `shhdrop_core::jetons` (blind-rsa-signatures, version épinglée).
#![forbid(unsafe_code)]

use js_sys::{Object, Reflect, Uint8Array};
use shhdrop_core::jetons;
use wasm_bindgen::prelude::*;

fn err(e: shhdrop_core::Error) -> JsValue {
    js_sys::Error::new(&e.to_string()).into()
}

fn bytes(b: &[u8]) -> JsValue {
    Uint8Array::from(b).into()
}

/// Demande d'un jeton pour la clé publique SPKI du jour : `requete` (TokenRequest, 259 octets) et
/// `etat` (nonce et facteur d'aveuglement, SECRET, 288 octets) à garder jusqu'à la réponse.
#[wasm_bindgen(
    js_name = jetonPreparer,
    unchecked_return_type = "{ requete: Uint8Array; etat: Uint8Array }"
)]
pub fn jeton_preparer(spki: &[u8], emetteur: &str) -> Result<JsValue, JsValue> {
    let d = jetons::preparer(spki, emetteur).map_err(err)?;
    let o = Object::new();
    Reflect::set(&o, &"requete".into(), &bytes(&d.requete))?;
    Reflect::set(&o, &"etat".into(), &bytes(&d.etat))?;
    Ok(o.into())
}

/// Jeton final (354 octets) depuis l'état et la réponse du serveur ; signature vérifiée
/// (« jeton_invalide » sinon).
#[wasm_bindgen(js_name = jetonFinaliser, unchecked_return_type = "Uint8Array")]
pub fn jeton_finaliser(
    spki: &[u8],
    emetteur: &str,
    etat: &[u8],
    reponse: &[u8],
) -> Result<JsValue, JsValue> {
    let j = jetons::finaliser(spki, emetteur, etat, reponse).map_err(err)?;
    Ok(bytes(&j))
}
