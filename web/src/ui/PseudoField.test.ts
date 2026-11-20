// @vitest-environment happy-dom
// Pseudo du compte (conception compte §21.5, §21.15.2) : vérification après 400 ms sans frappe ;
// « Disponible » ou « Déjà pris » (erreur reliée au champ) ; règle non tenue : message de §39.4 ;
// une réponse en retard (frappe suivante) est ignorée.
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../i18n/i18n.svelte";
import PseudoField from "./PseudoField.svelte";

let c: Record<string, unknown> | undefined;
beforeEach(() => {
  setLang("fr");
  vi.useFakeTimers();
});
afterEach(() => {
  if (c) void unmount(c);
  c = undefined;
  document.body.innerHTML = "";
  vi.useRealTimers();
});
function show(verifier: (p: string) => Promise<string>) {
  const v = vi.fn(verifier);
  c = mount(PseudoField as never, { target: document.body, props: { verifier: v } }) as Record<string, unknown>;
  flushSync();
  return { input: document.querySelector("input")!, v };
}
const type = (i: HTMLInputElement, s: string) => {
  i.value = s;
  i.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
};
const settle = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
  flushSync();
};
const status = () => document.querySelector("[data-pseudo-status]")?.textContent?.trim() ?? "";

describe("PseudoField", () => {
  it("étiquette, indice ; vérification 400 ms après la dernière frappe, une seule fois", async () => {
    const { input, v } = show(async () => "libre");
    expect(document.querySelector("label")!.textContent).toBe("Pseudo");
    expect(document.body.textContent).toContain("Vu par les membres de vos salons, unique parmi les comptes Shhgone.");
    type(input, "Lé");
    await settle(200);
    type(input, "Lea");
    await settle(399);
    expect(v).not.toHaveBeenCalled();
    await settle(1);
    expect(v).toHaveBeenCalledTimes(1);
    expect(v).toHaveBeenCalledWith("Lea");
    expect(status()).toBe("Disponible");
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });
  it("« Déjà pris » : erreur reliée au champ", async () => {
    const { input } = show(async () => "pris");
    type(input, "Lea");
    await settle(400);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const ids = input.getAttribute("aria-describedby")!.split(" ");
    expect(ids.map((id) => document.getElementById(id)!.textContent).join(" ")).toContain("Déjà pris");
  });
  it("règle non tenue : messages exacts (§39.4)", async () => {
    for (const [code, msg] of [["pseudo_longueur", "2 à 24 caractères."], ["pseudo_ecritures", "Une seule écriture à la fois."], ["pseudo_reserve", "Ce pseudo est réservé."]]) {
      const { input } = show(async () => code!);
      type(input, "x");
      await settle(400);
      expect(input.getAttribute("aria-invalid"), code).toBe("true");
      expect(document.body.textContent, code).toContain(msg);
      void unmount(c!);
      c = undefined;
      document.body.innerHTML = "";
    }
  });
  it("« plus tard » (aucune étape encore) : rien n'est affirmé", async () => {
    const { input } = show(async () => "plus_tard");
    type(input, "Lea");
    await settle(400);
    expect(status()).toBe("La disponibilité sera vérifiée à l'étape suivante.");
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });
  it("réponse en retard d'une frappe précédente : ignorée", async () => {
    let first!: (v: string) => void;
    let n = 0;
    const { input } = show((p) => (n++ === 0 ? new Promise<string>((r) => (first = r)) : Promise.resolve(p === "Léo" ? "libre" : "pris")));
    type(input, "Lea");
    await settle(400);
    type(input, "Léo");
    await settle(400);
    expect(status()).toBe("Disponible");
    first("pris");
    await settle(0);
    expect(status()).toBe("Disponible");
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });
});
