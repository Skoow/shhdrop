// Couche HTTP du compte (conception compte §8.6, §21.6.2 ; serveur : server/internal/api/
// handlers_compte.go). SEUL fichier du compte qui fait des requêtes, et seul fichier du site qui
// écrit l'en-tête X-Shh-Session (source-rules.test.ts) :
// - toutes les routes sont sous /api/compte/ ; le jeton de session ne part vers aucune autre route
//   (ni /api/shares, ni /api/manage, ni /api/salons : la création de salon avec session viendra
//   avec les écrans du salon, C-5, conception §10.4) ;
// - JSON strict : clés exactes, jamais `null` (le serveur le refuse), secrets en base64url sans
//   bourrage ; rien dans l'URL ; sans cookie (credentials: "omit"), sans redirection ;
// - un seul essai : aucune route du compte n'est rejouée d'elle-même (un code, une écriture de
//   coffre ou une connexion ne se renvoient qu'à la demande de l'écran).
// Erreurs : CompteError (code du serveur, essais restants, date, gen, Retry-After) ; coupure
// réseau : Error("reseau") ; réponse 2xx mal formée : Error("reponse_invalide").
import { b64u, unb64u } from "../engine/pure";

export type Net = { origin: string; fetch: typeof fetch };

/** Le serveur du site (même origine) et le fetch du navigateur. */
export function netParDefaut(): Net {
  return { origin: globalThis.location?.origin ?? "", fetch: (...a) => globalThis.fetch(...a) };
}

export class CompteError extends Error {
  readonly attemptsLeft?: number;
  readonly jusqu?: string;
  readonly gen?: number;
  readonly retryAfterS?: number;
  constructor(
    readonly status: number,
    readonly code: string,
    extra: { attemptsLeft?: number; jusqu?: string; gen?: number; retryAfterS?: number } = {},
  ) {
    super(code);
    Object.assign(this, extra);
  }
}

const invalide = () => new Error("reponse_invalide");
type Obj = Record<string, unknown>;
type Bytes = Uint8Array<ArrayBuffer>;

/** Octets en base64url de longueur exacte (`n`), ou de toute longueur (`n` absent). */
function octets(o: Obj, k: string, n?: number): Bytes {
  const v = o[k];
  if (typeof v !== "string") throw invalide();
  let b: Bytes;
  try {
    b = unb64u(v);
  } catch {
    throw invalide();
  }
  if (n !== undefined && b.length !== n) throw invalide();
  return b;
}
function entier(o: Obj, k: string): number {
  const v = o[k];
  if (!Number.isSafeInteger(v) || (v as number) < 0) throw invalide();
  return v as number;
}
/** Jeton de session ou d'étape : 32 octets, gardé tel quel (base64url, 43 caractères). */
function jeton(o: Obj, k: string): string {
  octets(o, k, 32);
  return o[k] as string;
}

async function erreur(r: Response): Promise<CompteError> {
  let j: Obj = {};
  try {
    const v: unknown = await r.json();
    if (typeof v === "object" && v !== null) j = v as Obj;
  } catch {
    // corps absent ou non JSON
  }
  const int = (x: unknown) => (Number.isSafeInteger(x) ? (x as number) : undefined);
  const ra = r.headers.get("Retry-After")?.trim() ?? "";
  return new CompteError(r.status, typeof j.error === "string" ? j.error : `http_${r.status}`, {
    attemptsLeft: int(j.attempts_left),
    jusqu: typeof j.jusqu === "string" ? j.jusqu : undefined,
    gen: int(j.gen),
    retryAfterS: int(j.retry_after_s) ?? (/^\d{1,9}$/.test(ra) ? Number(ra) : undefined),
  });
}

