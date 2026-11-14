// @vitest-environment happy-dom
// Connexion (conception compte §12.2, §21.11 ; plan, lot 10) : étape du code de l'application,
// « Adresse ou mot de passe incorrect. », compte banni (date et motif), preuve anti-robot après
// 5 échecs, déconnexion.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../../i18n/i18n.svelte";
import { attendre, bouton, champ, cocher, demonter, erreurDe, monter, PREUVE, presser, saisir, texte } from "./pages.test-helper";

const C = vi.hoisted(() => ({ seConnecter: vi.fn(), validerTotp: vi.fn(), etatCompte: vi.fn(), seDeconnecter: vi.fn(), verifierSaisie: vi.fn() }));
vi.mock("../../account/session.svelte", async (orig) => ({ ...(await orig<object>()), ...C }));
const P = vi.hoisted(() => ({ preparerPreuve: vi.fn(), obtenirPreuve: vi.fn() }));
vi.mock("./preuve", () => P);
const S = await import("../../account/session.svelte");
const { CompteError, account } = S;
const { default: Connexion } = await import("./Connexion.svelte");

const MDP = "correct horse battery";
const ETAT = { creeLe: "2026-11-14", palier: "neuf", confirmeLe: "2026-11-21", limites: { salons: 1, places: 4, heures: 24 }, salonsActifs: 0, totp: false, recupJusqu: null, retraitTotpLe: null, banniJusqu: null, banniMotif: null };

async function connecter(stay = false) {
  await monter(Connexion);
  saisir("Adresse e-mail", "lea@exemple.fr");
  saisir("Mot de passe", MDP);
  if (stay) cocher("Rester connecté sur cet appareil");
  await presser("Se connecter");
}

beforeEach(() => {
  setLang("fr");
  for (const f of [...Object.values(C), ...Object.values(P)]) f.mockReset();
  C.verifierSaisie.mockResolvedValue({});
  C.seConnecter.mockImplementation(async () => {
    account.etat = "ouvert";
    return "ouvert";
  });
  C.validerTotp.mockImplementation(async () => {
    account.etat = "ouvert";
  });
  C.etatCompte.mockResolvedValue(ETAT);
  C.seDeconnecter.mockImplementation(async () => {
    account.etat = "absent";
  });
  P.obtenirPreuve.mockResolvedValue(PREUVE);
  account.etat = "absent";
  account.erreur = undefined;
});
afterEach(() => {
  demonter();
  account.etat = "absent";
});

