// @vitest-environment happy-dom
// Infographie de l'accueil (refonte du 12 novembre) : boucle d'étapes, pause (bouton, survol,
// focus : WCAG 2.2.2), storyboard statique en mouvement réduit, étapes lisibles au lecteur
// d'écran, textes vrais (jamais « 100 % sécurisé », ni « inviolable », « aucune donnée »…).
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setLang } from "../i18n/i18n.svelte";
import { STEP_MIN_MS, STEP_MS, STEPS, dureeEtape } from "./demo-steps";
import SecureDemo from "./SecureDemo.svelte";

let c: Record<string, unknown> | null = null;
function show() {
  c = mount(SecureDemo as never, { target: document.body, props: {} }) as Record<string, unknown>;
  flushSync();
}
const root = () => document.querySelector<HTMLElement>("[data-demo]")!;
const toggle = () => document.querySelector<HTMLButtonElement>("[data-demo-toggle]")!;
const step = () => Number(root().dataset.step);
function tickSteps(n: number) {
  for (let i = 0; i < n; i++) {
    vi.advanceTimersByTime(STEP_MS);
    flushSync();
  }
}

function reduce(on: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("reduced-motion"), media: q, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  setLang("fr");
  vi.useFakeTimers();
  reduce(false);
});
afterEach(() => {
  if (c) void unmount(c);
  c = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SecureDemo", () => {
  it("sept étapes, dans l'ordre, lisibles au lecteur d'écran ; dessin caché", () => {
    show();
    expect(STEPS).toHaveLength(7);
    const items = [...document.querySelectorAll("[data-demo-steps] li")].map((l) => l.textContent!.replace(/\s+/g, " ").trim());
    expect(items).toHaveLength(7);
    expect(items[0]).toContain("photo.jpg");
    expect(items[1]).toContain("Chiffré dans votre appareil");
    expect(items[3]).toContain("ni nom de fichier, ni mot de passe, ni adresse IP");
    expect(items[4]).toContain("Le mot de passe ne part jamais");
    expect(items[6]).toContain("Tout s'efface");
    const svg = root().querySelector("svg")!;
    expect(svg.closest('[aria-hidden="true"]')).not.toBeNull();
    // Nom du groupe : le titre de l'infographie.
    const g = root().closest("[role=group]") ?? root();
    expect(g.getAttribute("aria-labelledby")).toBeTruthy();
  });

  it("boucle : une étape toutes les STEP_MS, puis retour au début", () => {
    show();
    expect(step()).toBe(1);
    tickSteps(1);
    expect(step()).toBe(2);
    tickSteps(5);
    expect(step()).toBe(7);
    tickSteps(1);
    expect(step()).toBe(1);
  });

  it("durée d'une étape selon son texte (20 novembre) : plus longue pour plus de texte, bornée", () => {
    const d = (n: number) => dureeEtape(fr[`demo.s${n}.t` as keyof typeof fr] + fr[`demo.s${n}.d` as keyof typeof fr]);
    expect(d(4)).toBeGreaterThan(d(3)); // « Rien de lisible sur le serveur » : la plus longue description
    for (const n of STEPS) {
      expect(d(n)).toBeGreaterThanOrEqual(STEP_MIN_MS);
      expect(d(n)).toBeLessThanOrEqual(STEP_MS);
    }
    expect(dureeEtape("")).toBe(STEP_MIN_MS);
    expect(dureeEtape("x".repeat(1000))).toBe(STEP_MS);
  });

  it("bouton pause/lecture visible : arrête puis reprend la boucle", () => {
    show();
    expect(toggle().getAttribute("aria-label")).toBe("Mettre l'animation en pause");
    toggle().click();
    flushSync();
    expect(toggle().getAttribute("aria-label")).toBe("Lire l'animation");
    expect(root().classList.contains("paused")).toBe(true);
    tickSteps(3);
    expect(step()).toBe(1);
    toggle().click();
    flushSync();
    tickSteps(1);
    expect(step()).toBe(2);
  });

  it("pause sous la souris et au focus, reprise ensuite ; un toucher n'arrête rien (iPhone)", () => {
    show();
    const view = document.querySelector("[data-demo-view]")!;
    const touch = new Event("pointerenter");
    Object.defineProperty(touch, "pointerType", { value: "touch" });
    view.dispatchEvent(touch);
    flushSync();
    tickSteps(1);
    expect(step()).toBe(2);
    view.dispatchEvent(new Event("pointerleave"));
    flushSync();
    tickSteps(6);
    expect(step()).toBe(1);
    const mouse = new Event("pointerenter");
    Object.defineProperty(mouse, "pointerType", { value: "mouse" });
    view.dispatchEvent(mouse);
    flushSync();
    tickSteps(2);
    expect(step()).toBe(1);
    view.dispatchEvent(new Event("pointerleave"));
    flushSync();
    tickSteps(1);
    expect(step()).toBe(2);
    toggle().dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    flushSync();
    tickSteps(2);
    expect(step()).toBe(2);
    toggle().dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }));
    flushSync();
    tickSteps(1);
    expect(step()).toBe(3);
  });

  it("mouvement réduit : storyboard statique, toutes les étapes visibles, aucun minuteur", () => {
    reduce(true);
    show();
    expect(root().classList.contains("board")).toBe(true);
    const list = document.querySelector("[data-demo-steps]")!;
    expect(list.classList.contains("sr-only")).toBe(false);
    expect(list.querySelectorAll("li")).toHaveLength(7);
    expect(vi.getTimerCount()).toBe(0);
    expect(document.querySelector("[data-demo-toggle]")).toBeNull();
  });

  it("anglais", () => {
    setLang("en");
    show();
    expect(toggle().getAttribute("aria-label")).toBe("Pause the animation");
    expect(document.querySelector("[data-demo-steps]")!.textContent).toContain("Encrypted on your device");
  });

  it("textes vrais : aucune promesse absolue, en français comme en anglais", () => {
    const all: [string, string][] = [...Object.entries(fr), ...Object.entries(en)];
    const mine = all.filter(([k]) => k.startsWith("demo.") || k.startsWith("hero.") || k.startsWith("nav.") || k.startsWith("home."));
    expect(mine.length).toBeGreaterThan(40);
    for (const [k, v] of mine) {
      expect(v, k).not.toMatch(/100\s*%|inviolable|aucune donnée|intraçable|unbreakable|no data|untraceable|100% secure/i);
    }
  });
});

