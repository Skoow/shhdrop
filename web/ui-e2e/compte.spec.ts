// Compte par e-mail de bout en bout, PAR L'INTERFACE (conception du compte §10, §12, §21.15 ;
// avant l'ouverture publique, décision D8). Vrai binaire Go avec SHH_COMPTES=1 (et SHH_SALONS=1),
// clé K_serveur tirée au hasard dans un fichier 0400 hors du dossier de données, faux SMTP en
// mémoire sur la boucle locale (e2e/smtp.ts : aucune adresse réelle ne reçoit rien) ; site
// construit avec SHH_SITE_COMPTES=1 (web/dist-comptes, comptes-site.ts, vérifié par
// check-dist.mjs --comptes). Chaque test a son serveur et sa boîte neufs.
// Couvert : inscription complète (adresse, code reçu par e-mail, mot de passe, pseudo),
// déconnexion, connexion, mauvais mot de passe, session gardée au rechargement (« Rester
// connecté ») ou non, deux onglets, mot de passe oublié, changement de mot de passe, double
// authentification (codes calculés ici, RFC 6238, e2e/totp.ts), suppression du compte, et « le
// serveur ne voit rien » du compte vu du navigateur (dossier de données, -wal et -shm compris).
// Navigateurs : Chromium (ordinateur et téléphone). WebKit écarté pour l'instant : voir la fin du fichier.
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { findIn, listFiles, needle, scanDir, type Needle } from "../e2e/scan";
import { codeDuCourriel, demarrerSMTP, type FauxSMTP } from "../e2e/smtp";
import { codeTotp, horlogeTotp } from "../e2e/totp";
import { siteComptes } from "./comptes-site";
import { expect, test as base } from "./fixtures";

const FROM = "Shhgone <ne-pas-repondre@shhgone.test>";
const SMTP_MDP = "SmtpUiSecretVq4nRw";
const INCORRECT = "Adresse ou mot de passe incorrect.";

type Compte = { email: string; mdp: string; pseudo: string };
/** Un compte repère par test : adresse, mot de passe et pseudo distincts (rien de réel). */
function compte(tag: string): Compte {
  const r = randomBytes(4).toString("hex");
  return { email: `Ui.${tag}${r}@exemple.org`, mdp: `MdpRepereUi-${tag}-${r}`, pseudo: `Zoé${tag}${r.slice(0, 4)}` };
}

/** Boîte de réception du faux SMTP : chaque code attendu est le message suivant, pour la bonne adresse. */
type Boite = { code(a: string): Promise<string>; smtp: FauxSMTP };

const test = base.extend<{ boite: Boite }, { site: string }>({
  site: [async ({}, use) => use(await siteComptes()), { scope: "worker", timeout: 360_000 }],
  boite: async ({}, use) => {
    const smtp = await demarrerSMTP();
    let n = 0;
    try {
      await use({
        smtp,
        async code(a) {
          const m = codeDuCourriel(await smtp.attendre(++n));
          // Adresse « exacte » du serveur : celle tapée, en minuscules (conception du compte §5.1).
          expect(m.a, "destinataire du code").toEqual([a.toLowerCase()]);
          return m.code;
        },
      });
    } finally {
      await smtp.fermer();
    }
  },
  shhServer: async ({ boite, site }, use) =>
    use({ comptes: { cle: new Uint8Array(randomBytes(32)), smtpPort: boite.smtp.port, smtpMdp: SMTP_MDP, from: FROM }, env: { SHH_STATIC_DIR: site } }),
});

test.use({ locale: "fr-FR", timezoneId: "Europe/Paris" });
// WebKit : voir la fin du fichier.
test.skip(({ browserName }) => browserName !== "chromium", "compte.spec.ts : Chromium seulement (voir la fin du fichier)");

// --- Parcours de l'interface -------------------------------------------------------------------

/** Champ de saisie par son étiquette (une section des paramètres porte parfois le même nom). */
const champ = (page: Page, label: string) => page.getByLabel(label, { exact: true }).and(page.locator("input"));
const bouton = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const titre = (page: Page, name: string) => page.getByRole("heading", { level: 1, name, exact: true });
/** Message d'état d'une section des paramètres (et non sa copie dans la région annoncée du site). */
const statut = (page: Page, section: string) => page.getByRole("region", { name: section, exact: true }).getByRole("status");

/**
 * Inscription complète par la page : adresse, mot de passe et confirmation, code reçu ; le pseudo
 * provisoire attribué (20 novembre) est lu et gardé dans c.pseudo.
 */
