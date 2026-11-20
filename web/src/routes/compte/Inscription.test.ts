// @vitest-environment happy-dom
// Inscription (conception compte §12.1, §21.3, §21.15.2 ; plan, lot 10 ; simplifiée le 20 novembre :
// adresse, mot de passe et confirmation, « Créer », phrase des 15 ans dessous ; pseudo provisoire
// tiré au hasard) : erreurs exactes, aucune étape de code de secours, messages d'état après le
// code juste, rien dans l'adresse de la page.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../../i18n/i18n.svelte";
import { attendre, bouton, champ, demonter, erreurDe, monter, PREUVE, presser, saisir, texte } from "./pages.test-helper";

const NN = " ";
const C = vi.hoisted(() => ({
  inscrire: vi.fn(), confirmer: vi.fn(), renvoyerCode: vi.fn(), pseudoLibre: vi.fn(), verifierSaisie: vi.fn(),
}));
vi.mock("../../account/session.svelte", async (orig) => ({ ...(await orig<object>()), ...C }));
const P = vi.hoisted(() => ({ preparerPreuve: vi.fn(), obtenirPreuve: vi.fn() }));
vi.mock("./preuve", () => P);
const { CompteError } = await import("../../account/session.svelte");
const { default: Inscription } = await import("./Inscription.svelte");

