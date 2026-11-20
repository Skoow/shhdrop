import { describe, expect, it } from "vitest";
import { typeAffichage } from "./affichage";

describe("salon : type du Blob affiché (audit du 20 novembre)", () => {
  it("jamais le type annoncé s'il n'est pas dans la table sûre", () => {
    for (const bad of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/xml", "application/javascript"]) {
      expect(typeAffichage("image", bad)).toBeNull();
      // Vidéo et vocal : type par défaut de la visionneuse, jamais le type piégé.
      expect(typeAffichage("video", bad)).toBe("video/mp4");
      expect(typeAffichage("vocal", bad)).toBe("audio/mp4");
      expect(typeAffichage("fichier", bad)).toBeNull();
    }
  });
  it("types sûrs gardés, paramètres et casse ignorés", () => {
    expect(typeAffichage("image", "image/png")).toBe("image/png");
    expect(typeAffichage("image", "image/heic")).toBeNull(); // hors de la liste du salon
    expect(typeAffichage("video", "VIDEO/WEBM")).toBe("video/webm");
    expect(typeAffichage("vocal", "audio/webm;codecs=opus")).toBe("audio/webm");
    expect(typeAffichage("vocal", "audio/ogg")).toBe("audio/ogg");
  });
});
