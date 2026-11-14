// « Rester connecté sur cet appareil » (conception compte §9, D7 : case décochée par défaut).
// EXCEPTION ÉCRITE à « aucun stockage navigateur » (source-rules.test.ts) : seulement si la
// personne coche la case ; base IndexedDB `shhdrop-compte`, nommée et lue seulement ici.
// - Un seul enregistrement : jeton de session, h, K_compte, s_profil et plus grands gen vus,
//   chiffrés AES-256-GCM par une clé créée NON EXTRACTIBLE et gardée dans la base (même mécanisme
//   que l'historique, history/store.ts). Honnêtement : la clé est sur le même appareil ; cela
//   ne protège que d'une lecture naïve du stockage. La vraie protection est le verrouillage de
//   l'appareil (texte sous la case : « À éviter sur un appareil partagé. »).
// - s_profil est gardé parce que seul `connexion` le rend : sans lui, un rechargement ne
//   rouvrirait pas le profil.
// - Déconnexion : la base entière est supprimée (clé comprise).
// - Limite (faible) : le jeton et les clés passent par une chaîne JSON le temps du chiffrement ;
//   une chaîne JavaScript ne s'efface pas.
// Apps (D42-20) : trousseau du système à la place, même contenu.
import { idbBackend, type Backend } from "../history/store";
import { b64u, unb64u, utf8 } from "../engine/pure";

export const COMPTE_DB = "shhdrop-compte";
const ID = "session";
const AAD = utf8("shhdrop-compte/v1/session");

export type Sauvegarde = { jeton: string; h: Uint8Array; kCompte: Uint8Array; sProfil: Uint8Array; genProfil: number; genPrive: number };

/** IndexedDB du navigateur, ou null (refusé : navigation privée de certains navigateurs, cadres). */
export function idbDuNavigateur(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

const base = (idb: IDBFactory): Backend => idbBackend(idb, COMPTE_DB);

export async function sauver(idb: IDBFactory, s: Sauvegarde): Promise<void> {
  const b = base(idb);
  const key = await b.key(await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]));
  const pt = utf8(JSON.stringify({ jeton: s.jeton, h: b64u(s.h as Uint8Array<ArrayBuffer>), k_compte: b64u(s.kCompte as Uint8Array<ArrayBuffer>), s_profil: b64u(s.sProfil as Uint8Array<ArrayBuffer>), gen_profil: s.genProfil, gen_prive: s.genPrive }));
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, pt));
    await b.put(ID, { iv, ct });
  } finally {
    pt.fill(0);
  }
}

/** La session gardée ; null si aucune base (rien n'est créé), ou enregistrement illisible. */
export async function lire(idb: IDBFactory): Promise<Sauvegarde | null> {
  const b = base(idb);
  try {
    if (!(await b.exists())) return null;
    const key = await b.key(await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]));
    const rec = (await b.all()).find(([id]) => id === ID)?.[1];
    if (!(rec?.iv instanceof Uint8Array) || !(rec.ct instanceof Uint8Array)) return null;
    const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.iv, additionalData: AAD }, key, rec.ct));
    const o = JSON.parse(new TextDecoder().decode(pt)) as Record<string, unknown>;
    pt.fill(0);
    const bytes = (k: string, n: number) => {
      const v = unb64u(o[k] as string);
      if (v.length !== n) throw new Error();
      return v;
    };
    const gen = (k: string) => {
      if (!Number.isSafeInteger(o[k]) || (o[k] as number) < 0) throw new Error();
      return o[k] as number;
    };
    if (typeof o.jeton !== "string" || unb64u(o.jeton).length !== 32) return null;
    return { jeton: o.jeton, h: bytes("h", 16), kCompte: bytes("k_compte", 32), sProfil: bytes("s_profil", 32), genProfil: gen("gen_profil"), genPrive: gen("gen_prive") };
  } catch {
    return null;
  }
}

export async function effacer(idb: IDBFactory): Promise<void> {
  await base(idb).drop();
}
