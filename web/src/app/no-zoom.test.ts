// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blockZoom } from "./no-zoom";

describe("zoom bloqué (propriétaire, 18 novembre)", () => {
  it("pincement WebKit refusé ; deux doigts refusés, un doigt (défilement) laissé", () => {
    const doc = document.implementation.createHTMLDocument("t");
    blockZoom(doc);
    for (const t of ["gesturestart", "gesturechange", "gestureend"]) {
      const e = new Event(t, { cancelable: true });
      doc.dispatchEvent(e);
      expect(e.defaultPrevented, t).toBe(true);
    }
    const move = (n: number) => {
      const e = new Event("touchmove", { cancelable: true });
      Object.defineProperty(e, "touches", { value: { length: n } });
      doc.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(move(1)).toBe(false);
    expect(move(2)).toBe(true);
  });

  it("les trois pages : viewport sans zoom", () => {
    for (const f of ["index.html", "page.html", "s.html"]) {
      const html = readFileSync(join(process.cwd(), f), "utf8");
      expect(html, f).toMatch(/content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover/);
    }
  });
});
