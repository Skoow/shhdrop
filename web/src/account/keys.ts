// Clés du compte sur l'appareil (conception compte §6, §21.2.2). Aucune construction nouvelle :
// dérivations (Argon2id, HKDF-SHA-256) par le moteur Rust (src/engine/), AES-256-GCM et aléa par
// WebCrypto, comme les vecteurs communs engine/vectors/compte.json (rejoués par keys.test.ts).
// - Env_mdp = nonce (12) ‖ AES-256-GCM(KEK_mdp, nonce, K_compte, AD = « SHH-CENV1 » ‖ h ‖ « mdp »)
//   = 60 octets ;
// - K_prive = HKDF(K_compte, « shhdrop/v2/compte/blob »), K_etiquette = HKDF(K_compte,
//   « shhdrop/v2/compte/appareil »), K_profil = HKDF(s_profil, « shhdrop/v2/compte/profil ») :
//   importées NON EXTRACTIBLES dans WebCrypto, octets dérivés mis à zéro aussitôt.
import { cleAppareil, clePrive, cleProfil } from "../engine/index";
import { concat, utf8 } from "../engine/pure";

type Bytes = Uint8Array<ArrayBuffer>;
const ENV_LEN = 60;
const adEnveloppe = (h: Uint8Array) => concat(utf8("SHH-CENV1"), h, utf8("mdp"));

/** 32 octets aléatoires (K_compte, s_profil) ; l'appelant les efface après usage. */
export function aleatoire32(): Bytes {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function aes(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as Bytes, "AES-GCM", false, usages);
}

/** Env_mdp (60 octets) ; `nonce` seulement pour les vecteurs (sinon tiré au hasard). */
export async function scellerEnveloppe(kekMdp: Uint8Array, h: Uint8Array, kCompte: Uint8Array, nonce?: Uint8Array): Promise<Bytes> {
  const iv = (nonce ?? crypto.getRandomValues(new Uint8Array(12))) as Bytes;
  const k = await aes(kekMdp, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: adEnveloppe(h) }, k, kCompte as Bytes));
  return concat(iv, ct);
}

/** K_compte ; tout défaut (taille, h, clé, octet changé) : Error("enveloppe_invalide"). */
export async function ouvrirEnveloppe(kekMdp: Uint8Array, h: Uint8Array, env: Uint8Array): Promise<Bytes> {
  if (env.length !== ENV_LEN) throw new Error("enveloppe_invalide");
  try {
    const k = await aes(kekMdp, ["decrypt"]);
    const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: env.slice(0, 12), additionalData: adEnveloppe(h) }, k, env.slice(12)));
    if (pt.length !== 32) throw new Error();
    return pt;
  } catch {
    throw new Error("enveloppe_invalide");
  }
}

/** Clés non extractibles des deux coffres et du nom d'appareil. */
export type ClesCompte = { prive: CryptoKey; profil: CryptoKey; etiquette: CryptoKey };

async function importer(derive: Promise<Uint8Array>): Promise<CryptoKey> {
  const raw = await derive;
  try {
    return await aes(raw, ["encrypt", "decrypt"]);
  } finally {
    raw.fill(0);
  }
}

/** Clés tirées de K_compte seul (coffre privé, nom d'appareil) : récupération, avant s_profil. */
export async function clesDeKCompte(kCompte: Uint8Array): Promise<Omit<ClesCompte, "profil">> {
  return { prive: await importer(clePrive(kCompte)), etiquette: await importer(cleAppareil(kCompte)) };
}

export async function clesDuCompte(kCompte: Uint8Array, sProfil: Uint8Array): Promise<ClesCompte> {
  return { ...(await clesDeKCompte(kCompte)), profil: await importer(cleProfil(sProfil)) };
}
