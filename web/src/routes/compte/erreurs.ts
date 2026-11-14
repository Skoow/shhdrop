// Textes des erreurs des pages du compte (conception compte §12.1, §12.2, §21.3, §21.15) : une
// erreur du module de compte (CompteError du serveur, ou code de l'appareil) devient le message
// exact, rattaché à son champ quand il en a un. Rien d'autre que des textes fixes et des nombres :
// jamais l'adresse, le pseudo ni la réponse brute du serveur.
import { formatDuration } from "../../i18n/format";
import { getLang, t } from "../../i18n/i18n.svelte";

export type Champ = "email" | "mdp" | "pseudo" | "code" | "totp" | "photo";
export type Erreur = { champ?: Champ; texte: string };
/** Où l'erreur arrive : la même 404 (étape échue) ou 503 ne se disent pas de la même façon. */
export type Moment = "inscription" | "code" | "connexion" | "totp" | "oubli";

const CHAMP_CODE: Record<string, [Champ, Parameters<typeof t>[0]]> = {
  adresse_invalide: ["email", "account.err.email"],
  adresse_non_ascii: ["email", "account.err.ascii"],
  jetable: ["email", "account.err.jetable"],
  mdp_court: ["mdp", "account.err.mdpCourt"],
  mdp_long: ["mdp", "account.err.mdpLong"],
  mdp_adresse: ["mdp", "account.err.mdpAdresse"],
  mot_de_passe_vide: ["mdp", "account.err.mdpCourt"],
  pseudo_longueur: ["pseudo", "account.err.pseudoLongueur"],
  pseudo_caracteres: ["pseudo", "account.err.pseudoCaracteres"],
  pseudo_ecritures: ["pseudo", "account.err.pseudoEcritures"],
  pseudo_reserve: ["pseudo", "account.err.pseudoReserve"],
  pseudo_pris: ["pseudo", "account.pseudo.taken"],
  totp_faux: ["totp", "account.err.totpFaux"],
  totp_rejoue: ["totp", "account.err.totpRejoue"],
  photo_illisible: ["photo", "account.photo.err"],
};

const ILLISIBLE = new Set(["coffre_illisible", "coffre_recule", "coffre_version", "enveloppe_invalide"]);

/** Code d'une erreur (serveur ou appareil), ou "" si ce n'en est pas une connue. */
export function codeDe(e: unknown): string {
  if (e instanceof Error && typeof (e as { code?: unknown }).code === "string") return (e as unknown as { code: string }).code;
  if (e instanceof Error && e.name === "LimitError") return "limit";
  return e instanceof Error ? e.message : "";
}

export function erreur(e: unknown, moment: Moment): Erreur {
  const code = codeDe(e);
  const x = e as { attemptsLeft?: number; retryAfterS?: number };
  const mapped = CHAMP_CODE[code];
  if (mapped) return { champ: mapped[0], texte: t(mapped[1]) };
  switch (code) {
    case "code_faux":
      return { champ: "code", texte: t("account.err.code", { n: x.attemptsLeft ?? 0 }) };
    case "not_found":
      if (moment === "code" || moment === "oubli") return { champ: "code", texte: t("account.err.codeExpire") };
      return { texte: t("account.err.etape") };
    case "limit":
    case "limite":
      return { texte: t("account.err.limit", { duree: formatDuration(x.retryAfterS ?? 60, getLang()) }) };
    case "busy":
      return { texte: t(moment === "inscription" || moment === "code" ? "account.err.busy" : "account.err.busyAutre") };
    case "reseau":
      return { texte: t("account.err.reseau") };
    case "identifiants":
      return { texte: t("account.err.identifiants") };
  }
  if (ILLISIBLE.has(code)) return { texte: t("account.err.coffre") };
  return { texte: t("account.err.autre") };
}

/** « 2026-11-21 » → « 21 novembre » (année ajoutée si ce n'est pas l'année en cours). */
export function jourLong(iso: string, now = new Date()): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const year = d.getUTCFullYear() !== now.getUTCFullYear();
  return new Intl.DateTimeFormat(getLang(), { day: "numeric", month: "long", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" }).format(d);
}