describe("Connexion", () => {
  it("titre, champs, case « Rester connecté » décochée avec son indice, liens", async () => {
    await monter(Connexion);
    expect(document.querySelector("h1")!.textContent).toBe("Se connecter");
    expect(champ("Mot de passe").getAttribute("autocomplete")).toBe("current-password");
    expect(champ("Rester connecté sur cet appareil").checked).toBe(false);
    expect(texte()).toContain("À éviter sur un appareil partagé.");
    const liens = [...document.querySelectorAll("a")].map((a) => [a.textContent!.trim(), a.getAttribute("href")]);
    expect(liens).toContainEqual(["Mot de passe oublié ?", "/compte/oubli"]);
    expect(liens).toContainEqual(["Créer un compte", "/compte/inscription"]);
  });

  it("?suite=salon : gardé sur le lien « Créer un compte », rien d'autre", async () => {
    history.replaceState(null, "", "/compte/connexion?suite=salon");
    await monter(Connexion);
    expect(document.querySelector('a[href^="/compte/inscription"]')!.getAttribute("href")).toBe("/compte/inscription?suite=salon");
    history.replaceState(null, "", "/compte/connexion?email=lea@exemple.fr");
    demonter();
    await monter(Connexion);
    expect(document.querySelector('a[href^="/compte/inscription"]')!.getAttribute("href")).toBe("/compte/inscription");
    expect(champ("Adresse e-mail").value).toBe(""); // rien n'est lu de l'adresse de la page
    history.replaceState(null, "", "/compte/connexion");
  });

  it("réussite : adresse et mot de passe passés au module, « Rester connecté » transmis ; vue connectée", async () => {
    await connecter(true);
    expect(C.seConnecter).toHaveBeenCalledWith("lea@exemple.fr", MDP, true, undefined);
    expect(texte()).toContain("Vous êtes connecté sur cet appareil.");
    await presser("Se déconnecter");
    expect(C.seDeconnecter).toHaveBeenCalled();
    expect(texte()).toContain("Vous êtes déconnecté.");
  });

  it("session rouverte après le montage (« Rester connecté ») : la page passe à « connecté »", async () => {
    await monter(Connexion);
    expect(texte()).not.toContain("Vous êtes connecté sur cet appareil.");
    account.etat = "ouvert";
    await attendre();
    expect(texte()).toContain("Vous êtes connecté sur cet appareil.");
  });

  it("« Adresse ou mot de passe incorrect. » (même message pour une adresse inconnue)", async () => {
    C.seConnecter.mockRejectedValue(new CompteError(403, "identifiants"));
    await connecter();
    expect(texte()).toContain("Adresse ou mot de passe incorrect.");
    expect(account.etat).toBe("absent");
  });

  it("preuve requise (5 échecs) : preuve calculée et même demande renvoyée une fois", async () => {
    C.seConnecter.mockRejectedValueOnce(new CompteError(403, "preuve_requise"));
    await connecter();
    expect(P.obtenirPreuve).toHaveBeenCalledTimes(1);
    expect(C.seConnecter).toHaveBeenLastCalledWith("lea@exemple.fr", MDP, false, PREUVE);
    expect(texte()).toContain("Vous êtes connecté sur cet appareil.");
  });

  it("étape TOTP : « Code incorrect. », « Ce code a déjà servi. Attendez le suivant. », puis réussite ; lien « Je n'ai plus mon application »", async () => {
    C.seConnecter.mockResolvedValue("totp");
    await connecter();
    expect(texte()).toContain("Code de votre application d'authentification");
    const lien = [...document.querySelectorAll("a")].find((a) => a.textContent!.trim() === "Je n'ai plus mon application")!;
    expect(lien.getAttribute("href")).toBe("/compte/oubli");
    saisir("Code de votre application d'authentification", "111111");
    C.validerTotp.mockRejectedValueOnce(new CompteError(403, "totp_faux"));
    await presser("Valider");
    expect(erreurDe("Code de votre application d'authentification")).toBe("Code incorrect.");
    C.validerTotp.mockRejectedValueOnce(new CompteError(403, "totp_rejoue"));
    await presser("Valider");
    expect(erreurDe("Code de votre application d'authentification")).toBe("Ce code a déjà servi. Attendez le suivant.");
    await presser("Valider");
    expect(C.validerTotp).toHaveBeenLastCalledWith("111111");
    expect(texte()).toContain("Vous êtes connecté sur cet appareil.");
  });

  it("compte banni : connexion permise, date et motif affichés", async () => {
    C.etatCompte.mockResolvedValue({ ...ETAT, banniJusqu: "2029-11-14", banniMotif: 6 });
    await connecter();
    expect(texte()).toContain(`Ce compte ne peut plus créer de salon jusqu'au 14 novembre 2029. Motif : Harcèlement. Vous pouvez toujours exporter ou supprimer vos données.`);
  });

  it("limite : « Trop de tentatives. Réessayez dans {durée}. » ; coffre illisible : bandeau", async () => {
    C.seConnecter.mockRejectedValueOnce(new CompteError(429, "limit", { retryAfterS: 600 }));
    await connecter();
    expect(texte()).toContain("Trop de tentatives. Réessayez dans 10 min.");
    C.seConnecter.mockImplementationOnce(async () => {
      account.erreur = "coffre_illisible";
      throw new Error("coffre_illisible");
    });
    await presser("Se connecter");
    expect(texte()).toContain("Vos données chiffrées ne s'ouvrent pas sur cet appareil. Reconnectez-vous.");
  });

  it("adresse invalide : erreur sous l'adresse, aucune requête", async () => {
    C.verifierSaisie.mockResolvedValue({ email: "adresse_invalide" });
    await connecter();
    expect(erreurDe("Adresse e-mail")).toBe("Adresse e-mail invalide.");
    expect(C.seConnecter).not.toHaveBeenCalled();
    expect(bouton("Se connecter")).toBeTruthy();
  });
});
