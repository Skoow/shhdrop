// @vitest-environment happy-dom
// Champ du code à 6 chiffres (conception compte §12 : one-time-code, clavier numérique, collage
// jamais bloqué) : un code collé avec espaces ou tirets est ramené à ses chiffres.
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n/i18n.svelte";
import CodeField from "./CodeField.svelte";

let c: Record<string, unknown> | undefined;
let value = "";
beforeEach(() => setLang("fr"));
afterEach(() => {
  if (c) void unmount(c);
  c = undefined;
  document.body.innerHTML = "";
});
function show(props: Record<string, unknown> = {}) {
  value = "";
  c = mount(CodeField as never, { target: document.body, props: { label: "Code reçu par e-mail", onvalue: (v: string) => (value = v), ...props } }) as Record<string, unknown>;
  flushSync();
  return document.querySelector("input")!;
}
const type = (i: HTMLInputElement, v: string) => {
  i.value = v;
  i.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
};

describe("CodeField", () => {
  it("étiquette visible, autocomplete one-time-code, clavier numérique, pas de maxlength (collage)", () => {
    const i = show();
    expect(document.querySelector("label")!.textContent).toBe("Code reçu par e-mail");
    expect(i.getAttribute("autocomplete")).toBe("one-time-code");
    expect(i.getAttribute("inputmode")).toBe("numeric");
    expect(i.hasAttribute("maxlength")).toBe(false);
    expect(i.getAttribute("type")).toBe("text");
  });
  it("collage « 123 456 », « 123-456 » : ramené à 123456 ; au plus 6 chiffres", () => {
    const i = show();
    type(i, "123 456");
    expect(i.value).toBe("123456");
    expect(value).toBe("123456");
    type(i, " 12-34-56 ");
    expect(value).toBe("123456");
    type(i, "1234567");
    expect(value).toBe("123456");
    type(i, "12a");
    expect(i.value).toBe("12");
  });
  it("erreur reliée au champ (aria-describedby, aria-invalid)", () => {
    const i = show({ error: "Code incorrect." });
    expect(i.getAttribute("aria-invalid")).toBe("true");
    const id = i.getAttribute("aria-describedby")!;
    expect(document.getElementById(id.split(" ").at(-1)!)!.textContent).toBe("Code incorrect.");
  });
});
