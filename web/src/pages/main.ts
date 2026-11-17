// Point d'entrée des pages d'information (pages séparées, conception du 16 novembre). Le HTML
// arrive déjà rempli (rendu au build, en français) ; le script le remplace par la page vivante
// (même texte, ou la langue du navigateur). Les liens vers l'application (accueil, envoi, Mes
// partages) chargent sa page (router.svelte.ts, setEntry).
import { mount } from "svelte";
import { setEntry } from "../app/router.svelte";
import { probeHistory } from "../history/presence.svelte";
import { langReady } from "../i18n/i18n.svelte";
import PagesApp from "./PagesApp.svelte";

setEntry("pages");
// « Mes partages » dans l'en-tête seulement si l'historique existe sur cet appareil (17 novembre).
void probeHistory();
// Démo GitHub Pages (UI §14.3) : même installation que l'application (bandeau, titres « Démo · »).
if (import.meta.env.MODE === "demo") await (await import("../demo/install")).installDemo(window);
await langReady;

const target = document.getElementById("app");
if (!target) throw new Error("#app introuvable");
target.replaceChildren();

export default mount(PagesApp, { target });
