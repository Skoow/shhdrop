// @vitest-environment happy-dom
// Activation de la double authentification (conception compte §8.4, §21.15.4 point 4 ; plan, lot
// 13) : QR du lien d'ajout (dessiné sur l'appareil, aucune adresse ni pseudo dedans), clé groupée
// par 4 avec « Copier », premier code à 6 chiffres. Rien ne part avant « Activer ».
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../i18n/i18n.svelte";
import TotpSetup from "./TotpSetup.svelte";

const CB = vi.hoisted(() => ({ copyText: vi.fn(async () => "copied") }));
vi.mock("./clipboard", async (orig) => ({ ...(await orig<object>()), ...CB }));

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const LIEN = `otpauth://totp/Shhgone?secret=${SECRET}&issuer=Shhgone&algorithm=SHA1&digits=6&period=30`;
let app: Record<string, unknown> | null = null;
async function settle() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
  flushSync();
}
const texte = () => document.body.textContent!.replace(/\s+/g, " ");
const btn = (n: string) => [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent!.trim()) === n)!;

beforeEach(() => setLang("fr"));
afterEach(() => {
  if (app) void unmount(app);
  app = null;
  document.body.innerHTML = "";
});

describe("TotpSetup", () => {
  it("QR du lien exact, clé groupée par 4, « Copier » copie la clé sans espaces ; « Activer » exige 6 chiffres", async () => {
    const onvalider = vi.fn(async () => null);
    app = mount(TotpSetup as never, { target: document.body, props: { secret: SECRET, lien: LIEN, onvalider } }) as Record<string, unknown>;
    await settle();
    expect(document.querySelector("svg[role=img], [role=img]")).not.toBeNull();
    expect(texte()).toContain("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP");
    expect(texte()).not.toMatch(/@|Léa/);
    btn("Copier la clé").click();
    await settle();
    expect(CB.copyText).toHaveBeenCalledWith(SECRET);
    btn("Activer").click();
    await settle();
    expect(onvalider).not.toHaveBeenCalled();
    expect(texte()).toContain("Entrez les 6 chiffres du code.");
    const code = document.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')!;
    code.value = "654 321";
    code.dispatchEvent(new Event("input", { bubbles: true }));
    btn("Activer").click();
    await settle();
    expect(onvalider).toHaveBeenCalledExactlyOnceWith("654321");
  });

  it("code refusé : message relié au champ", async () => {
    const onvalider = vi.fn(async () => "Code incorrect.");
    app = mount(TotpSetup as never, { target: document.body, props: { secret: SECRET, lien: LIEN, onvalider } }) as Record<string, unknown>;
    await settle();
    const code = document.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')!;
    code.value = "111111";
    code.dispatchEvent(new Event("input", { bubbles: true }));
    btn("Activer").click();
    await settle();
    expect(code.getAttribute("aria-invalid")).toBe("true");
    expect(texte()).toContain("Code incorrect.");
  });
});
