// @vitest-environment happy-dom
// Supprimer le compte (conception compte §21.12, §21.15.4 point 12 ; décision du propriétaire du
// 14 novembre, suppression simplifiée ; plan, lot 13) : ce qui sera supprimé et ce qui ne peut pas
// être garanti, dit avant de confirmer ; pass perdu annoncé ; mot de passe redemandé ;
// progression « Destruction de vos partages : 1 / 2 » ; fin « Compte supprimé. » ; échecs dits.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../../i18n/i18n.svelte";
import { attendre, bouton, champ, demonter, monter, presser, saisir } from "./pages.test-helper";
/** Texte de la page, espaces insécables comprises ramenées à une espace (les textes FR en ont). */
const texte = () => document.body.textContent!.replace(/\s+/g, " ");

const C = vi.hoisted(() => ({ confirmerIdentite: vi.fn(), adresseConnue: vi.fn(), partagesASupprimer: vi.fn(), supprimerTout: vi.fn() }));
vi.mock("../../account/session.svelte", async (orig) => ({ ...(await orig<object>()), ...C }));
// L'illustration de fin ne s'anime pas ici (happy-dom rejette les animations annulées au démontage).
vi.mock("../../ui/motion", async (orig) => ({ ...(await orig<object>()), reducedMotion: () => true }));
const S = await import("../../account/session.svelte");
const { CompteError, account, REGLAGES_DEFAUT } = S;
const { default: Supprimer } = await import("./Supprimer.svelte");

const ETAT = { creeLe: "2026-11-14", palier: "neuf", confirmeLe: "2026-11-21", limites: { salons: 1, places: 4, heures: 24 }, salonsActifs: 1, totp: false, recupJusqu: null, retraitTotpLe: null, banniJusqu: null, banniMotif: null };
const MDP = "correct horse battery";

beforeEach(() => {
  setLang("fr");
  for (const f of Object.values(C)) f.mockReset();
  C.adresseConnue.mockReturnValue(true);
  C.partagesASupprimer.mockResolvedValue(2);
  account.etat = "ouvert";
  account.profil = { pseudo: "Léa", photo: null, langue: "fr", reglages: { ...REGLAGES_DEFAUT }, pass: null };
});
afterEach(() => {
  demonter();
  account.etat = "absent";
  account.profil = undefined;
});

async function* progres(echecs = 0) {
  yield { etape: "partages", fait: 0, total: 2, echecs: 0 };
  yield { etape: "partages", fait: 1, total: 2, echecs: 0 };
  yield { etape: "partages", fait: 2, total: 2, echecs };
  yield { etape: "compte" };
  yield { etape: "fini", salonsFermes: 1, partagesDetruits: 2 - echecs, partagesEchoues: echecs };
}

describe("Supprimer le compte", () => {
  it("dit ce qui sera supprimé et ce qui ne peut pas être garanti ; case « Effacer aussi les données de cet appareil » cochée", async () => {
    await monter(Supprimer, { etat: ETAT, onretour: vi.fn() });
    const t = texte();
    expect(document.querySelector("h1")!.textContent).toBe("Supprimer le compte");
    expect(t).toContain("Ce qui sera supprimé");
    expect(t).toContain("Les salons que vous avez créés : fermés pour tous leurs membres (1 en cours).");
    expect(t).toContain("Les partages que cet appareil ou votre compte connaît : détruits un par un (2).");
    expect(t).toContain("Ce qui ne peut pas être garanti");
    expect(t).toContain("Vos messages dans les salons des autres : ils s'effacent à la fin de ces salons, pas avant. Ceux qui les ont lus ont pu les copier.");
    expect(t).toContain("Les partages créés sur un appareil sans historique, ou absents de votre compte : nous ne pouvons pas les retrouver. Ils s'effacent à leur échéance.");
    expect(t).not.toContain("pass Plus");
    expect(champ("Effacer aussi les données de cet appareil").checked).toBe(true);
    expect(champ("Mot de passe actuel").getAttribute("autocomplete")).toBe("current-password");
  });

  it("pass en cours : sa perte est annoncée", async () => {
    account.profil = { ...account.profil!, pass: "plus" };
    await monter(Supprimer, { etat: ETAT, onretour: vi.fn() });
    expect(texte()).toContain("Votre pass Plus sera perdu. Un remboursement ne se demande qu'au vendeur.");
  });

  it("confirmation sur place, mot de passe vérifié, progression annoncée, puis « Compte supprimé. »", async () => {
    C.supprimerTout.mockImplementation(() => progres());
    await monter(Supprimer, { etat: ETAT, onretour: vi.fn() });
    saisir("Mot de passe actuel", MDP);
    await presser("Supprimer définitivement");
    expect(texte()).toContain("Supprimer définitivement votre compte ? Salons fermés pour tous : 1. Partages connus détruits : 2. Votre pseudo sera libéré. Vos messages dans les salons des autres s'effaceront à la fin de ces salons. Cette action ne peut pas être annulée.");
    expect(C.supprimerTout).not.toHaveBeenCalled();
    await presser("Supprimer");
    expect(C.confirmerIdentite).toHaveBeenCalledWith(MDP, "", undefined);
    expect(C.supprimerTout).toHaveBeenCalledWith({ effacerAppareil: true });
    await attendre();
    expect(texte()).toContain("Compte supprimé.");
  });

  it("une destruction échouée est dite ; case décochée : l'appareil garde ses données", async () => {
    C.supprimerTout.mockImplementation(() => progres(1));
    await monter(Supprimer, { etat: ETAT, onretour: vi.fn() });
    champ("Effacer aussi les données de cet appareil").click();
    saisir("Mot de passe actuel", MDP);
    await presser("Supprimer définitivement");
    await presser("Supprimer");
    await attendre();
    expect(C.supprimerTout).toHaveBeenCalledWith({ effacerAppareil: false });
    expect(texte()).toContain("1 partage n'a pas pu être détruit : il s'effacera à son échéance.");
  });

  it("mot de passe faux : rien n'est détruit", async () => {
    C.confirmerIdentite.mockRejectedValue(new CompteError(403, "identifiants"));
    await monter(Supprimer, { etat: ETAT, onretour: vi.fn() });
    saisir("Mot de passe actuel", "faux");
    await presser("Supprimer définitivement");
    await presser("Supprimer");
    expect(texte()).toContain("Adresse ou mot de passe incorrect.");
    expect(C.supprimerTout).not.toHaveBeenCalled();
  });

  it("pendant l'attente d'après une récupération : bouton désactivé, raison dite", async () => {
    await monter(Supprimer, { etat: { ...ETAT, recupJusqu: "2026-11-21" }, onretour: vi.fn() });
    expect(texte()).toContain("Par sécurité, après une récupération par e-mail, l'adresse ne peut pas être changée ni le compte supprimé avant le 21 novembre.");
    expect(bouton("Supprimer définitivement").disabled).toBe(true);
  });
});
