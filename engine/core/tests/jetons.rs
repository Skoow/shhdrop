// Jetons anonymes (conception du paiement §7) : vecteurs communs engine/vectors/privacypass.json,
// rejoués ici et par le serveur Go (circl) ; aller-retour demande → signature aveugle →
// jeton ; refus (autre clé, réponse altérée, jeton altéré, formats).
//
// Régénérer le fichier (une fois, puis relu et figé) :
// SHH_GEN_JETONS=1 cargo test -p shhdrop-core --features jetons --test jetons -- --nocapture
#![cfg(feature = "jetons")]

use blind_rsa_signatures::{
    BlindMessage, DefaultRng, KeyPairSha384PSSDeterministic as Kp,
    SecretKeySha384PSSDeterministic as Sk,
};
use serde_json::{Value, json};
use shhdrop_core::Error;
use shhdrop_core::jetons::{
    ETAT_LEN, JETON_LEN, NK, REQUETE_LEN, cle_id, defi, finaliser, preparer, verifier,
};

const EMETTEUR: &str = "shhgone.test";
const FICHIER: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../vectors/privacypass.json");

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}
fn unhex(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

fn signer(sk: &Sk, requete: &[u8]) -> Vec<u8> {
    sk.blind_sign(BlindMessage(requete[3..].to_vec()))
        .unwrap()
        .0
}

#[test]
fn generer_si_demande() {
    if std::env::var("SHH_GEN_JETONS").as_deref() != Ok("1") {
        return;
    }
    let kp = Kp::generate(&mut DefaultRng, 2048).unwrap();
    let spki = kp.pk.to_spki().unwrap();
    let d = preparer(&spki, EMETTEUR).unwrap();
    let rep = signer(&kp.sk, &d.requete);
    let jeton = finaliser(&spki, EMETTEUR, &d.etat, &rep).unwrap();
    let v = json!({
        "description": "Privacy Pass, RFC 9578 type 0x0002, RSABSSA-SHA384-PSS-Deterministic, 2 048 bits (conception du paiement §7). Clé de TEST seulement (jamais en production). Produit par le moteur Rust (blind-rsa-signatures 0.19.0) ; le serveur Go (circl v1.6.5) doit lire la clé (sk_pkcs8_hex), redonner la même SPKI, signer token_request en token_response (RSA aveugle déterministe) et accepter token ; le moteur doit refaire token depuis etat et token_response.",
        "issuer_name": EMETTEUR,
        "challenge_hex": hex(&defi(EMETTEUR).unwrap()),
        "spki_hex": hex(&spki),
        "token_key_id_hex": hex(&cle_id(&spki)),
        "sk_pkcs8_hex": hex(&kp.sk.to_der().unwrap()),
        "token_request_hex": hex(&d.requete),
        "etat_hex": hex(&d.etat),
        "token_response_hex": hex(&rep),
        "token_hex": hex(&jeton),
    });
    let mut s = serde_json::to_string_pretty(&v).unwrap();
    s.push('\n');
    std::fs::write(FICHIER, s).unwrap();
}

fn vecteurs() -> Value {
    serde_json::from_str(&std::fs::read_to_string(FICHIER).unwrap()).unwrap()
}
fn h(v: &Value, k: &str) -> Vec<u8> {
    unhex(v[k].as_str().unwrap())
}

#[test]
fn vecteurs_communs() {
    let v = vecteurs();
    let spki = h(&v, "spki_hex");
    let e = v["issuer_name"].as_str().unwrap();
    assert_eq!(defi(e).unwrap(), h(&v, "challenge_hex"));
    assert_eq!(cle_id(&spki).to_vec(), h(&v, "token_key_id_hex"));
    let sk = Sk::from_der(&h(&v, "sk_pkcs8_hex")).unwrap();
    assert_eq!(sk.public_key().unwrap().to_spki().unwrap(), spki);
    // La signature aveugle est déterministe : même réponse que le fichier.
    assert_eq!(
        signer(&sk, &h(&v, "token_request_hex")),
        h(&v, "token_response_hex")
    );
    let jeton = finaliser(&spki, e, &h(&v, "etat_hex"), &h(&v, "token_response_hex")).unwrap();
    assert_eq!(jeton, h(&v, "token_hex"));
    verifier(&spki, e, &jeton).unwrap();
    let r = h(&v, "token_request_hex");
    assert_eq!(
        (r.len(), r[0], r[1], r[2]),
        (REQUETE_LEN, 0, 2, cle_id(&spki)[31])
    );
    assert_eq!(&jeton[66..98], &cle_id(&spki));
}

#[test]
fn aller_retour_et_refus() {
    let v = vecteurs();
    let sk = Sk::from_der(&h(&v, "sk_pkcs8_hex")).unwrap();
    let spki = h(&v, "spki_hex");
    let d = preparer(&spki, EMETTEUR).unwrap();
    assert_eq!((d.requete.len(), d.etat.len()), (REQUETE_LEN, ETAT_LEN));
    let rep = signer(&sk, &d.requete);
    let jeton = finaliser(&spki, EMETTEUR, &d.etat, &rep).unwrap();
    assert_eq!(jeton.len(), JETON_LEN);
    verifier(&spki, EMETTEUR, &jeton).unwrap();
    // Deux demandes ne se ressemblent pas (nonce et facteur neufs).
    let d2 = preparer(&spki, EMETTEUR).unwrap();
    assert_ne!(d.requete, d2.requete);
    // Réponse altérée, réponse d'une autre clé, autre émetteur, jeton altéré : refus.
    let mut alt = rep.clone();
    alt[NK - 1] ^= 1;
    assert_eq!(
        finaliser(&spki, EMETTEUR, &d.etat, &alt).err(),
        Some(Error::JetonInvalide)
    );
    let autre = Kp::generate(&mut DefaultRng, 2048).unwrap();
    // Réponse d'une autre clé (signée sur une demande faite pour elle, sinon le message aveuglé
    // peut dépasser son module) : refusée pour notre clé.
    let d_autre = preparer(&autre.pk.to_spki().unwrap(), EMETTEUR).unwrap();
    let rep_autre = signer(&autre.sk, &d_autre.requete);
    assert_eq!(
        finaliser(&spki, EMETTEUR, &d.etat, &rep_autre).err(),
        Some(Error::JetonInvalide)
    );
    assert_eq!(
        verifier(&spki, "autre.test", &jeton).err(),
        Some(Error::JetonInvalide)
    );
    assert_eq!(
        verifier(&autre.pk.to_spki().unwrap(), EMETTEUR, &jeton).err(),
        Some(Error::JetonInvalide)
    );
    for i in [0, 5, 40, 70, 100, JETON_LEN - 1] {
        let mut j = jeton.clone();
        j[i] ^= 0x80;
        assert_eq!(
            verifier(&spki, EMETTEUR, &j).err(),
            Some(Error::JetonInvalide),
            "octet {i}"
        );
    }
    assert_eq!(
        verifier(&spki, EMETTEUR, &jeton[1..]).err(),
        Some(Error::JetonInvalide)
    );
    assert_eq!(
        finaliser(&spki, EMETTEUR, &d.etat[1..], &rep).err(),
        Some(Error::JetonInvalide)
    );
    assert!(preparer(&spki[1..], EMETTEUR).is_err());
    assert!(defi("").is_err() && defi("a b").is_err());
}
