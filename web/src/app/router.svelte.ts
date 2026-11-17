// Routeur interne (UI §9). Il lit le chemin et, à la racine seulement, la FORME du « # »
// (spec §32 : « #<43> » partage, « #m<43> » gestion) sans jamais en garder le contenu : la
// clé est lue une fois par readLink (app/link.ts), puis retirée de l'adresse.
import { flushSync } from "svelte";
import { MANAGE_FRAGMENT, SHARE_FRAGMENT } from "../engine/pure";

// Lien du QR code (D41-29) : « #<K_lien>. » suivi du mot de passe, même mal formé (écran de saisie).
const SHARE_PW_PREFIX = /^#[A-Za-z0-9_-]{43}\./;
import { runTransition } from "../ui/viewTransition";
import { createLeaveGuard } from "./leave-guard";

/**
 * Marque de l'entrée d'historique d'une ouverture déverrouillée (aucun secret) : un
 * rechargement de cette entrée, sans « # », revient à l'écran d'ouverture : état « reopen »
 * si l'onglet garde l'octroi (spec §41.4), sinon « Lien incomplet » (Terminer, destruction,
 * 30 min d'inactivité…). Une autre entrée (accueil) reste l'accueil.
 */
export const REOPEN_MARK = "shhOg";
export function markReopen(h: History): void {
  h.replaceState({ [REOPEN_MARK]: true }, "", shownPath(location.pathname));
}

/**
 * Adresse affichée une fois le lien lu (décision du propriétaire du 17 novembre : « /s » n'est
 * montré que quand il sert) : la page « /s » remplace son adresse par l'accueil (« / ») après
 * avoir lu et retiré le « # ». Un rechargement de « / » marqué (markReopen) repart vers « /s »
 * (moveLegacyLink), où l'écran d'ouverture retrouve l'octroi de l'onglet (spec §41.4). Toute
 * autre adresse est rendue telle quelle.
 */
export function shownPath(pathname: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return pathname === base + "/s" || pathname === base + "/s.html" ? base + "/" : pathname;
}
const reopenHere = () =>
  typeof history !== "undefined" && (history.state as Record<string, unknown> | null)?.[REOPEN_MARK] === true;

/** Pages d'information (pied de page, retours UI5) : chemin → route. */
export type InfoRoute = "securite" | "confidentialite" | "conditions" | "mentions" | "signaler";
export const INFO_PATHS: Readonly<Record<string, InfoRoute>> = {
  "/securite": "securite",
  "/confidentialite": "confidentialite",
  "/conditions": "conditions",
  "/mentions-legales": "mentions",
  "/signaler": "signaler",
};

/** Pages du compte (plan du compte, lot 10), seulement si __COMPTES__ : chemin → route. */
export type CompteRoute = "compte" | "inscription" | "connexion" | "oubli" | "profil";
// Relue par TestAppRoutesMatchClientRouter (server/cmd/shhdrop) et comparée à compteRoutes du
// serveur, qui ne les sert en 200 qu'avec SHH_COMPTES=1 (sinon 404, comme toute page inconnue).
const COMPTE_PATHS: Readonly<Record<string, CompteRoute>> = {
  "/compte": "compte",
  "/compte/inscription": "inscription",
  "/compte/connexion": "connexion",
  "/compte/oubli": "oubli",
  "/compte/profil": "profil",
};

export type Route = {
  /** envoyer : page d'envoi (composeur, même vide), où mène « Commencer » (retours DROP). */
  name: "home" | "envoyer" | "envois" | "telechargements" | "open" | "manage" | InfoRoute | "offres" | CompteRoute | "notfound";
};

/**
 * Seul paramètre d'adresse du site (conception compte §10.4) : « ?suite=salon », exactement,
 * posé par « Créer un salon » sans session. Aucune donnée : il dit seulement où revenir après la
 * connexion. Toute autre requête est ignorée (jamais lue, jamais recopiée).
 */
export function suite(search: string): "salon" | null {
  return search === "?suite=salon" ? "salon" : null;
}

/**
 * Fragment de 20 à 44 caractères de l'alphabet des clés qui n'est pas une clé valide : un lien
 * coupé (copier-coller, message tronqué). L'écran d'ouverture dit « Lien incomplet » au lieu de
 * l'accueil, qui laisserait croire que le lien n'était qu'une adresse du site (ruling 2).
 */
