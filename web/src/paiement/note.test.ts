// Note de vente faite sur l'appareil (conception du paiement §9.3, S4).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lignes, nomFichier, noteHtml, prixTTC, reference, ventiler, VENDEUR, type NoteDonnees } from "./note";

const OSS = { regime: "oss" as const, taux: { DE: 1900, FR: 2000, FI: 2550, HU: 2700, LU: 1700 } };
const d = (over: Partial<NoteDonnees> = {}): NoteDonnees => ({
  id: "Ab-c_DEFghij0123",
  offre: "plus",
  jours: 30,
  renouvelle: true,
  moyen: "carte",
  pays: "DE",
  cree: Date.parse("2026-11-20T10:00:00Z"),
  fin: "2026-12-20",
  tva: OSS,
  maintenant: Date.parse("2026-11-20T10:05:00Z"),
  ...over,
});
const champ = (n: NoteDonnees, k: string) => lignes(n).vente.find(([c]) => c === k || c.startsWith(k + " "))?.[1];

describe("note de vente", () => {
  it("ventilation : les mêmes valeurs que le serveur (offres_test.go, TestVentiler)", () => {
    expect(ventiler(700, 2000)).toEqual({ ht: 583, tva: 117 });
    expect(ventiler(700, 1900)).toEqual({ ht: 588, tva: 112 });
    expect(ventiler(20000, 2700)).toEqual({ ht: 15748, tva: 4252 });
    expect(ventiler(7000, 2550)).toEqual({ ht: 5578, tva: 1422 });
    expect(ventiler(2000, 1700)).toEqual({ ht: 1709, tva: 291 });
    expect(ventiler(700, 0)).toEqual({ ht: 700, tva: 0 });
    const go = readFileSync(new URL("../../../server/internal/paiement/offres_test.go", import.meta.url), "utf8");
    for (const [ttc, bp, ht, tv] of [[700, "FR", 583, 117], [700, "DE", 588, 112], [20000, "HU", 15748, 4252], [7000, "FI", 5578, 1422], [2000, "LU", 1709, 291]] as const)
      expect(go).toContain(`{OSS, "${bp}", ${ttc}, ${ht}, ${tv}}`);
  });

  it("prix : ceux que le serveur facture (offres.go)", () => {
    const go = readFileSync(new URL("../../../server/internal/paiement/offres.go", import.meta.url), "utf8");
    expect(go).toContain(`{Nom: "plus", Libelle: "Shhgone Plus", Mois: ${prixTTC("plus", 30)}, An: ${prixTTC("plus", 365)},`);
    expect(go).toContain(`{Nom: "pro", Libelle: "Shhgone Pro", Mois: ${prixTTC("pro", 30)}, An: ${prixTTC("pro", 365)},`);
  });

  it("OSS : TVA du pays déclaré, période, référence, mentions du vendeur à compléter", () => {
    const n = d();
    expect(champ(n, "Désignation")).toBe("Shhgone Plus, 30 jours, renouvelé chaque mois");
    expect(champ(n, "Période")).toBe("du 20 novembre 2026 au 19 décembre 2026 inclus");
    expect(champ(n, "Prix unitaire HT")).toBe("5,88 €");
    expect(champ(n, "TVA")).toBe("1,12 €");
    expect(lignes(n).vente.some(([k]) => k === "TVA (19 %)")).toBe(true);
    expect(champ(n, "Total TTC")).toBe("7,00 €");
    expect(champ(n, "Numéro")).toBe(VENDEUR.numero);
    expect(reference(n)).toBe("SG-20261120-ABCDEFGHIJ");
    expect(nomFichier(n)).toBe("note-de-vente-shhgone-2026-11-20.html");
    expect(lignes(n).vendeur).toEqual([VENDEUR.nom, VENDEUR.adresse, `SIREN : ${VENDEUR.siren}`, `TVA intracommunautaire : ${VENDEUR.tva}`]);
    expect(lignes(n).mentions[0]).toBe("TVA du pays du client (guichet unique OSS).");
    for (const v of Object.values(VENDEUR)) expect(v.startsWith("[À COMPLÉTER")).toBe(true);
  });

  it("franchise : aucune TVA, mention de l'art. 293 B, pas de numéro de TVA ; France : 20 % partout", () => {
    const f = d({ tva: { regime: "franchise", taux: { DE: 0 } }, offre: "pro", jours: 365, renouvelle: false, moyen: "crypto" });
    expect(champ(f, "Prix HT")).toBe("200,00 €");
    expect(champ(f, "TVA")).toBe("0,00 €");
    expect(lignes(f).mentions[0]).toBe("TVA non applicable, art. 293 B du CGI.");
    expect(lignes(f).vendeur.some((x) => x.includes("TVA"))).toBe(false);
    expect(champ(f, "Moyen de paiement")).toBe("cryptomonnaie (NOWPayments)");
    const fr = d({ tva: { regime: "france", taux: { DE: 2000, FR: 2000 } }, pays: undefined });
    expect(champ(fr, "Prix unitaire HT")).toBe("5,83 €");
    expect(champ(fr, "Pays déclaré")).toBe("[non connu sur cet appareil]");
  });

  it("OSS sans pays connu : TVA à compléter, jamais un taux inventé", () => {
    const n = d({ pays: undefined });
    expect(champ(n, "Prix HT")).toContain("[À COMPLÉTER");
    expect(champ(n, "TVA")).toContain("[À COMPLÉTER");
    expect(champ(n, "Total TTC")).toBe("7,00 €");
  });

  it("HTML : autonome (CSP sans rien d'externe, aucun script), valeurs échappées", () => {
    const h = noteHtml(d({ id: "<script>x" }));
    expect(h).toContain(`content="default-src 'none'; style-src 'unsafe-inline'"`);
    expect(h).not.toMatch(/<script|src=|href=|url\(/i);
    expect(h).toContain("Note de vente");
    expect(h).toContain("5,88 €");
    expect(h).toContain("SG-20261120-SCRIPTX");
  });
});
