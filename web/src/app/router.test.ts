// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { href, match, navigate, otherEntry, router, setEntry, suite } from "./router.svelte";

const KEY = "A".repeat(42) + "Q"; // 43 caractères base64url (forme seulement)

describe("match", () => {
  it("accueil et pages fixes", () => {
    expect(match("/")).toEqual({ name: "home" });
    expect(match("/securite")).toEqual({ name: "securite" });
    expect(match("/confidentialite")).toEqual({ name: "confidentialite" });
    // Page d'envoi vide (retours DROP) : « Commencer » y mène ; un « # » n'y ouvre rien.
    expect(match("/envoyer")).toEqual({ name: "envoyer" });
    expect(match("/envoyer", `#${KEY}`)).toEqual({ name: "envoyer" });
    // Task H : tableau de bord « Mes partages » (spec §33).
    expect(match("/envois")).toEqual({ name: "envois" });
    expect(match("/telechargements")).toEqual({ name: "telechargements" });
    expect(match("/envois", `#m${KEY}`)).toEqual({ name: "envois" });
  });

  it("spec §41.4 : rechargement d'une ouverture déverrouillée (marque + octroi gardé) → ouverture ; sinon accueil", () => {
    expect(match("/", "", "/", true)).toEqual({ name: "open" });
    expect(match("/", "", "/", false)).toEqual({ name: "home" });
    expect(match("/securite", "", "/", true)).toEqual({ name: "securite" });
  });

  it("spec §32 : « / » + fragment de partage ou de gestion → ouverture ou gestion ; la clé n'est pas gardée", () => {
    expect(match("/", `#${KEY}`)).toEqual({ name: "open" });
    expect(match("/", `#m${KEY}`)).toEqual({ name: "manage" });
    expect(JSON.stringify(match("/", `#${KEY}`))).not.toContain(KEY);
  });
  it("D41-29 : lien du QR code (« #<K_lien>.<mot de passe> », même mal formé) → ouverture", () => {
    expect(match("/", `#${KEY}.YUMzIWNENT8jRmc`)).toEqual({ name: "open" });
    expect(match("/", `#${KEY}.%%`)).toEqual({ name: "open" });
    expect(match("/", `#${KEY}.`)).toEqual({ name: "open" });
  });

  it("fragment sans rapport avec une clé → accueil (App retire ensuite le « # »)", () => {
    for (const h of ["", "#", "#contenu", `#${KEY.slice(0, 19)}`, `#m${KEY}A`, `#${KEY.slice(1)}+`, `#${KEY.slice(0, 30)}é`])
      expect(match("/", h), h).toEqual({ name: "home" });
  });

  it("fragment de 20 à 44 caractères qui n'est pas une clé valide → ouverture, qui dira « Lien incomplet » (ruling 2)", () => {
    for (const h of [`#${KEY.slice(0, 20)}`, `#${KEY.slice(1)}`, `#${KEY}A`, `#m${KEY.slice(2)}`, `#x${KEY}`])
      expect(match("/", h), h).toEqual({ name: "open" });
    expect(match("/shhdrop/", `#${KEY.slice(0, 30)}`, "/shhdrop/")).toEqual({ name: "open" });
  });

  it("fragment de bonne forme ailleurs qu'à la racine : pas d'ouverture", () => {
    expect(match("/securite", `#${KEY}`)).toEqual({ name: "securite" });
    expect(match("/x", `#${KEY}`)).toEqual({ name: "notfound" });
  });

  it("anciens liens /s/{id}, /m/{id} (aucune compatibilité) et adresses inconnues → 404", () => {
    for (const p of ["/s/AbC_-1", "/m/xyz", "/s/", "/s", "/s/a/b", "/inconnu", "/securite/x", "//", "/s/é"]) {
      expect(match(p), p).toEqual({ name: "notfound" });
      expect(match(p, `#${KEY}`), p).toEqual({ name: "notfound" });
    }
  });

  it("avec une base de dépôt (démo)", () => {
    const base = "/shhdrop/";
    expect(match("/shhdrop/", `#${KEY}`, base)).toEqual({ name: "open" });
    expect(match("/shhdrop", `#m${KEY}`, base)).toEqual({ name: "manage" });
    expect(match("/shhdrop/", "", base)).toEqual({ name: "home" });
    expect(match("/shhdrop", "", base)).toEqual({ name: "home" });
    expect(match("/shhdrop/securite", "", base)).toEqual({ name: "securite" });
    expect(match("/shhdrop/envoyer", "", base)).toEqual({ name: "envoyer" });
    expect(match("/shhdrop/envois", "", base)).toEqual({ name: "envois" });
    expect(match("/shhdrop/telechargements", "", base)).toEqual({ name: "telechargements" });
    expect(match("/", `#${KEY}`, base)).toEqual({ name: "notfound" });
    expect(match("/shhdropx/", `#${KEY}`, base)).toEqual({ name: "notfound" });
  });
});