const MDP = "Correct-horse-battery-9";
async function remplir(o: { email?: string; mdp?: string; mdp2?: string } = {}) {
  await monter(Inscription);
  saisir("Adresse e-mail", o.email ?? "Lea@Exemple.fr");
  saisir("Mot de passe", o.mdp ?? MDP);
  saisir("Confirmer le mot de passe", o.mdp2 ?? o.mdp ?? MDP);
}
async function jusquAuCode() {
  await remplir();
  await presser("Créer");
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
    // Plus de phrase sous l'adresse (20 novembre) ; règles du mot de passe affichées, non remplies.
    expect(texte()).not.toContain("C'est votre seul moyen");
    expect(document.querySelectorAll("[data-regles-mdp] li")).toHaveLength(6);
    expect(document.querySelectorAll("[data-regles-mdp] li[data-ok]")).toHaveLength(0);
    // 20 novembre : ni pseudo, ni photo, ni case ; la phrase des 15 ans sous « Créer ».
    expect(texte()).not.toContain("Ajouter une photo");
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(champ("Confirmer le mot de passe").getAttribute("autocomplete")).toBe("new-password");
    expect(document.querySelector("[data-legal]")!.textContent!.replace(/[ \n\t]+/g, " ").trim()).toBe(
      `En créant un compte, vous confirmez avoir au moins 15${NN}ans et accepter les conditions d'utilisation.`,
    );
    expect(document.querySelector<HTMLAnchorElement>("[data-legal] a")!.getAttribute("href")).toBe("/conditions");
    expect([...document.querySelectorAll("a")].map((a) => a.textContent!.trim())).toContain("J'ai déjà un compte");
    // Le mot de passe s'affiche ou se masque.
    await presser("Afficher le mot de passe");
    expect(champ("Mot de passe").type).toBe("text");
  });

  it("mot de passe : chaque règle se coche pendant la frappe ; trop faible : refusé avant toute requête", async () => {
    await monter(Inscription);
    saisir("Adresse e-mail", "lea@exemple.fr");
    saisir("Mot de passe", "abc");
    await attendre();
    const ok = () => [...document.querySelectorAll("[data-regles-mdp] li[data-ok]")].map((l) => l.getAttribute("data-regle"));
    expect(ok()).toEqual(["minuscule", "adresse"]);
    saisir("Mot de passe", "Abcdefghi1-");
    await attendre();
    expect(ok()).toEqual(["longueur", "minuscule", "majuscule", "chiffre", "signe", "adresse"]);
    saisir("Mot de passe", "abcdefghijk");
    saisir("Confirmer le mot de passe", "abcdefghijk");
    await presser("Créer");
    expect(erreurDe("Mot de passe")).toBe(`Mot de passe trop faible${NN}: complétez les points ci-dessous.`);
    expect(C.inscrire).not.toHaveBeenCalled();
  });

  it("adresse : domaine jetable dit pendant la frappe ; faute de frappe dans un domaine courant : correction proposée", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await monter(Inscription);
    saisir("Adresse e-mail", "lea@yopmail.com");
    await vi.advanceTimersByTimeAsync(600);
    await attendre(3);
    expect(erreurDe("Adresse e-mail")).toBe("Les adresses jetables ne sont pas acceptées.");
    saisir("Adresse e-mail", "lea@gmial.com");
    await vi.advanceTimersByTimeAsync(600);
    await attendre(3);
    const b = document.querySelector<HTMLButtonElement>("[data-propose] button")!;
    expect(b.textContent).toBe("lea@gmail.com");
    b.click();
    await attendre();
    expect(champ("Adresse e-mail").value).toBe("lea@gmail.com");
    expect(document.querySelector("[data-propose]")).toBeNull();
  });

  it("erreurs exactes reliées aux champs, focus sur le premier ; aucune requête", async () => {
    C.verifierSaisie.mockResolvedValue({ email: "adresse_non_ascii", mdp: "mdp_court" });
    await remplir();
    await presser("Créer");
    expect(erreurDe("Adresse e-mail")).toBe("Utilisez une adresse sans accent ni caractère spécial.");
    expect(erreurDe("Mot de passe")).toBe(`Au moins 10${NN}caractères.`);
    expect(document.activeElement).toBe(champ("Adresse e-mail"));
    expect(C.inscrire).not.toHaveBeenCalled();
    expect(P.obtenirPreuve).not.toHaveBeenCalled();
    for (const [code, msg] of [["adresse_invalide", "Adresse e-mail invalide."], ["mdp_adresse", "Le mot de passe ne doit pas être votre adresse."]] as const) {
      demonter();
      C.verifierSaisie.mockResolvedValue(code.startsWith("mdp") ? { mdp: code } : { email: code });
      await remplir();
      await presser("Créer");
      expect(texte()).toContain(msg);
    }
    // Confirmation différente : erreur sous la confirmation, aucune requête.
    demonter();
    C.verifierSaisie.mockResolvedValue({});
    await remplir({ mdp2: "autre chose encore" });
    await presser("Créer");
    expect(erreurDe("Confirmer le mot de passe")).toBe("Les deux mots de passe ne sont pas identiques.");
    expect(document.activeElement).toBe(champ("Confirmer le mot de passe"));
    expect(C.inscrire).not.toHaveBeenCalled();
  });

  it("adresse jetable (serveur) : message sous l'adresse ; limite et indisponibilité : messages exacts", async () => {
    C.inscrire.mockRejectedValueOnce(new CompteError(400, "jetable"));
    await jusquAuCode();
    expect(erreurDe("Adresse e-mail")).toBe("Les adresses jetables ne sont pas acceptées.");
    C.inscrire.mockRejectedValueOnce(new CompteError(429, "limit", { retryAfterS: 3600 }));
    await presser("Créer");
    expect(texte()).toContain(`Trop de tentatives. Réessayez dans 1${NN}h.`);
    C.inscrire.mockRejectedValueOnce(new CompteError(503, "busy"));
    await presser("Créer");
    expect(texte()).toContain("Les inscriptions sont momentanément fermées. Réessayez plus tard.");
    C.inscrire.mockRejectedValueOnce(new Error("reseau"));
    await presser("Créer");
    expect(texte()).toContain("Connexion perdue. Vérifiez votre réseau et réessayez.");
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
  it("aucune étape de code de secours : code juste → « Compte créé. » ; profil envoyé (pseudo provisoire, photo nulle, langue)", async () => {
    await jusquAuCode();
    expect(document.querySelectorAll("[data-pseudo]")).toHaveLength(0);
    saisir("Code reçu par e-mail", "123 456");
    await presser("Valider");
    expect(C.confirmer).toHaveBeenCalledWith("123456", MDP, expect.objectContaining({ pseudo: expect.stringMatching(/^Membre\d{6}$/), photo: null, langue: "fr", pass: null }), false);
    expect(texte()).toContain("Compte créé.");
    const pseudo = (C.confirmer.mock.calls[0]![2] as { pseudo: string }).pseudo;
    expect(document.querySelector("[data-pseudo-temp]")!.textContent!.replace(/[ \n\t]+/g, " ")).toContain(`Votre pseudo provisoire est «${NN}${pseudo}${NN}». Le changer dans votre profil`);
    expect(texte()).not.toMatch(/secours/i);
  });

  it("code faux : « Code incorrect. Il reste {n} essais. » ; échu : « Code expiré. Demandez-en un nouveau. »", async () => {
    await jusquAuCode();
    saisir("Code reçu par e-mail", "000000");
    C.confirmer.mockRejectedValueOnce(new CompteError(403, "code_faux", { attemptsLeft: 4 }));
    await presser("Valider");
    expect(erreurDe("Code reçu par e-mail")).toBe(`Code incorrect. Il reste 4${NN}essais.`);
    C.confirmer.mockRejectedValueOnce(new CompteError(403, "code_faux", { attemptsLeft: 1 }));
    await presser("Valider");
    expect(erreurDe("Code reçu par e-mail")).toBe(`Code incorrect. Il reste 1${NN}essai.`);
    C.confirmer.mockRejectedValueOnce(new CompteError(404, "not_found"));
    await presser("Valider");
    expect(erreurDe("Code reçu par e-mail")).toBe("Code expiré. Demandez-en un nouveau.");
  });

  it("messages d'état de §21.3 après le code juste : adresse déjà inscrite, adresse bannie (date)", async () => {
    await jusquAuCode();
    saisir("Code reçu par e-mail", "123456");
    C.confirmer.mockRejectedValueOnce(new CompteError(409, "deja_inscrit"));
    await presser("Valider");
    expect(texte()).toContain(`Cette adresse a déjà un compte. Connectez-vous ou utilisez « Mot de passe oublié ».`);
    C.confirmer.mockRejectedValueOnce(new CompteError(403, "banni", { jusqu: "2029-11-14" }));
    await presser("Valider");
    expect(texte()).toContain("Cette adresse ne peut pas créer de compte jusqu'au 14 novembre 2029.");
  });

  it("pseudo provisoire déjà pris : un autre est tiré, sans rien demander ; trois refus : message", async () => {
    await jusquAuCode();
    saisir("Code reçu par e-mail", "123456");
    C.confirmer.mockRejectedValueOnce(new CompteError(409, "pseudo_pris"));
    await presser("Valider");
    expect(C.confirmer).toHaveBeenCalledTimes(2);
    expect(texte()).toContain("Compte créé.");
    demonter();
    C.confirmer.mockReset();
    C.confirmer.mockRejectedValue(new CompteError(409, "pseudo_pris"));
    await jusquAuCode();
    saisir("Code reçu par e-mail", "123456");
    await presser("Valider");
    expect(C.confirmer).toHaveBeenCalledTimes(3);
    expect(bouton("Valider")).toBeTruthy();
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
