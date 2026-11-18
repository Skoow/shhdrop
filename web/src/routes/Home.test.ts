// @vitest-environment happy-dom
import { PAID } from "../limits";
import { createRawSnippet, flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../i18n/i18n.svelte";
import Home from "./Home.svelte";

let c: Record<string, unknown> | null = null;
function show(props: Record<string, unknown> = {}) {
  c = mount(Home as never, { target: document.body, props }) as Record<string, unknown>;
  flushSync();
}

beforeEach(() => setLang("fr"));
/** Nom lu par les lecteurs d'écran : le texte hors des parties aria-hidden (K8). */
function title(h1: Element): string {
  const c = h1.cloneNode(true) as Element;
  c.querySelectorAll('[aria-hidden="true"]').forEach((e) => e.remove());
  return c.textContent!.trim();
}
afterEach(() => {
  if (c) void unmount(c);
  c = null;
  document.body.innerHTML = "";
});

describe("Home (UI §9.1)", () => {
  it("accueil (refonte du 12 novembre) : sur-titre, titre, phrase, deux boutons, méta, infographie, composeur, sections", () => {
    show();
    const h1 = document.querySelector("h1")!;
    expect(title(h1)).toBe("Un lien, un mot de passe, puis plus rien.");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(h1.getAttribute("tabindex")).toBe("-1");
    expect(h1.classList.contains("compact")).toBe(false);
    // Plus de sur-titre (retours du 15 novembre). Deux boutons (17 novembre) : « Choisir des
    // fichiers » et « Créer sur place » (note, vocal, photo, salon) ; plus de bouton Salon à part.
    expect(document.querySelector("[data-eyebrow]")).toBeNull();
    expect(document.querySelector("[data-ctas] [data-pick]")).not.toBeNull();
    expect(document.querySelector("[data-ctas] [data-create]")).not.toBeNull();
    expect(document.querySelectorAll("[data-ctas] button")).toHaveLength(2);
    expect(document.querySelector("[data-room]")).toBeNull();
    expect(document.querySelector("[data-more]")).toBeNull();
    // Phrase : les fonctions moins visibles mises en avant.
    const lede = document.querySelector("[data-lede]")!;
    expect(lede.textContent).toMatch(/^Vos fichiers, mais aussi des messages vocaux, des notes et bientôt un salon de discussion\u202f: /);
    expect([...lede.querySelectorAll("b.hl")].map((b) => b.textContent)).toEqual(["messages vocaux", "notes", "salon de discussion"]);
    const pick = document.querySelector<HTMLButtonElement>("[data-pick]")!;
    expect(pick.querySelector(".pk-t")!.textContent).toBe("Choisir des fichiers");
    expect(pick.querySelector(".pk-s")!.textContent).toBe("ou glissez-les ici"); // tuile : aussi une zone de dépôt (16 novembre)
    expect(pick.querySelector(".pk-s")!.getAttribute("aria-hidden")).toBe("true");
    expect(pick.querySelector("svg")).not.toBeNull();
    const make = document.querySelector<HTMLButtonElement>("[data-create]")!;
    expect(make.textContent).toContain("Créer sur place");
    expect(make.textContent).toContain("salon bientôt");
    const meta = [...document.querySelectorAll("[data-meta] li")].map((l) => l.textContent!.trim());
    expect(meta).toEqual(["Gratuit jusqu'à 2\u202fGo", "Partage sans compte", "Durée et ouvertures au choix"]);
    expect(document.querySelector("[data-demo]")).not.toBeNull();
    const a = [...document.querySelectorAll("a")].find((x) => x.textContent?.trim() === "Tous les détails de sécurité")!;
    expect(a.getAttribute("href")).toBe("/securite");
    expect([...document.querySelectorAll("a")].some((x) => x.getAttribute("href")?.includes("#"))).toBe(false);
    // Sections sous le pli, chacune titrée.
    const h2 = [...document.querySelectorAll("h2")].map((h) => h.textContent!.trim());
    expect(h2).toEqual([
      "Ce qui se passe quand vous partagez", // titre de l'infographie, pour les lecteurs d'écran
      "Comment ça marche",
      "Pensé pour la confidentialité",
      "Offres",
      "Vos questions",
    ]);
    expect(document.querySelectorAll("[data-how-card]")).toHaveLength(3);
    // « Comment ça marche » : une frise numérotée, distincte des cartes de la confidentialité.
    expect(document.querySelectorAll("ol.flow > li[data-how-card] .nb")).toHaveLength(3);
    const priv = [...document.querySelectorAll("[data-priv-card]")];
    expect(priv).toHaveLength(4);
    expect(priv.map((c) => c.querySelector("h3")!.textContent!.trim())).toEqual(["Partage sans compte", "Rien de lisible sur le serveur", "Photos et vidéos nettoyées", "Salon éphémère bientôt"]);
    for (const c of [...document.querySelectorAll("[data-priv-card]")]) expect(c.querySelector(".tile-ic svg")).not.toBeNull();
    for (const c of [...document.querySelectorAll("[data-how-card]")]) expect(c.querySelector(".node svg")).not.toBeNull();
    // Plus de ligne sur la clé après le « # » sur l'accueil (décision du 16 novembre).
    expect(document.querySelector("[data-key-note]")).toBeNull();
    expect([...document.querySelectorAll("[data-offer]")].map((o) => o.getAttribute("data-offer"))).toEqual(["free", "plus", "pro"]);
    // Retours du 15 novembre : prix prévu et sens de chaque chiffre dans les cartes (lus dans PAID).
    const card = (x: string) => document.querySelector(`[data-offer="${x}"]`)!;
    const norm = (s: string | null | undefined) => (s ?? "").replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ").trim();
    expect(norm(card("free").querySelector("[data-price]")!.textContent)).toBe("0 € pour toujours");
    expect(norm(card("plus").querySelector("[data-price]")!.textContent)).toBe(`${PAID.plus.month} € / mois ou ${PAID.plus.year} € / an`);
    expect([...card("pro").querySelectorAll(".dk")].map((d) => d.textContent)).toEqual(["Taille par partage", "Durée au plus", "Ouvertures au plus"]);
    expect(norm(card("pro").querySelectorAll(".dv")[2]!.textContent)).toBe(String(PAID.pro.opens));
    expect(document.querySelectorAll("details[name=faq]")).toHaveLength(5);
    expect(document.querySelector('[data-slot="compose"]')).toBeNull(); // composeur : page d'envoi seulement
  });

  it("compact (page d'envoi) : plus le slogan de l'accueil, un h1 « Nouveau partage » pour les lecteurs d'écran (« Votre envoi » est le titre visible) ; phrase et schéma retirés", () => {
    show({ compact: true });
    const h1 = document.querySelector("h1")!;
    expect(h1.textContent).toBe("Nouveau partage");
    expect(h1.classList.contains("sr-only")).toBe(true);
    expect(h1.id).toBe("hero-title");
    // Les trois assurances sont dans le cadre de dépôt du composeur (ui/Assurances.svelte).
    expect(document.querySelector("[data-assure]")).toBeNull();
    expect(document.querySelector("[data-demo]")).toBeNull();
    expect(document.querySelector("[data-pick]")).toBeNull();
    expect(document.querySelector("[data-eyebrow]")).toBeNull();
    expect(document.querySelector("a")).toBeNull();
  });

  it("le composeur fourni remplace l'emplacement réservé", () => {
    const children = createRawSnippet(() => ({ render: () => `<div id="composeur">c</div>` }));
    show({ children });
    expect(document.getElementById("composeur")).not.toBeNull();
    expect(document.querySelector('[data-slot="compose"] #composeur')).not.toBeNull();
  });

  it("titre (K1, K8) : phrase entière lisible, copie mot par mot cachée, respiration avant « puis »", () => {
    show();
    const h1 = document.querySelector("h1")!;
    expect(h1.querySelector(".sr-only")!.textContent).toBe("Un lien, un mot de passe, puis plus rien.");
    const copy = h1.querySelector('[aria-hidden="true"]')!;
    const words = [...copy.querySelectorAll<HTMLElement>(".w")];
    expect(words.map((w) => w.textContent)).toEqual(["Un", "lien,", "un", "mot", "de", "passe,", "puis", "plus", "rien."]);
    // Titre affiché d'emblée dans son état final (17 novembre) : aucun délai d'entrée par mot.
    expect(words.map((w) => w.style.getPropertyValue("--d"))).toEqual(words.map(() => ""));
    // « puis plus rien. » effacé lettre à lettre, d'emblée : chaque lettre plus pâle que la
    // précédente, le point final invisible.
    const letters = [...copy.querySelectorAll<HTMLElement>(".l")];
    expect(letters.map((l) => l.textContent).join("")).toBe("puisplusrien.");
    const o = letters.map((l) => Number(l.style.getPropertyValue("--o")));
    expect(o[0]).toBe(0.55);
    expect(o[12]).toBe(0);
    for (let i = 1; i < o.length; i++) expect(o[i]).toBeLessThan(o[i - 1]!);
  });

  it("plus d'entrée animée (18 novembre : accueil écrit au build, affiché avant le script)", () => {
    show();
    expect(document.querySelector(".home")!.classList.contains("reveal")).toBe(false);
  });


  it("« Choisir des fichiers » ouvre le sélecteur du composeur (onpick) ; « Créer sur place » appelle oncreate ; plus de carte de dépôt sur l'accueil (18 novembre)", () => {
    const onfiles = vi.fn();
    const oncreate = vi.fn();
    const onpick = vi.fn();
    show({ onfiles, oncreate, onpick });
    // Plus de sélecteur propre à l'accueil : le composeur tient le seul champ fichier.
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(0);
    (document.querySelector("[data-pick]") as HTMLButtonElement).click();
    expect(onpick).toHaveBeenCalledTimes(1);
    (document.querySelector("[data-create]") as HTMLButtonElement).click();
    expect(oncreate).toHaveBeenCalledTimes(1);
    // Ni « Commencer », ni carte « Glissez vos fichiers ici » : doublons des deux boutons du héros.
    expect([...document.querySelectorAll("button")].some((b) => b.textContent!.trim().startsWith("Commencer"))).toBe(false);
    expect(document.querySelector('[data-slot="compose"]')).toBeNull();
    expect(onfiles).not.toHaveBeenCalled();
  });

  it("dépôt : les fichiers vont à onfiles, les dossiers sont remis à part (refusés, pas aplatis)", async () => {
    const onfiles = vi.fn();
    show({ onfiles });
    const a = new File(["a"], "a.txt");
    const dir = new File([], "Vacances");
    const items = [
      { kind: "file", getAsFile: () => a, webkitGetAsEntry: () => ({ isDirectory: false, name: "a.txt" }) },
      { kind: "file", getAsFile: () => null, webkitGetAsEntry: () => ({ isDirectory: true, name: dir.name }) },
    ];
    const e = new Event("drop", { bubbles: true, cancelable: true }) as unknown as DragEvent;
    Object.defineProperty(e, "dataTransfer", { value: { types: ["Files"], items, files: [] } });
    window.dispatchEvent(e as unknown as Event);
    await Promise.resolve();
    expect(e.defaultPrevented).toBe(true);
    expect(onfiles).toHaveBeenCalledWith([a], "depot", ["Vacances"]);
  });

  it("démo (GitHub Pages, hors d'Europe) : jamais « Europe », en français comme en anglais", () => {
    vi.stubEnv("MODE", "demo");
    try {
      show();
      expect(document.body.textContent).not.toMatch(/Europe/);
      if (c) void unmount(c);
      document.body.innerHTML = "";
      setLang("en");
      show();
      expect(document.body.textContent).not.toMatch(/Europe/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("anglais", () => {
    setLang("en");
    show();
    expect(title(document.querySelector("h1")!)).toBe("One link, one password, then nothing.");
    expect(document.querySelector("[data-create]")!.textContent).toContain("Create here");
    expect([...document.querySelectorAll("[data-lede] b.hl")].map((b) => b.textContent)).toEqual(["voice messages", "notes", "chat room"]);
    expect(document.querySelector("[data-pick] .pk-t")!.textContent).toBe("Choose files");
    expect(document.querySelector("[data-pick] .pk-s")!.textContent).toBe("or drop them here");
    expect([...document.querySelectorAll("[data-meta] li")].map((l) => l.textContent!.trim())).toEqual(["Free up to 2\u00a0GB", "Share without an account", "Lifetime and opens of your choice"]);
  });
});
