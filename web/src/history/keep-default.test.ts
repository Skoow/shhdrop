// Case « Garder ce partage » : décochée par défaut sans compte (le lien et sa clé resteraient sur
// un appareil peut-être partagé) ; avec un compte, son réglage.
import { afterEach, describe, expect, it } from "vitest";
import { keepReceivedDefault, setAccountPrefs, shares } from "./live.svelte";

describe("keepReceivedDefault", () => {
  afterEach(() => setAccountPrefs(null));
  it("sans compte : décochée, même historique activé", () => {
    setAccountPrefs(null);
    shares.enabled = true;
    expect(keepReceivedDefault()).toBe(false);
  });
  it("avec un compte : son réglage", () => {
    setAccountPrefs({ keepReceived: true });
    expect(keepReceivedDefault()).toBe(true);
    setAccountPrefs({ keepReceived: false });
    expect(keepReceivedDefault()).toBe(false);
  });
});
