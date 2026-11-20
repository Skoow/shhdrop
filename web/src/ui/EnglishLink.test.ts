// @vitest-environment happy-dom
// Lien « English version » (20 novembre) : seulement sur la version française d'une page
// bilingue, pour un navigateur anglophone, et jamais dans la démo.
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n/i18n.svelte";
import EnglishLink from "./EnglishLink.svelte";

let c: Record<string, unknown> | null = null;
function lien(props: Record<string, unknown>): string | null {
  c = mount(EnglishLink as never, { target: document.body, props: { bilingue: true, base: "/", ...props } }) as Record<string, unknown>;
  flushSync();
  return document.querySelector("[data-english-link]")?.getAttribute("href") ?? null;
}
afterEach(() => {
  if (c) unmount(c);
  c = null;
  document.body.innerHTML = "";
});

describe("EnglishLink", () => {
  it("navigateur anglophone sur une page française bilingue : lien vers /en…", () => {
    setLang("fr");
    expect(lien({ chemin: "/", navigateur: ["en-US"] })).toBe("/en");
    unmount(c!);
    expect(lien({ chemin: "/securite", navigateur: ["de", "en-GB", "fr"] })).toBe("/en/securite");
    expect(document.querySelector("[data-english-link]")?.getAttribute("lang")).toBe("en");
  });
  it("aucun lien : navigateur français, autre page, page anglaise, démo", () => {
    setLang("fr");
    expect(lien({ chemin: "/", navigateur: ["fr-FR", "en"] })).toBeNull();
    unmount(c!);
    expect(lien({ chemin: "/envoyer", navigateur: ["en-US"] })).toBeNull();
    unmount(c!);
    expect(lien({ chemin: "/securite", navigateur: ["en-US"], bilingue: false })).toBeNull();
    unmount(c!);
    setLang("en");
    expect(lien({ chemin: "/en/securite", navigateur: ["en-US"] })).toBeNull();
    setLang("fr");
  });
});