async function inscrire(page: Page, origin: string, boite: Boite, c: Compte): Promise<void> {
  await page.goto(origin + "/compte/inscription");
  await expect(titre(page, "Créer un compte")).toBeVisible();
  await champ(page, "Adresse e-mail").fill(c.email);
  await champ(page, "Mot de passe").fill(c.mdp);
  await champ(page, "Confirmer le mot de passe").fill(c.mdp);
  await bouton(page, "Créer").click(); // preuve anti-robot calculée dans la page
  const code = await boite.code(c.email);
  await champ(page, "Code reçu par e-mail").fill(code);
  await bouton(page, "Valider").click(); // Argon2id et coffres sur l'appareil
  await expect(titre(page, "Compte créé.")).toBeVisible({ timeout: 30_000 });
  c.pseudo = /«\s*(\S+)\s*»/u.exec((await page.locator("[data-pseudo-temp]").textContent()) ?? "")![1]!;
}

/** Connexion depuis la page de connexion ouverte ; rend la vue atteinte. */
async function remplirConnexion(page: Page, email: string, mdp: string, rester = false): Promise<void> {
  await expect(titre(page, "Se connecter")).toBeVisible();
  await champ(page, "Adresse e-mail").fill(email);
  await champ(page, "Mot de passe").fill(mdp);
  if (rester) await page.getByLabel("Rester connecté sur cet appareil").check();
  await bouton(page, "Se connecter").click();
}
const connecte = (page: Page) => page.locator("[data-connecte]");

async function connecter(page: Page, email: string, mdp: string, rester = false): Promise<void> {
  await remplirConnexion(page, email, mdp, rester);
  await expect(connecte(page)).toHaveText("Vous êtes connecté sur cet appareil.", { timeout: 30_000 });
}

/** Paramètres par la navigation du site (menu du téléphone, ou « Mon compte » puis « Paramètres »). */
async function parametres(page: Page): Promise<void> {
  const menu = page.getByRole("button", { name: "Ouvrir le menu" });
  if (await menu.isVisible()) {
    await menu.click();
    await page.locator("[data-menu]").getByRole("link", { name: "Paramètres", exact: true }).click();
  } else {
    await page.getByRole("link", { name: "Mon compte", exact: true }).filter({ visible: true }).first().click();
    await bouton(page, "Paramètres").click();
  }
  await expect(titre(page, "Paramètres")).toBeVisible();
}

/** « Se déconnecter » des paramètres : retour à la connexion. */
async function deconnecterDepuisParametres(page: Page): Promise<void> {
  await bouton(page, "Se déconnecter").click();
  await expect(titre(page, "Se connecter")).toBeVisible();
  await expect(champ(page, "Adresse e-mail")).toBeVisible();
}

/** Après « Compte créé. » ou une connexion : « Continuer » mène à l'accueil connecté. */
async function continuer(page: Page): Promise<void> {
  await bouton(page, "Continuer").click();
  await expect(page).toHaveURL(/\/$/);
}

/** Changement du mot de passe dans les paramètres ouverts. */
async function changerMdp(page: Page, actuel: string, nouveau: string, totp?: string): Promise<void> {
  await page.getByRole("button", { name: "Changer le mot de passe" }).click();
  await champ(page, "Mot de passe actuel").fill(actuel);
  if (totp !== undefined) await champ(page, "Code de votre application d'authentification").fill(totp);
  await champ(page, "Nouveau mot de passe").fill(nouveau);
  await bouton(page, "Enregistrer le mot de passe").click();
  await expect(statut(page, "Mot de passe")).toHaveText("Mot de passe changé. Vos autres appareils ont été déconnectés.", { timeout: 30_000 });
}

