// @vitest-environment happy-dom
// Mot de passe oublié (conception compte §21.2.3, §21.2.4, §21.15.6 ; plan, lot 10) : adresse
// exacte, code, code de l'application si demandé, « Je n'ai plus mon application » → texte
// d'attente exact, bandeau de ce qui est gardé et perdu AVANT de valider, attente de 7 jours dite.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../../i18n/i18n.svelte";
import { champ, demonter, erreurDe, monter, PREUVE, presser, saisir, texte } from "./pages.test-helper";

const NN = " ";
const C = vi.hoisted(() => ({ oubli: { debut: vi.fn(), verifier: vi.fn(), fin: vi.fn() }, renvoyerCode: vi.fn(), etatCompte: vi.fn(), verifierSaisie: vi.fn() }));
vi.mock("../../account/session.svelte", async (orig) => ({ ...(await orig<object>()), ...C }));
const P = vi.hoisted(() => ({ preparerPreuve: vi.fn(), obtenirPreuve: vi.fn() }));
vi.mock("./preuve", () => P);
const { CompteError } = await import("../../account/session.svelte");
const { default: Oubli } = await import("./Oubli.svelte");

const MDP = "nouveau mot de passe";
const KEEP = "Votre pseudo, votre photo, votre abonnement et vos salons en cours sont gardés. Les liens et la gestion de salons enregistrés seulement dans votre ancien coffre seront perdus, sauf s'ils sont encore sur un de vos appareils.";

async function jusquAuCode(email = "Lea.Dupont+x@Gmail.com") {
  await monter(Oubli);
  saisir("Adresse e-mail exacte", email);
  await presser("Recevoir un code");
}

beforeEach(() => {
  setLang("fr");
  for (const f of [...Object.values(C.oubli), C.renvoyerCode, C.etatCompte, C.verifierSaisie, ...Object.values(P)]) f.mockReset();
  C.verifierSaisie.mockResolvedValue({});
  C.oubli.debut.mockResolvedValue(undefined);
  C.oubli.verifier.mockResolvedValue("ok");
  C.oubli.fin.mockResolvedValue(undefined);
  C.etatCompte.mockResolvedValue({ recupJusqu: "2026-11-21" });
  P.obtenirPreuve.mockResolvedValue(PREUVE);
});
afterEach(() => demonter());

describe("Mot de passe oublié", () => {
  it("étape 1 : adresse exacte (indice), envoyée telle que tapée ; message identique pour toute adresse", async () => {
    await monter(Oubli);
    expect(document.querySelector("h1")!.textContent).toBe("Mot de passe oublié");
    expect(texte()).toContain(`L'adresse exacte utilisée pour le compte, avec ses éventuels « + » et points.`);
    expect(champ("Adresse e-mail exacte").getAttribute("autocomplete")).toBe("email");
    saisir("Adresse e-mail exacte", "Lea.Dupont+x@Gmail.com");
    await presser("Recevoir un code");
    expect(C.oubli.debut).toHaveBeenCalledWith("Lea.Dupont+x@Gmail.com", "fr", PREUVE);
    expect(texte()).toContain("Si un compte utilise cette adresse, nous venons de lui envoyer un code.");
  });

  it("code juste sans double authentification : bandeau de §21.15.6 AVANT de valider, puis nouveau mot de passe", async () => {
    await jusquAuCode();
    expect(texte()).not.toContain(KEEP);
    saisir("Code reçu par e-mail", "123456");
    await presser("Continuer");
    expect(C.oubli.verifier).toHaveBeenCalledWith("123456", "", false);
    expect(texte()).toContain(KEEP);
    expect(C.oubli.fin).not.toHaveBeenCalled();
    expect(champ("Nouveau mot de passe").getAttribute("autocomplete")).toBe("new-password");
    saisir("Nouveau mot de passe", MDP);
    await presser("Changer le mot de passe");
    expect(C.verifierSaisie).toHaveBeenLastCalledWith({ email: "Lea.Dupont+x@Gmail.com", mdp: MDP });
    expect(C.oubli.fin).toHaveBeenCalledWith(MDP, false);
    expect(texte()).toContain("Mot de passe changé. Vos autres appareils ont été déconnectés.");
    expect(texte()).toContain("Par sécurité, après une récupération par e-mail, l'adresse ne peut pas être changée ni le compte supprimé avant le 21 novembre.");
  });

  it("double authentification : code de l'application demandé, puis passé avec le code e-mail", async () => {
    await jusquAuCode();
    saisir("Code reçu par e-mail", "123456");
    C.oubli.verifier.mockRejectedValueOnce(new CompteError(403, "totp_requis"));
    await presser("Continuer");
    expect(texte()).toContain(`Ce compte a la double authentification${NN}: entrez aussi le code de votre application.`);
    saisir("Code de votre application d'authentification", "654321");
    await presser("Continuer");
    expect(C.oubli.verifier).toHaveBeenLastCalledWith("123456", "654321", false);
    expect(texte()).toContain(KEEP);
  });

  it("« Je n'ai plus mon application » : texte d'attente exact de §21.2.4, avec la date", async () => {
    await jusquAuCode();
    saisir("Code reçu par e-mail", "123456");
    C.oubli.verifier.mockRejectedValueOnce(new CompteError(403, "totp_requis"));
    await presser("Continuer");
    C.oubli.verifier.mockResolvedValueOnce({ attenteJusqu: "2026-11-21" });
    await presser("Je n'ai plus mon application");
    expect(C.oubli.verifier).toHaveBeenLastCalledWith("123456", "", true);
    expect(texte()).toContain(`Par sécurité, la double authentification sera retirée le 21 novembre. Revenez à cette date avec un nouveau code reçu par e-mail. Si ce n'est pas vous, connectez-vous avec votre application${NN}: la demande sera annulée.`);
    expect(C.oubli.fin).not.toHaveBeenCalled();
  });

  it("code faux, code de l'application faux : messages exacts", async () => {
    await jusquAuCode();
    saisir("Code reçu par e-mail", "000000");
    C.oubli.verifier.mockRejectedValueOnce(new CompteError(403, "code_faux", { attemptsLeft: 2 }));
    await presser("Continuer");
    expect(erreurDe("Code reçu par e-mail")).toBe(`Code incorrect. Il reste 2${NN}essais.`);
    C.oubli.verifier.mockRejectedValueOnce(new CompteError(403, "totp_requis"));
    await presser("Continuer");
    saisir("Code de votre application d'authentification", "111111");
    C.oubli.verifier.mockRejectedValueOnce(new CompteError(403, "totp_faux"));
    await presser("Continuer");
    expect(erreurDe("Code de votre application d'authentification")).toBe("Code incorrect.");
  });

  it("nouveau mot de passe trop court : erreur exacte, rien envoyé", async () => {
    await jusquAuCode();
    saisir("Code reçu par e-mail", "123456");
    await presser("Continuer");
    C.verifierSaisie.mockResolvedValueOnce({ mdp: "mdp_court" });
    saisir("Nouveau mot de passe", "court");
    await presser("Changer le mot de passe");
    expect(erreurDe("Nouveau mot de passe")).toBe(`Au moins 10${NN}caractères.`);
    expect(C.oubli.fin).not.toHaveBeenCalled();
  });
});