// Plan du compte, lot 10 : pages du compte seulement si __COMPTES__ (sinon la même 404 qu'une
// adresse inconnue) ; « ?suite=salon » seul paramètre, et aucune donnée dans l'adresse.
describe("pages du compte", () => {
  const C = (p: string, base = "/") => match(p, "", base, false, true);
  it("avec __COMPTES__ : /compte, inscription, connexion, oubli, profil", () => {
    expect(C("/compte")).toEqual({ name: "compte" });
    expect(C("/compte/inscription")).toEqual({ name: "inscription" });
    expect(C("/compte/connexion")).toEqual({ name: "connexion" });
    expect(C("/compte/oubli")).toEqual({ name: "oubli" });
    expect(C("/compte/profil")).toEqual({ name: "profil" });
    expect(C("/shhdrop/compte/connexion", "/shhdrop/")).toEqual({ name: "connexion" });
    // Un « # » n'ouvre rien ici (App le retire).
    expect(match("/compte/connexion", `#${KEY}`, "/", false, true)).toEqual({ name: "connexion" });
  });
  it("adresses voisines → 404", () => {
    for (const p of ["/compte/", "/compte/x", "/compte/connexion/", "/compte/connexion/x", "/Compte", "/compte/Connexion", "/comptes", "/compte/parametres"])
      expect(C(p), p).toEqual({ name: "notfound" });
  });
  it("sans __COMPTES__ (défaut, démo) : toutes → 404", () => {
    for (const p of ["/compte", "/compte/inscription", "/compte/connexion", "/compte/oubli", "/compte/profil"]) {
      expect(match(p), p).toEqual({ name: "notfound" });
      expect(match(p, "", "/", false, false), p).toEqual({ name: "notfound" });
    }
  });
  it("suite : « ?suite=salon » exactement, sinon rien", () => {
    expect(suite("?suite=salon")).toBe("salon");
    for (const q of ["", "?", "?suite=", "?suite=Salon", "?suite=salon&x=1", "?x=1&suite=salon", "?suite=salon#k", "?email=lea@exemple.fr"]) expect(suite(q), q).toBeNull();
  });
  it("navigate : « ?suite=salon » admis sur la connexion et l'inscription seulement", () => {
    navigate("/compte/connexion?suite=salon");
    expect(location.pathname + location.search).toBe("/compte/connexion?suite=salon");
    navigate("/compte/inscription?suite=salon");
    expect(location.search).toBe("?suite=salon");
    for (const p of ["/compte/connexion?suite=x", "/compte/connexion?email=a@b.fr", "/securite?suite=salon", "/compte/oubli?suite=salon", "/compte/connexion?suite=salon#k"])
      expect(() => navigate(p), p).toThrow();
    navigate("/");
  });
});

describe("navigate", () => {
  it("met à jour l'adresse et la route, sans rechargement", () => {
    navigate("/envois");
    expect(location.pathname).toBe("/envois");
    expect(router.current).toEqual({ name: "envois" });
    navigate("/");
    expect(router.current).toEqual({ name: "home" });
  });

  // Pages séparées (16 novembre) : une page d'information a son propre fichier HTML ; depuis
  // l'application, y aller charge cette page (et inversement), sans toucher au routeur.
  it("vers l'autre fichier HTML (application ↔ page d'information) : chargement complet", () => {
    const assign = vi.spyOn(location, "assign").mockImplementation(() => undefined);
    try {
      navigate("/securite");
      expect(assign).toHaveBeenCalledWith("/securite");
      expect(router.current).toEqual({ name: "home" });
      expect(otherEntry("/offres")).toBe(true);
      expect(otherEntry("/envois")).toBe(false);
      setEntry("pages");
      expect(otherEntry("/offres")).toBe(false);
      expect(otherEntry("/")).toBe(true);
      expect(match("/securite.html", "")).toEqual({ name: "securite" });
      expect(match("/offres.html", "")).toEqual({ name: "offres" });
    } finally {
      setEntry("app");
      assign.mockRestore();
    }
  });

  it("refuse tout ce qui n'est pas un chemin interne", () => {
    for (const p of ["//evil.example/x", "https://evil.example/", "securite", "/\\evil", "/a#k", "/s/x?y=1", `/#${KEY}`])
      expect(() => navigate(p), p).toThrow();
    expect(location.pathname).toBe("/");
  });

  it("popstate resynchronise la route, fragment compris (lien collé dans la barre)", () => {
    navigate("/envois");
    history.replaceState(null, "", `/#m${KEY}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(router.current).toEqual({ name: "manage" });
    history.replaceState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(router.current).toEqual({ name: "home" });
  });

  it("popstate sans changement de route : router.current n'est pas réaffecté (ni focus volé)", () => {
    navigate("/envois");
    const before = router.current;
    history.replaceState(null, "", "/envois#ancre");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(router.current).toBe(before);
    navigate("/telechargements");
    expect(router.current).not.toBe(before);
    navigate("/");
  });

  it("href préfixe la base", () => {
    expect(href("/securite")).toBe("/securite");
  });
});