/** Activation de la double authentification dans les paramètres ouverts ; rend la clé lue à l'écran. */
async function activerTotp(page: Page, mdp: string, prochain: (s: string) => Promise<string>): Promise<string> {
  await page.getByRole("switch", { name: "Double authentification" }).click();
  // Session plus « récente » : le mot de passe est redemandé avant l'activation.
  const actuel = champ(page, "Mot de passe actuel");
  const cle = page.locator(".totp .v");
  await expect(actuel.or(cle)).toBeVisible();
  if (await actuel.isVisible()) {
    await actuel.fill(mdp);
    await bouton(page, "Continuer").click();
  }
  await expect(cle).toBeVisible({ timeout: 30_000 });
  const secret = (await cle.innerText()).replace(/\s+/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await champ(page, "Premier code de l'application").fill(await prochain(secret));
  await bouton(page, "Activer").click();
  await expect(statut(page, "Double authentification")).toHaveText("Double authentification activée.");
  await expect(page.getByRole("switch", { name: "Double authentification" })).toHaveAttribute("aria-checked", "true");
  return secret;
}

// --- Tests ------------------------------------------------------------------------------------

test("TOTP du test : vecteur de RFC 6238 (annexe B, SHA-1, T = 59 s)", () => {
  // Clé ASCII « 12345678901234567890 » ; 94287082 sur 8 chiffres, donc 287082 sur 6.
  expect(codeTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", Math.floor(59 / 30))).toBe("287082");
});

test("inscription complète, déconnexion, mauvais mot de passe, connexion ; session oubliée au rechargement sans « Rester connecté »", async ({ page, shh, boite }) => {
  test.setTimeout(180_000);
  const c = compte("Ins");
  await inscrire(page, shh.origin, boite, c);
  await continuer(page);
  // Accueil connecté : le pseudo est celui choisi (profil déchiffré sur l'appareil).
  await parametres(page);
  await expect(page.getByText(c.pseudo, { exact: true })).toBeVisible();
  await deconnecterDepuisParametres(page);

  await remplirConnexion(page, c.email, c.mdp + "x");
  await expect(page.getByText(INCORRECT, { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(connecte(page)).toHaveCount(0);

  await connecter(page, c.email, c.mdp);
  await page.reload();
  await expect(titre(page, "Se connecter")).toBeVisible();
  await expect(champ(page, "Adresse e-mail")).toBeVisible();
  await expect(connecte(page)).toHaveCount(0);
});

test("« Rester connecté » : session rouverte au rechargement ; deux onglets, déconnexion dans l'un, l'autre oublie le compte", async ({ page, shh, boite, context }) => {
  test.setTimeout(180_000);
  const c = compte("Onglets");
  await inscrire(page, shh.origin, boite, c);
  await continuer(page);
  await parametres(page);
  await deconnecterDepuisParametres(page);
  await connecter(page, c.email, c.mdp, true);

  await page.reload();
  await expect(connecte(page)).toBeVisible({ timeout: 30_000 });

  const autre = await context.newPage();
  try {
    await autre.goto(shh.origin + "/compte");
    await expect(titre(autre, "Paramètres")).toBeVisible({ timeout: 30_000 });
    await expect(autre.getByText(c.pseudo, { exact: true })).toBeVisible();

    await bouton(page, "Se déconnecter").click();
    await expect(page.getByText("Vous êtes déconnecté.", { exact: true })).toBeVisible();
    // L'autre onglet oublie le compte sans recharger (signal du BroadcastChannel) ...
    await expect(titre(autre, "Se connecter")).toBeVisible();
    await expect(autre.getByText(c.pseudo, { exact: true })).toHaveCount(0);
    // ... et ne le rouvre pas au rechargement (session gardée effacée de l'appareil).
    await autre.reload();
    await expect(titre(autre, "Se connecter")).toBeVisible();
    await expect(champ(autre, "Adresse e-mail")).toBeVisible();
  } finally {
    await autre.close();
  }
  await page.reload();
  await expect(champ(page, "Adresse e-mail")).toBeVisible();
  await expect(connecte(page)).toHaveCount(0);
});

test("mot de passe oublié : code par e-mail, nouveau mot de passe, l'ancien refusé, connexion avec le nouveau", async ({ page, shh, boite }) => {
  test.setTimeout(180_000);
  const c = compte("Oubli");
  const nouveau = c.mdp + "-Neuf";
  await inscrire(page, shh.origin, boite, c);
  await continuer(page);
  await parametres(page);
  await deconnecterDepuisParametres(page);

  await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
  await expect(titre(page, "Mot de passe oublié")).toBeVisible();
  await champ(page, "Adresse e-mail exacte").fill(c.email);
  await bouton(page, "Recevoir un code").click();
  await champ(page, "Code reçu par e-mail").fill(await boite.code(c.email));
  await bouton(page, "Continuer").click();
  await champ(page, "Nouveau mot de passe").fill(nouveau);
  await bouton(page, "Changer le mot de passe").click();
  await expect(page.locator("[data-fini]")).toHaveText("Mot de passe changé. Vos autres appareils ont été déconnectés.", { timeout: 30_000 });

  await continuer(page);
  await parametres(page);
  await expect(page.getByText(c.pseudo, { exact: true })).toBeVisible(); // profil rendu par le séquestre
  await deconnecterDepuisParametres(page);
  await remplirConnexion(page, c.email, c.mdp);
  await expect(page.getByText(INCORRECT, { exact: true })).toBeVisible({ timeout: 30_000 });
  await champ(page, "Mot de passe").fill(nouveau);
  await bouton(page, "Se connecter").click();
  await expect(connecte(page)).toBeVisible({ timeout: 30_000 });
});

test("changement du mot de passe dans les paramètres : l'ancien refusé, le nouveau accepté", async ({ page, shh, boite }) => {
  test.setTimeout(180_000);
  const c = compte("Mdp");
  const nouveau = c.mdp + "-Change";
  await inscrire(page, shh.origin, boite, c);
  await continuer(page);
  await parametres(page);
  await changerMdp(page, c.mdp, nouveau);
  await deconnecterDepuisParametres(page);
  await remplirConnexion(page, c.email, c.mdp);
  await expect(page.getByText(INCORRECT, { exact: true })).toBeVisible({ timeout: 30_000 });
  await champ(page, "Mot de passe").fill(nouveau);
  await bouton(page, "Se connecter").click();
  await expect(connecte(page)).toBeVisible({ timeout: 30_000 });
});

test("double authentification : activation avec un code calculé, puis connexion qui la demande (code faux refusé)", async ({ page, shh, boite }) => {
  test.setTimeout(180_000);
  const c = compte("Totp");
  const prochain = horlogeTotp();
  await inscrire(page, shh.origin, boite, c);
  await continuer(page);
  await parametres(page);
  const secret = await activerTotp(page, c.mdp, prochain);
  await deconnecterDepuisParametres(page);

  await remplirConnexion(page, c.email, c.mdp);
  const code = champ(page, "Code de votre application d'authentification");
  await expect(code).toBeVisible({ timeout: 30_000 });
  await expect(connecte(page)).toHaveCount(0);
  // Un code faux : différent de tous ceux que le serveur accepterait (pas courant ± 1).
  const pas = Math.floor(Date.now() / 30_000);
  const valides = new Set([-1, 0, 1, 2].map((d) => codeTotp(secret, pas + d)));
  let faux = "000000";
  while (valides.has(faux)) faux = String(Number(faux) + 1).padStart(6, "0");
  await code.fill(faux);
  await bouton(page, "Valider").click();
  await expect(page.getByText("Code incorrect.", { exact: true })).toBeVisible();
  await expect(connecte(page)).toHaveCount(0);
  await code.fill(await prochain(secret));
  await bouton(page, "Valider").click();
  await expect(connecte(page)).toBeVisible({ timeout: 30_000 });
});

test("suppression du compte : confirmée par le mot de passe, puis connexion impossible et aucune ligne de compte sur le serveur", async ({ page, shh, boite }) => {
  test.setTimeout(180_000);
  const c = compte("Suppr");
  await inscrire(page, shh.origin, boite, c);
  await continuer(page);
  await parametres(page);
  await bouton(page, "Supprimer le compte").click();
  await expect(titre(page, "Supprimer le compte")).toBeVisible();
  await champ(page, "Mot de passe actuel").fill(c.mdp);
  await bouton(page, "Supprimer définitivement").click();
  await bouton(page, "Supprimer").click(); // confirmation sur place (ordinateur) ou feuille (téléphone)
  await expect(titre(page, "Compte supprimé.")).toBeVisible({ timeout: 30_000 });
  expect(await comptesEnBase(shh.server.dataDir)).toBe(0);

  await page.goto(shh.origin + "/compte/connexion");
  await remplirConnexion(page, c.email, c.mdp);
  await expect(page.getByText(INCORRECT, { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(connecte(page)).toHaveCount(0);
});

/** Nombre de lignes de la table des comptes (lecture seule, base ouverte par le serveur en WAL). */
async function comptesEnBase(dataDir: string): Promise<number> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(join(dataDir, "comptes.db"), { readOnly: true });
  try {
    return (db.prepare("SELECT count(*) AS n FROM comptes").get() as { n: number }).n;
  } finally {
    db.close();
  }
}

// --- Le serveur ne voit rien (compte, vu du navigateur) — BLOQUE TOUTE MISE EN LIGNE -----------

/** Fenêtres de 8 caractères d'un repère : une partie reconnaissable suffit à le trahir. */
const fenetres = (label: string, s: string) => Array.from({ length: s.length - 7 }, (_, i) => needle(`${label}[${i}]`, s.slice(i, i + 8)));

test("le serveur ne voit rien : ni adresse, ni mot de passe, ni pseudo en clair dans son dossier de données ni dans ses journaux", async ({ page, shh, boite }) => {
  test.setTimeout(240_000);
  // Repères sans sous-chaîne commune avec un texte ordinaire (aucun faux positif sur 8 caractères).
  const email = "Ui.ReperMailWq7z+Tag@Exemple.org";
  const mdp = "MdpRepereUiKx4vTq";
  const nouveau = "MdpRepereNeufHm3sPj";
  const pseudo = "ZoéRepèreUiBn5";
  const prochain = horlogeTotp();
  const c: Compte = { email, mdp, pseudo };

  await inscrire(page, shh.origin, boite, c);
  await continuer(page);
  await parametres(page);
  await deconnecterDepuisParametres(page);
  await connecter(page, email, mdp, true);
  await continuer(page);
  await parametres(page);
  // Rechargé avec « Rester connecté » : l'adresse n'est pas gardée sur l'appareil, l'écran la redemande.
  await page.reload();
  await expect(titre(page, "Paramètres")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Changer le mot de passe" }).click();
  await champ(page, "Adresse e-mail").fill(email);
  await champ(page, "Mot de passe actuel").fill(mdp);
  await champ(page, "Nouveau mot de passe").fill(nouveau);
  await bouton(page, "Enregistrer le mot de passe").click();
  await expect(statut(page, "Mot de passe")).toHaveText("Mot de passe changé. Vos autres appareils ont été déconnectés.", { timeout: 30_000 });
  const secret = await activerTotp(page, nouveau, prochain);
  await deconnecterDepuisParametres(page);
  await remplirConnexion(page, email, nouveau);
  await champ(page, "Code de votre application d'authentification").fill(await prochain(secret));
  await bouton(page, "Valider").click();
  await expect(connecte(page)).toBeVisible({ timeout: 30_000 });

  const reperes: Needle[] = [
    needle("adresse", email),
    needle("adresse (minuscules)", email.toLowerCase()),
    needle("adresse sans « +Tag »", "ui.repermailwq7z@exemple.org"),
    ...fenetres("adresse", email.toLowerCase()),
    needle("mot de passe", mdp),
    ...fenetres("mot de passe", mdp),
    needle("nouveau mot de passe", nouveau),
    ...fenetres("nouveau mot de passe", nouveau),
    needle("pseudo", pseudo),
    needle("pseudo (minuscules)", pseudo.toLowerCase()),
    ...fenetres("pseudo", pseudo),
    needle("pseudo NFD", pseudo.normalize("NFD")),
    needle("secret TOTP (base32)", secret),
  ];
  const dir = shh.server.dataDir;
  const fouiller = () => {
    const fichiers = listFiles(dir);
    // Témoins : la base du compte existe et la fouille y voit bien un texte connu.
    expect(fichiers.some((f) => f.endsWith("comptes.db"))).toBe(true);
    expect(scanDir(dir, [needle("en-tête SQLite", "SQLite format 3")]).some((h) => h.includes("comptes.db"))).toBe(true);
    return { fichiers, trouves: scanDir(dir, reperes) };
  };

  // Serveur en marche : comptes.db, ses -wal et -shm (rien n'est encore reporté dans la base).
  const vivant = fouiller();
  expect(vivant.fichiers.some((f) => f.endsWith("comptes.db-wal")), `fichiers : ${vivant.fichiers.join(", ")}`).toBe(true);
  expect(vivant.trouves).toEqual([]);
  // Serveur arrêté : journal reporté dans la base, fichiers finaux.
  await shh.server.stop();
  const arrete = fouiller();
  expect(arrete.trouves).toEqual([]);
  // Journaux du serveur (stdout, stderr) : rien non plus. Témoin : la ligne d'écoute.
  expect(findIn(shh.server.stdout(), [needle("témoin", "SHH_LISTENING")])).toEqual(["témoin"]);
  expect(findIn(shh.server.stdout(), reperes)).toEqual([]);
  expect(findIn(shh.server.stderr(), reperes)).toEqual([]);
  expect(existsSync(dir)).toBe(true);
});

// WebKit écarté (compte.spec.ts seulement) : ce poste n'a pas WebKit, ces tests n'y ont donc
// jamais tourné ; les activer sans les avoir vus verts risquerait de rendre rouge le job « ui »
// de la CI pour une cause inconnue. À activer (retirer le test.skip) après un passage vert dans
// la CI ; coût mesuré sous Chromium : 5 à 16 s par test.