const TRUNCATED_FRAGMENT = /^#[A-Za-z0-9_-]{20,44}$/;

export function match(pathname: string, hash = "", base: string = import.meta.env.BASE_URL, reopen = false, comptes: boolean = __COMPTES__): Route {
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base; // "" ou "/shhdrop"
  let p = pathname;
  if (prefix !== "") {
    if (p === prefix) p = "/";
    else if (p.startsWith(prefix + "/")) p = p.slice(prefix.length);
    else return { name: "notfound" };
  }
  if (p === "/") {
    if (SHARE_FRAGMENT.test(hash) || SHARE_PW_PREFIX.test(hash)) return { name: "open" };
    if (MANAGE_FRAGMENT.test(hash)) return { name: "manage" };
    if (TRUNCATED_FRAGMENT.test(hash)) return { name: "open" };
    if (hash === "" && reopen) return { name: "open" };
    return { name: "home" };
  }
  // Liens sous « /s » (décision du propriétaire du 16 novembre) : ouverture et gestion, dans leur
  // propre page (s.html). Sans fragment de la bonne forme : l'écran d'ouverture dit « Lien
  // incomplet » (ou rouvre, après un rechargement de l'ouverture déverrouillée).
  if (p === "/s" || p === "/s.html") {
    if (MANAGE_FRAGMENT.test(hash)) return { name: "manage" };
    return { name: "open" };
  }
  // Pages d'information : aussi sous le nom de leur fichier (« /securite.html », pages séparées).
  const page = p.endsWith(".html") ? p.slice(0, -5) : p;
  const info = Object.hasOwn(INFO_PATHS, page) ? INFO_PATHS[page] : undefined;
  if (info !== undefined) return { name: info };
  if (p === "/offres") return { name: "offres" };
  if (p === "/offres.html") return { name: "offres" };
  if (p === "/envoyer") return { name: "envoyer" };
  // Tableau de bord « Vos envois » (spec §33, §33.1) : historique local, aucun secret dans l'adresse.
  if (p === "/envois") return { name: "envois" };
  // Historique des téléchargements (conception compte §21.15.5) : sur l'appareil, aucun secret dans l'adresse.
  if (p === "/telechargements") return { name: "telechargements" };
  // Pages du compte : sans __COMPTES__ (défaut, démo), la même 404 qu'une adresse inconnue.
  const compte = comptes && Object.hasOwn(COMPTE_PATHS, p) ? COMPTE_PATHS[p] : undefined;
  if (compte !== undefined) return { name: compte };
  // « /s/ » reste réservé aux futurs liens universels (spec §16) : aucune route aujourd'hui.
  return { name: "notfound" };
}

export const router = $state<{ current: Route }>({
  current: typeof location === "undefined" ? { name: "home" } : match(location.pathname, location.hash, undefined, reopenHere()),
});

// Ne réaffecte que si la route change : un popstate sans effet (lien vers la page courante,
// « # » retiré) ne relance ni les effets ni le focus.
function sync(): void {
  const next = match(location.pathname, location.hash, undefined, reopenHere());
  if (next.name !== router.current.name) router.current = next;
}

/** Garde du bouton Retour pendant un envoi et sur « Lien prêt » (app/leave-guard.ts, audit I2). */
export const leaveGuard = typeof window === "undefined" ? null : createLeaveGuard(window);

// Retour du système (geste, bouton) : même glissement, vers la droite, sur téléphone.
if (typeof window !== "undefined")
  window.addEventListener("popstate", () => {
    if (leaveGuard?.onPop()) return; // envoi en cours ou lien affiché : confirmé ou absorbé
    // Un « # » (lien collé, clé) se lit tout de suite, sans transition : l'écran qui le lit et
    // le gestionnaire hashchange d'App doivent voir la route à jour dans le même tour.
    const moves = match(location.pathname, location.hash, undefined, reopenHere()).name !== router.current.name;
    if (moves && phone() && location.hash === "") void runTransition(() => flushSync(sync), { back: true });
    else sync();
  });

const base = () => import.meta.env.BASE_URL;

