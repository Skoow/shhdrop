// Rendu des pages d'information au build (pages séparées, conception du 16 novembre), côté
// serveur de build seulement (vite.config.ts, infoPages) : jamais dans le navigateur. Le contenu
// est rendu en français (langue par défaut) ; le script de la page le remplace au montage.
import { render } from "svelte/server";
import { router, type Route } from "../app/router.svelte";
import { INDEXED } from "../app/seo";
import { routeTitle } from "../app/title";
import { setLang, t } from "../i18n/i18n.svelte";
import PagesApp from "./PagesApp.svelte";

/** Page d'information → fichier HTML écrit au build (l'adresse publique est sans « .html »). */
export const PAGE_FILES: Readonly<Partial<Record<Route["name"], string>>> = {
  securite: "securite.html",
  confidentialite: "confidentialite.html",
  offres: "offres.html",
  conditions: "conditions.html",
  mentions: "mentions-legales.html",
  signaler: "signaler.html",
};

export type Rendered = { body: string; title: string; description: string; path: string | undefined };

export function renderPage(name: Route["name"]): Rendered {
  // Français, quelle que soit la langue de l'outil de build (Node se dit anglais).
  void setLang("fr");
  router.current = { name };
  const { body } = render(PagesApp);
  const path = INDEXED[name];
  return {
    body,
    title: routeTitle(name),
    description: t(path !== undefined ? (`seo.${name as keyof typeof INDEXED}` as "seo.home") : "seo.home"),
    path,
  };
}
