// Liens sous « /s » et page d'ouverture séparée (décision du propriétaire du 16 novembre,
// docs/superpowers/specs/2026-11-16-liens-s-et-pages-design.md) : le lien rendu est « /s#… » ;
// la page /s ne charge pas le script de l'application d'envoi ; un ancien lien à la racine est
// remplacé par /s et le même fragment, sans entrée d'historique de plus ; la clé est retirée de
// l'adresse après lecture, comme avant.
import { expect, test } from "./fixtures";
import { file, freshPage, sendShare, unlock } from "./open-helpers";

test.use({ locale: "fr-FR" });

test("lien /s#… : ouverture dans la page /s, sans le script d'envoi ; ancien lien /#… : même partage, par /s", async ({ browser, shh }) => {
  test.setTimeout(120_000);
  const s = await freshPage(browser);
  const sent = await sendShare(s.page, shh.origin + "/", { text: "Bonjour", files: [file("contrat.pdf")], opens: 3 });
  await s.ctx.close();
  expect(sent.link).toMatch(new RegExp(`^${shh.origin}/s#[A-Za-z0-9_-]{43}$`));
  expect(sent.manage).toMatch(new RegExp(`^${shh.origin}/s#m[A-Za-z0-9_-]{43}$`));

  // Nouveau lien : servi par s.html, sans le script de l'application d'envoi (assets/index-*.js).
  const a = await freshPage(browser);
  const scripts: string[] = [];
  a.page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(new URL(r.url()).pathname);
  });
  await a.page.goto(sent.link);
  await expect(a.page.getByRole("button", { name: /^(Déverrouiller|Déchiffrement)/ })).toBeVisible({ timeout: 30_000 });
  const direct = await a.page.evaluate(() => history.length);
  await unlock(a.page, sent.password);
  expect(new URL(a.page.url()).pathname).toBe("/s");
  expect(new URL(a.page.url()).hash).toBe("");
  expect(scripts.some((p) => /\/assets\/s-[^/]+\.js$/.test(p))).toBe(true);
  expect(scripts.filter((p) => /\/assets\/index-[^/]+\.js$/.test(p))).toEqual([]);
  await a.ctx.close();

  // Ancien lien à la racine : la page part vers /s avec le même fragment, sans entrée de plus.
  const b = await freshPage(browser);
  const old = sent.link.replace("/s#", "/#");
  await b.page.goto(old);
  await expect(b.page.getByRole("button", { name: /^(Déverrouiller|Déchiffrement)/ })).toBeVisible({ timeout: 30_000 });
  expect(new URL(b.page.url()).pathname).toBe("/s");
  // Autant d'entrées qu'en ouvrant directement le lien /s : le remplacement n'en ajoute aucune.
  expect(await b.page.evaluate(() => history.length)).toBe(direct);
  await unlock(b.page, sent.password);
  expect(new URL(b.page.url()).hash).toBe("");
  await b.ctx.close();

  // Lien de gestion sous /s : écran de gestion, clé retirée de l'adresse.
  const c = await freshPage(browser);
  await c.page.goto(sent.manage);
  await expect(c.page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => new URL(c.page.url()).hash).toBe("");
  expect(new URL(c.page.url()).pathname).toBe("/s");
  await c.ctx.close();
});
