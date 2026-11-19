// Couche HTTP du paiement (conception du paiement §2, §5.6 ; serveur :
// server/internal/api/handlers_paiement.go). SEUL fichier du site qui écrit l'en-tête X-Shh-Pass
// (source-rules.test.ts), et seulement vers /api/paiement/* :
// - le pass P (32 octets) part en base64url dans l'en-tête, jamais dans l'adresse ni dans un corps ;
// - sans cookie (credentials: "omit"), sans redirection, rien dans l'adresse ;
// - aucune donnée personnelle : ni nom, ni e-mail ; le pays seul, pour la TVA (jamais gardé par
//   le serveur) ;
// - l'adresse de la page hébergée rendue par le serveur est revérifiée ici contre la liste fermée
//   des prestataires (adresseSure) avant toute redirection.
import { b64u } from "../engine/pure";

export type Net = { origin: string; fetch: typeof fetch };

export function netParDefaut(): Net {
  return { origin: globalThis.location?.origin ?? "", fetch: (...a) => globalThis.fetch(...a) };
}

/** Moyens de paiement, noms de l'API. */
export type Moyen = "carte" | "paypal" | "crypto";
export const MOYENS: readonly Moyen[] = ["carte", "paypal", "crypto"];
export type OffrePayante = "plus" | "pro";

export type OffreServeur = { moyens: Moyen[]; pays: string[]; bientot: string[] };

/** Pages hébergées permises (conception §4.4), mêmes débuts d'adresse que le serveur. */
export const ORIGINES: readonly string[] = [
  "https://checkout.stripe.com/",
  "https://www.paypal.com/",
  "https://www.sandbox.paypal.com/",
  "https://nowpayments.io/",
  "https://sandbox.nowpayments.io/",
];

/** Adresse de redirection sûre : https, d'un prestataire de la liste, rien après l'origine qui sorte de son chemin. */
export function adresseSure(u: string): boolean {
  if (u.length > 2048 || /[\u0000- \u007f-￿]/.test(u)) return false;
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.username === "" && url.password === "" && ORIGINES.some((o) => u.startsWith(o) && u.length > o.length && url.origin + "/" === o);
}

type Obj = Record<string, unknown>;
const estObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const chaines = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

async function appel(n: Net, route: string, init: RequestInit): Promise<Response | null> {
  try {
    return await n.fetch(`${n.origin}/api/paiement${route}`, { ...init, credentials: "omit", redirect: "error", cache: "no-store" });
  } catch {
    return null;
  }
}

async function json(r: Response): Promise<Obj | null> {
  try {
    const o: unknown = await r.json();
    return estObj(o) ? o : null;
  } catch {
    return null;
  }
}

/** Offre du serveur ; null : paiement non ouvert sur ce serveur (404), injoignable ou démo. */
export async function lireOffre(n: Net = netParDefaut()): Promise<OffreServeur | null> {
  const r = await appel(n, "", { method: "GET" });
  if (r === null || r.status !== 200) return null;
  const o = await json(r);
  if (o === null || o.v !== 1 || !chaines(o.moyens) || !chaines(o.pays) || !chaines(o.bientot)) return null;
  return { moyens: o.moyens.filter((m): m is Moyen => (MOYENS as readonly string[]).includes(m)), pays: o.pays.filter((p) => /^[A-Z]{2}$/.test(p)), bientot: o.bientot };
}

export type Demande = { offre: OffrePayante; jours: 30 | 365; renouvelle: boolean; moyen: Moyen; pays: string; renonciation: boolean };
export type ErreurCommande = "refus" | "conflit" | "limite" | "occupe" | "prestataire" | "reseau";

const entetePass = (pass: Uint8Array<ArrayBuffer>) => {
  if (pass.length !== 32) throw new Error("pass_invalide");
  return { "X-Shh-Pass": b64u(pass) };
};

/** Commande : adresse de la page hébergée du prestataire (déjà vérifiée), ou la raison du refus. */
export async function commander(pass: Uint8Array<ArrayBuffer>, d: Demande, n: Net = netParDefaut()): Promise<{ url: string } | { erreur: ErreurCommande }> {
  const r = await appel(n, "/commande", {
    method: "POST",
    headers: { ...entetePass(pass), "Content-Type": "application/json" },
    body: JSON.stringify({ offre: d.offre, jours: d.jours, renouvelle: d.renouvelle, moyen: d.moyen, pays: d.pays, renonciation: d.renonciation }),
  });
  if (r === null) return { erreur: "reseau" };
  if (r.status === 200) {
    const o = await json(r);
    if (o !== null && typeof o.url === "string" && adresseSure(o.url)) return { url: o.url };
    return { erreur: "prestataire" };
  }
  switch (r.status) {
    case 400:
      return { erreur: "refus" };
    case 409:
      return { erreur: "conflit" };
    case 429:
      return { erreur: "limite" };
    case 503:
      return { erreur: "occupe" };
    default:
      return { erreur: "prestataire" };
  }
}

export type EtatPaiement = {
  etat: "attente" | "payee" | "non_aboutie" | "anomalie" | "revoquee" | "inconnue";
  offre: OffrePayante | null;
  /** Dernier jour du pass (AAAA-MM-JJ, UTC), exclu. */
  fin: string | null;
  renouvelle: boolean;
  droits: string[];
};
const ETATS: readonly EtatPaiement["etat"][] = ["attente", "payee", "non_aboutie", "anomalie", "revoquee", "inconnue"];

/** État du pass ; null si le serveur ne répond pas (réessayer plus tard). */
export async function lireEtat(pass: Uint8Array<ArrayBuffer>, n: Net = netParDefaut()): Promise<EtatPaiement | null> {
  const r = await appel(n, "/etat", { method: "POST", headers: entetePass(pass) });
  if (r === null || r.status !== 200) return null;
  const o = await json(r);
  if (
    o === null ||
    o.v !== 1 ||
    !(ETATS as readonly unknown[]).includes(o.etat) ||
    !(o.offre === null || o.offre === "plus" || o.offre === "pro") ||
    !(o.fin === null || (typeof o.fin === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.fin))) ||
    typeof o.renouvelle !== "boolean" ||
    !chaines(o.droits)
  )
    return null;
  return { etat: o.etat as EtatPaiement["etat"], offre: o.offre as OffrePayante | null, fin: o.fin as string | null, renouvelle: o.renouvelle, droits: o.droits };
}

/** Arrêt du renouvellement : « ok », « aucun » (pas d'abonnement en cours) ou « erreur ». */
export async function resilier(pass: Uint8Array<ArrayBuffer>, n: Net = netParDefaut()): Promise<"ok" | "aucun" | "erreur"> {
  const r = await appel(n, "/resilier", { method: "POST", headers: entetePass(pass) });
  if (r?.status === 204) return "ok";
  if (r?.status === 409) return "aucun";
  return "erreur";
}
