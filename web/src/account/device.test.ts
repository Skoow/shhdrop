// Nom d'appareil d'une session (conception compte §8.5, §9.3) : calculé sur l'appareil, chiffré
// par K_etiquette en 64 octets fixes ; le serveur ne le voit jamais en clair.
import { describe, expect, it } from "vitest";
import { ETIQUETTE_LEN, nomAppareil, ouvrirEtiquette, scellerEtiquette } from "./device";

const key = () => crypto.subtle.importKey("raw", new Uint8Array(32).fill(9), "AES-GCM", false, ["encrypt", "decrypt"]);
const H = new Uint8Array(16).fill(1);

describe("nom d'appareil", () => {
  it("navigateur et sorte d'appareil, rien d'autre (ni version, ni système précis)", () => {
    expect(nomAppareil("Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0")).toBe("Firefox · ordinateur");
    expect(nomAppareil("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari · téléphone");
    expect(nomAppareil("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36")).toBe("Chrome · téléphone");
    expect(nomAppareil("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0")).toBe("Edge · ordinateur");
    expect(nomAppareil("")).toBe("Navigateur · ordinateur");
  });
});

describe("étiquette chiffrée", () => {
  it("64 octets fixes, quelle que soit la longueur du nom ; s'ouvre avec la même clé et le même h", async () => {
    const k = await key();
    for (const nom of ["A", "Firefox · ordinateur", "é".repeat(40)]) {
      const e = await scellerEtiquette(k, H, nom);
      expect(e.length).toBe(ETIQUETTE_LEN);
      expect(ETIQUETTE_LEN).toBe(64);
      const out = await ouvrirEtiquette(k, H, e);
      expect(out).toBe(nom.length > 17 && nom.startsWith("é") ? "é".repeat(17) : nom); // 35 octets au plus, coupé sur un caractère
      expect(new TextDecoder().decode(e)).not.toContain("Firefox");
    }
  });

  it("autre h, octet changé ou mauvaise taille : null", async () => {
    const k = await key();
    const e = await scellerEtiquette(k, H, "Firefox · ordinateur");
    expect(await ouvrirEtiquette(k, new Uint8Array(16), e)).toBeNull();
    const bad = e.slice();
    bad[20]! ^= 1;
    expect(await ouvrirEtiquette(k, H, bad)).toBeNull();
    expect(await ouvrirEtiquette(k, H, e.slice(0, 63))).toBeNull();
  });
});
