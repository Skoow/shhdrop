import { describe, expect, it } from "vitest";
import { currentTab, tabBarVisible, tabBarUseful, tabPath, tabsFor, TABS } from "./tabbar";

const base = { supported: true, sending: false, composing: false };

describe("barre d'onglets (téléphone)", () => {
  it("règle du 11 novembre (audit M18) : visible dès deux onglets utiles ; Mes partages actif, donc visible", () => {
    expect(tabBarUseful([{ id: "send", soon: false }, { id: "shares", soon: true }, { id: "chat", soon: true }])).toBe(false);
    expect(tabBarUseful([{ id: "send", soon: false }, { id: "shares", soon: false }, { id: "chat", soon: true }])).toBe(true);
    expect(TABS.filter((t) => !t.soon).map((t) => t.id)).toEqual(["send", "shares", "downloads"]);
    expect(tabBarUseful(TABS)).toBe(true);
  });
  it("visible sur l'accueil, Mes partages, Sécurité, Confidentialité et la 404", () => {
    for (const route of ["home", "envois", "telechargements", "securite", "confidentialite", "notfound"] as const) expect(tabBarVisible({ ...base, route })).toBe(true);
  });
  it("masquée chez le destinataire (ouverture, contenu) et sur la gestion", () => {
    expect(tabBarVisible({ ...base, route: "open" })).toBe(false);
    expect(tabBarVisible({ ...base, route: "manage" })).toBe(false);
  });
  it("masquée pendant un envoi, sur « Lien prêt », pendant la composition, sans prise en charge", () => {
    expect(tabBarVisible({ ...base, route: "home", sending: true })).toBe(false);
    expect(tabBarVisible({ ...base, route: "home", composing: true })).toBe(false);
    expect(tabBarVisible({ ...base, route: "home", supported: false })).toBe(false);
  });
  // Conception compte §21.15.5 : sans compte, trois onglets, Envoyer, Mes partages, Téléchargements
  // (l'onglet Salon « bientôt » laisse sa place ; le salon reste annoncé dans l'accueil et le pied).
  it("onglets : Envoyer, Mes partages, Téléchargements, sans Réglages (pied de page) ; onglet courant", () => {
    expect(TABS.map((t) => `${t.id}${t.soon ? "*" : ""}`)).toEqual(["send", "shares", "downloads"]);
    expect(currentTab("telechargements")).toBe("downloads");
    expect(currentTab("home")).toBe("send");
    expect(currentTab("envois")).toBe("shares");
    expect(currentTab("securite")).toBeNull();
    expect(currentTab("confidentialite")).toBeNull();
    expect(currentTab("notfound")).toBeNull();
  });

  // Conception compte §21.15.1 (plan, lot 12) : connecté, quatre onglets Accueil, Envoyer,
  // Téléchargements, Profil ; sans compte, rien ne change (trois onglets).
  it("connecté : quatre onglets (Accueil, Envoyer, Téléchargements, Profil), chemins et onglet courant ; sans compte inchangé", () => {
    expect(tabsFor(true).map((t) => `${t.id}${t.soon ? "*" : ""}`)).toEqual(["home", "send", "downloads", "profile"]);
    expect(tabsFor(false)).toBe(TABS);
    expect(["home", "send", "downloads", "profile"].map((id) => tabPath(id as never, true))).toEqual(["/", "/envoyer", "/telechargements", "/compte/profil"]);
    expect(["send", "shares", "downloads"].map((id) => tabPath(id as never, false))).toEqual(["/", "/envois", "/telechargements"]);
    expect(currentTab("home", true)).toBe("home");
    expect(currentTab("envoyer", true)).toBe("send");
    expect(currentTab("profil", true)).toBe("profile");
    expect(currentTab("compte", true)).toBe("profile");
    expect(currentTab("envois", true)).toBeNull();
    expect(currentTab("home")).toBe("send");
    expect(tabBarVisible({ ...base, route: "profil", connected: true })).toBe(true);
    expect(tabBarVisible({ ...base, route: "profil" })).toBe(false);
  });
});
