// @vitest-environment happy-dom
// Audit du 20 novembre (W4) : l'historique des téléchargements reste activé par défaut (R12),
// mais le premier fichier noté sur cet appareil le dit, une seule fois, près des téléchargements
// du contenu reçu : « Gardé dans Téléchargements sur cet appareil (30 jours). Ne pas garder ».
// « Ne pas garder » coupe l'historique (comme la page Téléchargements) et retire l'entrée.
// Stockage en mémoire (chemin de la démo).
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGone } from "../flows/gone.svelte";
import { setLang } from "../i18n/i18n.svelte";
import type { Opened } from "../index";

vi.mock("../app/demo-hooks", () => ({ getDemo: () => ({}) }));
const live = await import("./live.svelte");
const { default: Content } = await import("../routes/Content.svelte");

const NNBSP = " ";
const entry = (name: string) => ({ name, sizeBytes: 3, format: { family: "text" as const, label: "TXT" }, source: "partage" as const, savedAt: Date.now() });
const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
};

function opened(): Opened {
  return {
    manifest: { v: 2, rights: "enregistrer", items: [{ kind: "file", name: "a.txt", mime: "text/plain", size: 3, offset: 0 }] },
    safeName: () => "a.txt",
    previewKind: () => "text",
    isRiskyFile: () => false,
    item: async () => new Uint8Array(0),
    saveItem: async () => undefined,
    done: async () => undefined,
    wipe: () => undefined,
    destroy: async () => undefined,
    watch: () => new Promise(() => undefined),
    grant: "",
    opensLeft: 0,
    lastOpen: false,
  } as unknown as Opened;
}
let app: Record<string, unknown> | null = null;
const show = () => {
  app = mount(Content as never, { target: document.body, props: { opened: opened(), expired: false, onend: () => undefined, gone: createGone({ finish: () => undefined, revokeAll: () => undefined }) } }) as Record<string, unknown>;
  flushSync();
};
const line = () => document.querySelector("[data-downloads-notice]");

beforeEach(() => setLang("fr"));
afterEach(() => {
  if (app) void unmount(app);
  app = null;
  document.body.innerHTML = "";
});

describe("historique des téléchargements : ligne du premier fichier (W4)", () => {
  it("premier fichier noté : la ligne s'affiche (textes exacts, fr et en), une seule fois ; « Ne pas garder » coupe et efface", async () => {
    await live.loadDownloads();
    expect(live.downloads.enabled).toBe(true); // activé par défaut (R12)
    show();
    expect(line()).toBeNull();
    await live.recordDownload(entry("premier.txt"));
    await settle();
    expect(line()!.textContent!.replace(/[ \n\t]+/g, " ").trim()).toBe(`Gardé dans Téléchargements sur cet appareil (30${NNBSP}jours). Ne pas garder`);
    setLang("en");
    flushSync();
    expect(line()!.textContent!.replace(/[ \n\t]+/g, " ").trim()).toBe("Kept in Downloads on this device (30 days). Don't keep");
    setLang("fr");
    flushSync();
    // Deuxième fichier : rien de plus (la ligne reste, une seule).
    await live.recordDownload(entry("second.txt"));
    await settle();
    expect(document.querySelectorAll("[data-downloads-notice]")).toHaveLength(1);
    expect(live.downloads.entries.map((e) => e.name).sort()).toEqual(["premier.txt", "second.txt"]);
    [...document.querySelectorAll("button")].find((b) => b.textContent!.trim() === "Ne pas garder")!.click();
    await settle();
    expect(live.downloads.enabled).toBe(false);
    expect(live.downloads.entries).toEqual([]);
    expect(line()!.textContent!.trim()).toBe("Historique des téléchargements désactivé et effacé.");
    // Coupé : le fichier suivant n'est pas noté, et aucune ligne ne revient.
    await live.recordDownload(entry("troisieme.txt"));
    await live.loadDownloads();
    expect(live.downloads.entries).toEqual([]);
  });

  it("une seule fois sur cet appareil : réactivé, un nouveau fichier noté ne remontre pas la ligne ; quitter l'écran l'efface", async () => {
    await live.setDownloadsEnabled(true);
    show();
    await live.recordDownload(entry("autre.txt"));
    await settle();
    expect(live.downloads.notice).toBe(false);
    expect(line()).toBeNull();
    expect(live.downloads.entries.map((e) => e.name)).toEqual(["autre.txt"]);
    // L'état partagé posé ailleurs disparaît avec l'écran (il ne suit pas vers un autre partage).
    live.downloads.notice = true;
    void unmount(app!);
    app = null;
    flushSync();
    expect(live.downloads.notice).toBe(false);
  });
});
