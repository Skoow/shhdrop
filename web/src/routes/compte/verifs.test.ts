// Vérifications sur l'appareil (20 novembre) : domaines jetables (liste du serveur), fautes de
// frappe des domaines courants, règles d'un nouveau mot de passe.
import { describe, expect, it } from "vitest";
import { estJetable, mdpFort, reglesMdp, suggestion } from "./verifs";

describe("adresse", () => {
  it("jetable : domaine de la liste du serveur, et ses sous-domaines ; domaine courant : non", async () => {
    expect(await estJetable("a@yopmail.com")).toBe(true);
    expect(await estJetable("a@x.yopmail.com")).toBe(true);
    expect(await estJetable("a@gmail.com")).toBe(false);
    expect(await estJetable("pas une adresse")).toBe(false);
  });
  it("faute de frappe : une seule, vers un domaine courant ; rien pour un domaine juste ou lointain", () => {
    expect(suggestion("Lea@gmial.com")).toBe("Lea@gmail.com");
    expect(suggestion("lea@hotmial.fr")).toBe("lea@hotmail.fr");
    expect(suggestion("lea@gmail.con")).toBe("lea@gmail.com");
    expect(suggestion("lea@gmail.com")).toBeNull();
    expect(suggestion("lea@yopmail.com")).toBeNull();
    expect(suggestion("lea@exemple.fr")).toBeNull();
  });
});

describe("mot de passe", () => {
  it("règles : longueur, minuscule, majuscule, chiffre, caractère spécial, différent de l'adresse", () => {
    expect(reglesMdp("", "lea@exemple.fr")).toEqual({ longueur: false, minuscule: false, majuscule: false, chiffre: false, signe: false, adresse: false });
    expect(mdpFort("Correct-horse-9", "lea@exemple.fr")).toBe(true);
    expect(mdpFort("correct-horse-9", "")).toBe(false);
    expect(mdpFort("Lea@exemple.fr1", "lea@exemple.fr1")).toBe(false);
    expect(reglesMdp("Élan-vital-42", "").majuscule).toBe(true);
  });
});