/** Adresse complète d'un chemin de l'application (préfixe de dépôt en démo). */
/**
 * Pages servies par leur propre fichier HTML (pages séparées, conception du 16 novembre) : le
 * serveur répond « securite.html » à « /securite ». Entre l'application (index.html) et ces
 * pages, un lien charge l'autre page (navigation complète) ; à l'intérieur de l'une ou de
 * l'autre, rien ne change.
 */
export const PAGE_ROUTES: ReadonlySet<Route["name"]> = new Set<Route["name"]>(["securite", "confidentialite", "conditions", "mentions", "signaler", "offres"]);
/** Écrans de la page « /s » (s.html, 16 novembre) : ouverture et gestion d'un partage. */
export const LINK_ROUTES: ReadonlySet<Route["name"]> = new Set<Route["name"]>(["open", "manage"]);
type Entry = "app" | "pages" | "s";
let entry: Entry = "app";
/** Appelé une fois par le point d'entrée des pages d'information (src/pages/main.ts) et de /s (src/open/main.ts). */
export function setEntry(e: Entry): void {
  entry = e;
}
const entryOf = (name: Route["name"]): Entry => (PAGE_ROUTES.has(name) ? "pages" : LINK_ROUTES.has(name) ? "s" : "app");
/** Vrai si `path` est servi par un autre fichier HTML que la page courante. */
export function otherEntry(path: string): boolean {
  return entryOf(match(href(path), "").name) !== entry;
}

/**
 * Ancien lien à la racine (« /#<clé> », avant le 16 novembre), ou entrée « / » d'une ouverture
 * déverrouillée (markReopen, 17 novembre) : remplacé, sans nouvelle entrée
 * d'historique, par « /s » et le même fragment (même origine : le fragment ne part jamais au
 * serveur). La requête (« ?fbclid=… » des messageries) n'est pas recopiée. Rend vrai si la page
 * part ; l'appelant n'affiche alors rien.
 */
export function moveLegacyLink(loc: Pick<Location, "pathname" | "hash" | "replace">, reopen: boolean = reopenHere()): boolean {
  // Ouverture déverrouillée rechargée sous « / » (adresse montrée, shownPath) : vers « /s » aussi.
  const name = match(loc.pathname, loc.hash, undefined, reopen).name;
  // Déjà sur « /s » (serveur sans s.html, qui rendrait index.html) : jamais de boucle.
  const onS = loc.pathname === href("/s") || loc.pathname === href("/s.html");
  if (!LINK_ROUTES.has(name) || entry !== "app" || onS) return false;
  loc.replace(href("/s") + loc.hash);
  return true;
}

/**
 * Chemin de la page courante, pour « aria-current » : sans « .html » (une page d'information
 * peut être ouverte sous le nom de son fichier) ; au rendu du build (pas de location), celui de
 * la route courante.
 */
export function currentPath(): string {
  if (typeof location !== "undefined") return location.pathname.replace(/\.html$/, "");
  const n = router.current.name;
  const info = Object.keys(INFO_PATHS).find((k) => INFO_PATHS[k] === n);
  return href(info ?? (n === "offres" ? "/offres" : "/"));
}

export function href(path: string): string {
  return base().replace(/\/$/, "") + path;
}

/**
 * Chemin interne seulement : « /… », sans « // », « \ », « # » ni « ? » (aucun secret ne transite
 * ici) ; seule exception, « ?suite=salon » sur la connexion et l'inscription (suite()).
 */
export function navigate(path: string, opts: { back?: boolean } = {}): void {
  const nu = path.replace(/^(\/compte\/(?:connexion|inscription))\?suite=salon$/, "$1");
  if (!/^\/(?!\/)[^\\#?]*$/.test(nu)) throw new Error("chemin interne attendu");
  // L'autre fichier HTML (application ↔ page d'information) : chargement complet.
  if (otherEntry(nu)) {
    location.assign(href(path));
    return;
  }
  const go = () => {
    history.pushState(null, "", href(path));
    sync();
    if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
  };
  // Téléphone : l'écran glisse (en arrière : vers la droite ; fondu en mouvement réduit).
  if (phone()) void runTransition(() => flushSync(go), { back: opts.back });
  else go();
}
const phone = () => typeof matchMedia === "function" && matchMedia("(max-width: 899px)").matches;

/** Gestionnaire de clic pour un <a href> interne : navigation sans rechargement, sauf clic modifié. */
export function followLink(e: MouseEvent, path: string): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(path);
}