async function appel(n: Net, method: "GET" | "POST" | "PUT", route: string, opts: { session?: string; body?: Obj } = {}): Promise<Obj> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.session !== undefined) headers["X-Shh-Session"] = opts.session;
  let r: Response;
  try {
    r = await n.fetch(`${n.origin}/api/compte${route === "" ? "" : "/" + route}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new Error("reseau");
  }
  if (!r.ok) throw await erreur(r);
  let t: string;
  try {
    t = await r.text();
  } catch {
    throw new Error("reseau");
  }
  try {
    const v: unknown = JSON.parse(t);
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw invalide();
    return v as Obj;
  } catch {
    throw invalide();
  }
}

// --- Inscription -----------------------------------------------------------------------------

/** Preuve anti-robot ALTCHA (mêmes champs que POST /api/shares). */
export type Preuve = { altcha: string; hp: string; shown_at: string };

export async function inscriptionDebut(n: Net, b: { email: string; langue: string } & Preuve): Promise<{ h: Bytes; etape: string }> {
  const o = await appel(n, "POST", "inscription/debut", { body: { email: b.email, langue: b.langue, altcha: b.altcha, hp: b.hp, shown_at: b.shown_at } });
  return { h: octets(o, "h", 16), etape: jeton(o, "etape") };
}

export async function inscriptionRenvoyer(n: Net, etape: string, email: string): Promise<void> {
  await appel(n, "POST", "inscription/renvoyer", { body: { etape, email } });
}

export type FinInscription = {
  etape: string;
  code: string;
  aAuth: Bytes;
  envMdp: Bytes;
  sProfil: Bytes;
  pCanon: string;
  blobProfil: Bytes;
  blobPrive: Bytes;
  persistante: boolean;
  /** Nom d'appareil chiffré (64 octets) ou null (aucun). */
  etiquette: Bytes | null;
};

export async function inscriptionFin(n: Net, b: FinInscription): Promise<{ session: string }> {
  const o = await appel(n, "POST", "inscription/fin", {
    body: {
      etape: b.etape,
      code: b.code,
      a_auth: b64u(b.aAuth),
      env_mdp: b64u(b.envMdp),
      s_profil: b64u(b.sProfil),
      p_canon: b.pCanon,
      blob_profil: b64u(b.blobProfil),
      blob_prive: b64u(b.blobPrive),
      persistante: b.persistante,
      etiquette: b.etiquette === null ? "" : b64u(b.etiquette),
    },
  });
  return { session: jeton(o, "session") };
}

// --- Connexion -------------------------------------------------------------------------------

/** Ce que rend une connexion réussie (§21.6.2). */
export type Ouverture = { session: string; h: Bytes; envMdp: Bytes; sProfil: Bytes; blobProfil: Bytes; genProfil: number; blobPrive: Bytes; genPrive: number };

function ouverture(o: Obj): Ouverture {
  return {
    session: jeton(o, "session"),
    h: octets(o, "h", 16),
    envMdp: octets(o, "env_mdp", 60),
    sProfil: octets(o, "s_profil", 32),
    blobProfil: octets(o, "blob_profil"),
    genProfil: entier(o, "gen_profil"),
    blobPrive: octets(o, "blob_prive"),
    genPrive: entier(o, "gen_prive"),
  };
}

export async function connexion(
  n: Net,
  b: { email: string; aAuth: Bytes; persistante: boolean; etiquette: Bytes | null; preuve?: Preuve },
): Promise<Ouverture | { totp: string }> {
  const body: Obj = { email: b.email, a_auth: b64u(b.aAuth), persistante: b.persistante, etiquette: b.etiquette === null ? "" : b64u(b.etiquette) };
  if (b.preuve) Object.assign(body, { altcha: b.preuve.altcha, hp: b.preuve.hp, shown_at: b.preuve.shown_at });
  const o = await appel(n, "POST", "connexion", { body });
  if (o.totp_requis === true) return { totp: jeton(o, "etape") };
  return ouverture(o);
}

export async function connexionTotp(n: Net, etape: string, code: string): Promise<Ouverture> {
  return ouverture(await appel(n, "POST", "connexion/totp", { body: { etape, code } }));
}

// --- Mot de passe oublié ---------------------------------------------------------------------

export async function oubliDebut(n: Net, b: { email: string; langue: string } & Preuve): Promise<{ etape: string }> {
  const o = await appel(n, "POST", "oubli/debut", { body: { email: b.email, langue: b.langue, altcha: b.altcha, hp: b.hp, shown_at: b.shown_at } });
  return { etape: jeton(o, "etape") };
}

export async function oubliRenvoyer(n: Net, etape: string, email: string): Promise<void> {
  await appel(n, "POST", "oubli/renvoyer", { body: { etape, email } });
}

/**
 * `{ h, gen_prive }` : code juste ; `gen_prive` est indispensable (le nouveau coffre privé porte
 * gen_prive + 1 dans ses données authentifiées). `{ attente_jusqu }` : retrait de la double
 * authentification demandé (§21.2.4).
 */
export async function oubliVerifier(n: Net, b: { etape: string; code: string; totp: string; totpPerdu: boolean }): Promise<{ h: Bytes; genPrive: number } | { attenteJusqu: string }> {
  const o = await appel(n, "POST", "oubli/verifier", { body: { etape: b.etape, code: b.code, totp: b.totp, totp_perdu: b.totpPerdu } });
  if (typeof o.attente_jusqu === "string") return { attenteJusqu: o.attente_jusqu };
  return { h: octets(o, "h", 16), genPrive: entier(o, "gen_prive") };
}

export async function oubliFin(
  n: Net,
  b: { etape: string; aAuth: Bytes; envMdp: Bytes; blobPrive: Bytes; persistante: boolean; etiquette: Bytes | null },
): Promise<{ session: string; h: Bytes; sProfil: Bytes; blobProfil: Bytes; genProfil: number; genPrive: number }> {
  const o = await appel(n, "POST", "oubli/fin", {
    body: { etape: b.etape, a_auth: b64u(b.aAuth), env_mdp: b64u(b.envMdp), blob_prive: b64u(b.blobPrive), persistante: b.persistante, etiquette: b.etiquette === null ? "" : b64u(b.etiquette) },
  });
  return { session: jeton(o, "session"), h: octets(o, "h", 16), sProfil: octets(o, "s_profil", 32), blobProfil: octets(o, "blob_profil"), genProfil: entier(o, "gen_profil"), genPrive: entier(o, "gen_prive") };
}

// --- Coffres, pseudo, déconnexion (session) ---------------------------------------------------

export async function lireCoffre(n: Net, session: string, sorte: "profil" | "prive"): Promise<{ blob: Bytes; gen: number }> {
  const o = await appel(n, "GET", `coffre/${sorte}`, { session });
  return { blob: octets(o, "blob"), gen: entier(o, "gen") };
}

export async function ecrireCoffre(n: Net, session: string, sorte: "profil" | "prive", ifGen: number, blob: Bytes): Promise<number> {
  return entier(await appel(n, "PUT", `coffre/${sorte}`, { session, body: { if_gen: ifGen, blob: b64u(blob) } }), "gen");
}

/** Pseudo libre ? Pendant l'inscription par l'étape, ensuite par la session. */
export async function pseudoVerifier(n: Net, par: { jeton: string } | { etape: string }, pCanon: string): Promise<boolean> {
  const o = "jeton" in par ? await appel(n, "POST", "pseudo/verifier", { session: par.jeton, body: { p_canon: pCanon } }) : await appel(n, "POST", "pseudo/verifier", { body: { etape: par.etape, p_canon: pCanon } });
  if (typeof o.libre !== "boolean") throw invalide();
  return o.libre;
}

export async function changerPseudo(n: Net, session: string, pCanon: string): Promise<void> {
  await appel(n, "POST", "pseudo", { session, body: { p_canon: pCanon } });
}

export async function deconnexion(n: Net, session: string): Promise<void> {
  await appel(n, "POST", "deconnexion", { session, body: {} });
}