describe("journal tapé (18 novembre) : un seul curseur, mots entiers", () => {
  it("à chaque étape : jamais plus d'un curseur ; tout est tapé en entier avant l'étape suivante", () => {
    show();
    for (let n = 1; n <= STEPS.length; n++) {
      // Pendant la frappe : un curseur au plus.
      // Pas de 35 ms (TYPE_MS) : chaque lettre relance son minuteur au passage des effets.
      const dur = dureeEtape(fr[`demo.s${n}.t` as keyof typeof fr] + fr[`demo.s${n}.d` as keyof typeof fr]);
      const ticks = Math.floor((dur - 100) / 35);
      for (let k = 0; k < ticks; k++) {
        vi.advanceTimersByTime(35);
        flushSync();
        expect(document.querySelectorAll(".log .cur").length).toBeLessThanOrEqual(1);
      }
      // Juste avant l'étape suivante : chaque ligne visible est tapée en entier, état compris,
      // et le curseur clignote au bout de la dernière.
      const rows = [...document.querySelectorAll(".log .ln")];
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.querySelector(".li-t")!.textContent!.length, r.textContent!).toBeGreaterThan(3);
        expect(r.querySelector(".li-s")!.textContent).toMatch(/^[✓✕] \S/);
      }
      const last = rows.at(-1)!;
      expect(last.querySelector(".cur.idle")).not.toBeNull();
      expect(document.querySelectorAll(".log .cur")).toHaveLength(1);
      vi.advanceTimersByTime(dur - ticks * 35);
      flushSync();
    }
  });
});
