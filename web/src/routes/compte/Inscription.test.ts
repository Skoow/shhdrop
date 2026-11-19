// @vitest-environment happy-dom
// Inscription (conception compte §12.1, §21.3, §21.15.2 ; plan, lot 10) : erreurs exactes, pseudo
// vérifié 400 ms après la frappe (« Disponible », « Déjà pris »), aucune étape de code de
// secours, messages d'état après le code juste, rien dans l'adresse de la page.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../../i18n/i18n.svelte";
import { attendre, bouton, champ, cocher, demonter, erreurDe, monter, PREUVE, presser, saisir, texte } from "./pages.test-helper";

const NN = " ";
const C = vi.hoisted(() => ({
  inscrire: vi.fn(), confirmer: vi.fn(), renvoyerCode: vi.fn(), pseudoLibre: vi.fn(), verifierSaisie: vi.fn(),
}));
vi.mock("../../account/session.svelte", async (orig) => ({ ...(await orig<object>()), ...C }));
const P = vi.hoisted(() => ({ preparerPreuve: vi.fn(), obtenirPreuve: vi.fn() }));
vi.mock("./preuve", () => P);
const { CompteError } = await import("../../account/session.svelte");
const { default: Inscription } = await import("./Inscription.svelte");

const MDP = "correct horse battery";
async function remplir(o: { email?: string; mdp?: string; pseudo?: string; age?: boolean } = {}) {
  await monter(Inscription);
  saisir("Adresse e-mail", o.email ?? "Lea@Exemple.fr");
  saisir("Mot de passe", o.mdp ?? MDP);
  saisir("Pseudo", o.pseudo ?? "Léa");
  if (o.age !== false) cocher(`J'ai au moins 15${NN}ans et j'accepte les conditions d'utilisation`);
}
async function jusquAuCode() {
  await remplir();
  await presser("Recevoir un code");
}

beforeEach(() => {
  setLang("fr");
  for (const f of [...Object.values(C), ...Object.values(P)]) f.mockReset();
  C.verifierSaisie.mockResolvedValue({});
  C.inscrire.mockResolvedValue(undefined);
  C.confirmer.mockResolvedValue(undefined);
  C.renvoyerCode.mockResolvedValue(undefined);
  C.pseudoLibre.mockResolvedValue(true);
  P.obtenirPreuve.mockResolvedValue(PREUVE);
  history.replaceState(null, "", "/compte/inscription");
});
afterEach(() => {
  demonter();
  vi.useRealTimers();
});

describe("Inscription, étape 1", () => {
  it("titre, sous-titre, champs avec étiquettes et autocomplete exacts, lien « J'ai déjà un compte »", async () => {
    await monter(Inscription);
    expect(document.querySelector("h1")!.textContent).toBe("Créer un compte");
    expect(texte()).toContain("Le compte sert à créer des salons et à garder un abonnement. Partager, ouvrir et rejoindre restent sans compte.");
    expect(champ("Adresse e-mail").getAttribute("autocomplete")).toBe("email");
    expect(champ("Mot de passe").getAttribute("autocomplete")).toBe("new-password");
    expect(champ("Mot de passe").type).toBe("password");
    expect(texte()).toContain(`10${NN}caractères au moins`);
    expect(texte()).toContain(`C'est votre seul moyen de récupérer le compte${NN}: utilisez une adresse que vous gardez.`);
    expect(texte()).toContain("Ajouter une photo");
    expect([...document.querySelectorAll("a")].map((a) => a.textContent!.trim())).toContain("J'ai déjà un compte");
    // Le mot de passe s'affiche ou se masque.
    await presser("Afficher le mot de passe");
    expect(champ("Mot de passe").type).toBe("text");
  });

  it("erreurs exactes reliées aux champs, focus sur le premier ; aucune requête", async () => {
    C.verifierSaisie.mockResolvedValue({ email: "adresse_non_ascii", mdp: "mdp_court", pseudo: "pseudo_ecritures" });
    await remplir({ age: false });
    await presser("Recevoir un code");
    expect(erreurDe("Adresse e-mail")).toBe("Utilisez une adresse sans accent ni caractère spécial.");
    expect(erreurDe("Mot de passe")).toBe(`Au moins 10${NN}caractères.`);
    expect(erreurDe("Pseudo")).toBe("Une seule écriture à la fois.");
    expect(texte()).toContain("Cochez cette case pour continuer.");
    expect(document.activeElement).toBe(champ("Adresse e-mail"));
    expect(C.inscrire).not.toHaveBeenCalled();
    expect(P.obtenirPreuve).not.toHaveBeenCalled();
    for (const [code, msg] of [["adresse_invalide", "Adresse e-mail invalide."], ["mdp_adresse", "Le mot de passe ne doit pas être votre adresse."]] as const) {
      demonter();
      C.verifierSaisie.mockResolvedValue(code.startsWith("mdp") ? { mdp: code } : { email: code });
      await remplir();
      await presser("Recevoir un code");
      expect(texte()).toContain(msg);
    }
  });

  it("adresse jetable (serveur) : message sous l'adresse ; limite et indisponibilité : messages exacts", async () => {
    C.inscrire.mockRejectedValueOnce(new CompteError(400, "jetable"));
    await jusquAuCode();
    expect(erreurDe("Adresse e-mail")).toBe("Les adresses jetables ne sont pas acceptées.");
    C.inscrire.mockRejectedValueOnce(new CompteError(429, "limit", { retryAfterS: 3600 }));
    await presser("Recevoir un code");
    expect(texte()).toContain(`Trop de tentatives. Réessayez dans 1${NN}h.`);
    C.inscrire.mockRejectedValueOnce(new CompteError(503, "busy"));
    await presser("Recevoir un code");
    expect(texte()).toContain("Les inscriptions sont momentanément fermées. Réessayez plus tard.");
    C.inscrire.mockRejectedValueOnce(new Error("reseau"));
    await presser("Recevoir un code");
    expect(texte()).toContain("Connexion perdue. Vérifiez votre réseau et réessayez.");
  });

  it("pseudo : règle vérifiée 400 ms après la frappe ; disponibilité dite seulement à l'étape du code", async () => {
    await monter(Inscription);
    saisir("Pseudo", "Léa");
    await new Promise((r) => setTimeout(r, 300));
    expect(C.verifierSaisie).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 150));
    await attendre();
    expect(C.verifierSaisie).toHaveBeenCalledWith({ pseudo: "Léa" });
    expect(C.pseudoLibre).not.toHaveBeenCalled();
    expect(texte()).toContain("La disponibilité sera vérifiée à l'étape suivante.");
  });

  it("envoi : adresse telle que tapée, langue de la page, preuve anti-robot ; rien dans l'adresse de la page", async () => {
    await jusquAuCode();
    expect(C.inscrire).toHaveBeenCalledWith("Lea@Exemple.fr", "fr", PREUVE);
    expect(texte()).toContain(`Nous venons d'envoyer un code à 6${NN}chiffres à l'adresse indiquée, si elle peut être utilisée.`);
    expect(location.href).toBe("http://localhost:3000/compte/inscription");
    expect(location.href).not.toContain("Lea");
  });
});

