// Paliers payants (spec §38.8.1, conception du paiement §11) : vecteurs communs
// engine/vectors/v5-paliers.json (calculés par Python, rejoués aussi par le serveur Go), puis un
// partage Plus de 3 Gio scellé et rouvert (palier 81 921) ; le lecteur accepte un palier payant
// sans connaître la formule, et refuse un palier non canonique.
mod support;

use serde_json::Value;
use shhdrop_core::elements::{
    FinalEntry, FinalKind, data_chunks, data_segments, reservation_for, reservation_for_palier,
    seal_final, seal_final_palier,
};
use shhdrop_core::envelope::{ContentKeys, content_keys, new_seed};
use shhdrop_core::format::{
    CHUNK, CHUNK_CT, HEADER, PAID_BUCKETS, Palier, SEG_CHUNKS, bucket_for, bucket_for_palier,
    is_bucket, segment_count, segment_size,
};
use shhdrop_core::native::RustCrypto;
use shhdrop_core::reader::{Reader, Segments};
use shhdrop_core::{Error, Result};
use std::rc::Rc;
use support::{block_on, platform};
use zeroize::Zeroizing;

fn palier(s: &str) -> Palier {
    match s {
        "gratuit" => Palier::Gratuit,
        "plus" => Palier::Plus,
        "pro" => Palier::Pro,
        _ => panic!("{s}"),
    }
}

#[test]
fn vecteurs_communs() {
    let v: Value = serde_json::from_str(include_str!("../../vectors/v5-paliers.json")).unwrap();
    let paid: Vec<u32> = v["paid_buckets"]
        .as_array()
        .unwrap()
        .iter()
        .map(|x| x.as_u64().unwrap() as u32)
        .collect();
    assert_eq!(paid, PAID_BUCKETS.to_vec());
    for (nom, d) in v["paliers"].as_object().unwrap() {
        let p = palier(nom);
        assert_eq!(Palier::de(d["tier"].as_u64().unwrap() as u8), Some(p));
        assert_eq!(u64::from(p.max_bucket()), d["max_bucket"].as_u64().unwrap());
        assert_eq!(p.content_max(), d["content_max"].as_u64().unwrap());
        assert_eq!(
            u64::from(data_segments(p)),
            d["data_segments"].as_u64().unwrap()
        );
    }
    let mut n = 0;
    for c in v["bucket_for"].as_array().unwrap() {
        let p = palier(c["palier"].as_str().unwrap());
        let got = bucket_for_palier(c["data_end"].as_u64().unwrap(), p);
        match c.get("bucket") {
            Some(b) => assert_eq!(got, Ok(b.as_u64().unwrap() as u32), "{c}"),
            None => assert_eq!(got, Err(Error::TropGros), "{c}"),
        }
        if p == Palier::Gratuit {
            assert_eq!(
                bucket_for(c["data_end"].as_u64().unwrap()),
                got,
                "bucket_for inchangé : {c}"
            );
        }
        n += 1;
    }
    assert!(n > 80);
    for c in v["reservation_for"].as_array().unwrap() {
        let p = palier(c["palier"].as_str().unwrap());
        let got = reservation_for_palier(c["used"].as_u64().unwrap(), p);
        match c.get("bucket") {
            Some(b) => assert_eq!(got, Ok(b.as_u64().unwrap() as u32), "{c}"),
            None => assert_eq!(got, Err(Error::TropGros), "{c}"),
        }
        if p == Palier::Gratuit {
            assert_eq!(reservation_for(c["used"].as_u64().unwrap()), got);
        }
    }
    assert!(PAID_BUCKETS.iter().all(|&b| is_bucket(b)) && !is_bucket(81_920));
    assert_eq!(Palier::de(3), None);
}

fn keys(p: &Rc<RustCrypto>) -> ContentKeys<RustCrypto> {
    block_on(content_keys(p, &new_seed(&**p).unwrap())).unwrap()
}

fn fichier(size: u64) -> FinalEntry {
    FinalEntry {
        kind: FinalKind::File(None),
        name: "grand.bin".into(),
        mime: "application/octet-stream".into(),
        size,
        first: 0,
        k: Zeroizing::new([7; 32]),
        sha256: None,
    }
}

/// Source paresseuse d'un grand palier : segment 0 (en-tête puis zéros), dernier segment
/// (zéros puis le morceau chiffré du manifeste) ; les autres ne sont jamais demandés à
/// l'ouverture.
struct Grand {
    bucket: u32,
    header: Vec<u8>,
    tail: Vec<u8>,
}

impl Segments for &Grand {
    async fn fetch(&self, n: u32) -> Result<Vec<u8>> {
        let size = segment_size(self.bucket, n).ok_or(Error::PaquetCorrompu)?;
        let mut s = vec![0u8; size];
        if n == 0 {
            s[..HEADER].copy_from_slice(&self.header);
        }
        if n == segment_count(self.bucket) - 1 {
            let at = size - CHUNK_CT;
            s[at..].copy_from_slice(&self.tail);
        }
        Ok(s)
    }
}

#[test]
fn partage_plus_de_3_gio_scelle_puis_rouvert() {
    let p = platform(51);
    let k = keys(&p);
    let size = 3 << 30;
    // Gratuit : trop gros ; Plus : palier 81 921 (5 Gio).
    assert_eq!(
        block_on(seal_final(&[fichier(size)], &keys(&p), None, None)).err(),
        Some(Error::TropGros)
    );
    let fin = block_on(seal_final_palier(
        &[fichier(size)],
        &k,
        None,
        None,
        Palier::Plus,
    ))
    .unwrap();
    assert_eq!(fin.bucket, 81_921);
    let src = Grand {
        bucket: fin.bucket,
        header: fin.header.to_vec(),
        tail: fin.tail.clone(),
    };
    let rd = block_on(Reader::open(&p, &src, fin.bucket, &k)).unwrap();
    drop(rd);
    // Palier annoncé plus grand (non canonique) : refusé.
    let faux = Grand {
        bucket: 163_841,
        header: fin.header.to_vec(),
        tail: fin.tail.clone(),
    };
    assert!(block_on(Reader::open(&p, &faux, 163_841, &k)).is_err());
    // Au-delà de la formule : refus ; Pro : 30 Gio au plus.
    assert_eq!(
        block_on(seal_final_palier(
            &[fichier(11 << 30)],
            &keys(&p),
            None,
            None,
            Palier::Plus
        ))
        .err(),
        Some(Error::TropGros)
    );
    let pro = block_on(seal_final_palier(
        &[fichier(29 << 30)],
        &keys(&p),
        None,
        None,
        Palier::Pro,
    ))
    .unwrap();
    assert_eq!(pro.bucket, 491_521);
    assert_eq!(data_chunks(Palier::Pro), 7680 * u64::from(SEG_CHUNKS));
    assert_eq!(Palier::Pro.content_max(), 30 * (1 << 30));
    let _ = CHUNK;
}
