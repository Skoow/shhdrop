import { mount } from "svelte";
import App from "./App.svelte";
import { moveLegacyLink } from "./app/router.svelte";
import { pageReturns } from "./history/returns";
import { langReady } from "./i18n/i18n.svelte";
import { blockZoom } from "./app/no-zoom";

blockZoom(); // zoom bloqué (propriétaire, 18 novembre)

// Ancien lien à la racine (« /#<clé> », avant le 16 novembre) : la page « /s » l'ouvre, avant
// tout le reste ; rien n'est monté ici (aucun écran affiché un instant).
const moved = moveLegacyLink(location);

// Démo GitHub Pages (UI §14.3) : en production, la condition vaut false à la compilation et le
// module disparaît du build (garde demoGuard de vite.config.ts, scripts/check-dist.mjs).
if (!moved && import.meta.env.MODE === "demo") await (await import("./demo/install")).installDemo(window);

// Retours gardés (D42-22) : entrées échues retirées au démarrage, sans rien créer.
if (!moved) void pageReturns().sweep();

// Langue du navigateur : le dictionnaire anglais est lu avant l'affichage (production).
await langReady;

const target = document.getElementById("app");
if (!target) throw new Error("#app introuvable");

export default moved ? undefined : mount(App, { target });