describe("Inscription, étape 2 (code)", () => {
  it("le pseudo est vérifié auprès du serveur dès l'étape du code : « Disponible » ou « Déjà pris »", async () => {
    C.pseudoLibre.mockResolvedValue(false);
    await jusquAuCode();
    await new Promise((r) => setTimeout(r, 450));
    await attendre();
    expect(C.pseudoLibre).toHaveBeenCalledWith("Léa");
    expect(erreurDe("Pseudo")).toBe("Déjà pris");
  });

  it("aucune étape de code de secours : code juste → « Compte créé. » ; profil envoyé (pseudo, photo nulle, langue)", async () => {
    await jusquAuCode();
    saisir("Code reçu par e-mail", "123 456");
    await presser("Créer le compte");
    expect(C.confirmer).toHaveBeenCalledWith("123456", MDP, expect.objectContaining({ pseudo: "Léa", photo: null, langue: "fr", pass: null }), false);
    expect(texte()).toContain("Compte créé.");
    expect(texte()).not.toMatch(/secours/i);
  });

  it("code faux : « Code incorrect. Il reste {n} essais. » ; échu : « Code expiré. Demandez-en un nouveau. »", async () => {
    await jusquAuCode();
    saisir("Code reçu par e-mail", "000000");
    C.confirmer.mockRejectedValueOnce(new CompteError(403, "code_faux", { attemptsLeft: 4 }));
    await presser("Créer le compte");
    expect(erreurDe("Code reçu par e-mail")).toBe(`Code incorrect. Il reste 4${NN}essais.`);
    C.confirmer.mockRejectedValueOnce(new CompteError(403, "code_faux", { attemptsLeft: 1 }));
    await presser("Créer le compte");
    expect(erreurDe("Code reçu par e-mail")).toBe(`Code incorrect. Il reste 1${NN}essai.`);
    C.confirmer.mockRejectedValueOnce(new CompteError(404, "not_found"));
    await presser("Créer le compte");
    expect(erreurDe("Code reçu par e-mail")).toBe("Code expiré. Demandez-en un nouveau.");
  });

  it("messages d'état de §21.3 après le code juste : adresse déjà inscrite, adresse bannie (date)", async () => {
    await jusquAuCode();
    saisir("Code reçu par e-mail", "123456");
    C.confirmer.mockRejectedValueOnce(new CompteError(409, "deja_inscrit"));
    await presser("Créer le compte");
    expect(texte()).toContain(`Cette adresse a déjà un compte. Connectez-vous ou utilisez « Mot de passe oublié ».`);
    C.confirmer.mockRejectedValueOnce(new CompteError(403, "banni", { jusqu: "2029-11-14" }));
    await presser("Créer le compte");
    expect(texte()).toContain("Cette adresse ne peut pas créer de compte jusqu'au 14 novembre 2029.");
  });

  it("pseudo pris à la fin : erreur sous le pseudo, l'étape reste", async () => {
    await jusquAuCode();
    saisir("Code reçu par e-mail", "123456");
    C.confirmer.mockRejectedValueOnce(new CompteError(409, "pseudo_pris"));
    await presser("Créer le compte");
    expect(erreurDe("Pseudo")).toBe("Déjà pris");
    expect(bouton("Créer le compte")).toBeTruthy();
  });

  it("« Renvoyer le code » : actif après 60 s ; « Modifier l'adresse » revient à l'étape 1", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    await jusquAuCode();
    expect(bouton("Renvoyer le code (60 s)").disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    await attendre(3);
    await presser("Renvoyer le code");
    expect(C.renvoyerCode).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    await presser("Modifier l'adresse");
    expect(champ("Adresse e-mail").value).toBe("Lea@Exemple.fr");
  });
});
