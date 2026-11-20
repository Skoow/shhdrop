// Compte essayable de la démo GitHub Pages (propriétaire, 19 novembre) : faux serveur du compte
// dans l'onglet (src/demo/fake-compte.ts), aucun e-mail ; le code s'affiche à l'écran. Parcours
// par l'interface réelle : inscription, déconnexion, mauvais mot de passe, connexion, mot de passe
// oublié, suppression. Gardes de la fixture `demo` : aucune requête /api sur le réseau, rien hors
// de l'origine, aucune violation de la CSP.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const EMAIL = "lea@exemple.fr";
const MDP = "Correct-horse-battery-9";
const MDP2 = "Tout-autre-phrase-7";

/**
 * Navigation dans l'application, sans rechargement : une session sans « Rester connecté » ne
 * survit pas à un rechargement (voulu), `page.goto` la fermerait.
 */
async function aller(page: Page, url: string, chemin: string) {
  const cible = new URL(url).pathname + chemin;
  await page.evaluate((p) => {
    history.pushState(null, "", p);
    dispatchEvent(new PopStateEvent("popstate"));
  }, cible);
  await expect(page).toHaveURL(new RegExp(chemin.replace(/[/]/g, "\\/") + "$"));
}

/** Code « envoyé » montré par la démo (aucun e-mail). */
async function codeAffiche(page: Page): Promise<string> {
  const b = page.locator("[data-demo-code] b");
  await expect(b).toHaveText(/^\d{6}$/);
  return (await b.textContent())!;
}

async function inscrire(page: Page, url: string) {
  await aller(page, url, "compte/inscription");
  await page.getByLabel("Adresse e-mail").fill(EMAIL);
  await page.getByLabel("Mot de passe", { exact: true }).fill(MDP);
  await page.getByLabel("Confirmer le mot de passe", { exact: true }).fill(MDP);
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page.locator("[data-demo-code]")).toContainText("aucun e-mail n'est envoyé");
  const code = await codeAffiche(page);
  await page.getByLabel("Code reçu par e-mail").fill(code);
  await page.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Compte créé." })).toBeVisible({ timeout: 30_000 });
}

async function connecter(page: Page, url: string, mdp: string) {
  await aller(page, url, "compte/connexion");
  await page.getByLabel("Adresse e-mail").fill(EMAIL);
  await page.getByLabel("Mot de passe", { exact: true }).fill(mdp);
  await page.getByRole("button", { name: "Se connecter" }).last().click();
}

async function deconnecter(page: Page, url: string) {
  await aller(page, url, "compte");
  await page.locator("main").getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("banner").getByRole("link", { name: "Se connecter" })).toBeVisible();
}

test.describe("compte de la démo", () => {
  // Ordinateur : « Se connecter » et « Mon compte » sont dans l'en-tête (téléphone : menu ☰).
  test.use({ locale: "fr-FR", viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });
  test.setTimeout(180_000);

  test("inscription avec le code affiché, déconnexion, mauvais mot de passe, connexion ; rien sur le réseau", async ({ page, demo }) => {
    await page.goto(demo.url);
    // « Se connecter » est un vrai lien dans la démo (compte essayable).
    await page.getByRole("banner").getByRole("link", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/compte\/connexion$/);
    await inscrire(page, demo.url);
    await expect(page.getByRole("banner").getByRole("link", { name: "Mon compte" })).toBeVisible();
    await deconnecter(page, demo.url);

    await connecter(page, demo.url, "mauvaise phrase de passe");
    await expect(page.getByText("Adresse ou mot de passe incorrect.")).toBeVisible({ timeout: 30_000 });
    await connecter(page, demo.url, MDP);
    await expect(page.getByRole("banner").getByRole("link", { name: "Mon compte" })).toBeVisible({ timeout: 30_000 });
    // Le mot de passe n'est jamais dans l'état gardé par l'onglet (seulement A_auth et des blocs chiffrés).
    const garde = await page.evaluate(() => sessionStorage.getItem("shh.demo.compte") ?? "");
    expect(garde).toContain("lea@exemple.fr"); // l'adresse, comme le vrai serveur la reçoit
    expect(garde).not.toContain(MDP);
    expect(garde).not.toContain("Léa"); // pseudo : seulement p_canon (« léa »)
  });

  test("mot de passe oublié : code affiché, nouveau mot de passe, connexion avec lui ; suppression du compte", async ({ page, demo }) => {
    await page.goto(demo.url);
    await inscrire(page, demo.url);
    await deconnecter(page, demo.url);

    await aller(page, demo.url, "compte/oubli");
    await page.getByLabel("Adresse e-mail exacte").fill(EMAIL);
    await page.locator("main form").getByRole("button").last().click();
    const code = await codeAffiche(page);
    await page.getByLabel("Code reçu par e-mail").fill(code);
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByLabel("Nouveau mot de passe").fill(MDP2);
    await page.getByRole("button", { name: "Changer le mot de passe" }).click();
    await expect(page.getByText(/Mot de passe changé/)).toBeVisible({ timeout: 30_000 });
    await deconnecter(page, demo.url);

    await connecter(page, demo.url, MDP);
    await expect(page.getByText("Adresse ou mot de passe incorrect.")).toBeVisible({ timeout: 30_000 });
    await connecter(page, demo.url, MDP2);
    await expect(page.getByRole("banner").getByRole("link", { name: "Mon compte" })).toBeVisible({ timeout: 30_000 });

    // Suppression.
    await aller(page, demo.url, "compte");
    await page.getByRole("button", { name: "Supprimer le compte" }).click();
    // Le mot de passe actuel est redemandé avant toute suppression (conception compte §12.5).
    await page.getByLabel("Mot de passe actuel").fill(MDP2);
    await page.getByRole("button", { name: "Supprimer définitivement" }).click();
    await page.getByRole("button", { name: "Supprimer", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Compte supprimé." })).toBeVisible({ timeout: 30_000 });
    await connecter(page, demo.url, MDP2);
    await expect(page.getByText("Adresse ou mot de passe incorrect.")).toBeVisible({ timeout: 30_000 });
  });
});
