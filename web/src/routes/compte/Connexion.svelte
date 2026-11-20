<script lang="ts">
  // Connexion (/compte/connexion, et /compte ou /compte/profil sans session ; conception compte
  // §10.2, §12.2, §21.11 ; plan, lot 10). Page montée seulement si __COMPTES__ (App.svelte).
  // Adresse et mot de passe → Argon2id sur l'appareil → connexion (account/session.svelte.ts) ;
  // double authentification : code de l'application. Après 5 échecs dans l'heure, le serveur
  // demande une preuve anti-robot : elle est calculée et la même demande repart une fois.
  // Compte banni : la connexion reste permise (exporter, supprimer), avec la date et le motif.
  import { tick } from "svelte";
  import { account, etatCompte, seConnecter, seDeconnecter, validerTotp, verifierSaisie } from "../../account/session.svelte";
  import { followLink, href, navigate, suite } from "../../app/router.svelte";
  import { t } from "../../i18n/i18n.svelte";
  import { announce } from "../../ui/announce";
  import Banner from "../../ui/Banner.svelte";
  import Button from "../../ui/Button.svelte";
  import CodeField from "../../ui/CodeField.svelte";
  import TextField from "../../ui/TextField.svelte";
  import Cadre from "./Cadre.svelte";
  import Case from "./Case.svelte";
  import { codeDe, erreur, jourLong, type Champ } from "./erreurs";
  import MotDePasse from "./MotDePasse.svelte";
  import { obtenirPreuve } from "./preuve";

  // Seul paramètre lu dans l'adresse : « ?suite=salon » (suite(), router.svelte.ts).
  const apres = suite(location.search);

  let vue = $state<"form" | "totp" | "connecte">(account.etat === "ouvert" ? "connecte" : "form");
  let email = $state("");
  let mdp = $state("");
  let rester = $state(false);
  let totp = $state("");
  let errs = $state<Partial<Record<Champ, string>>>({});
  let bandeau = $state<{ kind: "info" | "danger"; texte: string } | null>(null);
  let banni = $state<{ date: string; motif: number | null } | null>(null);
  let envoi = $state(false);
  const els: Partial<Record<Champ, HTMLInputElement | undefined>> = $state({});

  // « Rester connecté » : la session gardée est rouverte au démarrage (App.svelte, restaurer()),
  // parfois après le montage de cette page.
  $effect(() => {
    if (account.etat === "ouvert" && vue === "form" && !envoi) vue = "connecte";
  });

  const versInscription = apres === "salon" ? "/compte/inscription?suite=salon" : "/compte/inscription";
  const MOTIFS = ["report.cat.1", "report.cat.2", "report.cat.3", "report.cat.4", "report.cat.5", "report.cat.6", "report.cat.7", "report.cat.8", "report.cat.9", "report.cat.10"] as const;

  function montrer(e: unknown, moment: "connexion" | "totp") {
    const x = erreur(e, moment);
    if (x.champ && (x.champ === "email" || x.champ === "totp")) {
      errs = { [x.champ]: x.texte };
      void tick().then(() => els[x.champ!]?.focus());
    } else {
      bandeau = { kind: "danger", texte: x.texte };
      if (moment === "totp" && codeDe(e) === "not_found") vue = "form"; // étape échue : on recommence
    }
  }

  async function ouvert() {
    mdp = "";
    totp = "";
    banni = null;
    try {
      const e = await etatCompte();
      if (e.banniJusqu) banni = { date: e.banniJusqu, motif: e.banniMotif };
    } catch {
      // état indisponible (réseau) : la session est ouverte, rien d'autre à dire ici
    }
    vue = "connecte";
    announce(t("account.connected"));
  }

  async function connecter() {
    bandeau = null;
    errs = {};
    const r = await verifierSaisie({ email });
    if (r.email) {
      errs = { email: erreur(new Error(r.email), "connexion").texte };
      await tick();
      return els.email?.focus();
    }
    envoi = true;
    try {
      let res: "ouvert" | "totp";
      try {
        res = await seConnecter(email, mdp, rester, undefined);
      } catch (e) {
        if (codeDe(e) !== "preuve_requise") throw e;
        res = await seConnecter(email, mdp, rester, await obtenirPreuve());
      }
      if (res === "totp") {
        vue = "totp";
        await tick();
        els.totp?.focus();
      } else await ouvert();
    } catch (e) {
      montrer(e, "connexion");
    } finally {
      envoi = false;
    }
  }

  async function valider() {
    bandeau = null;
    errs = {};
    if (totp.length !== 6) {
      errs = { totp: t("account.err.code6") };
      return els.totp?.focus();
    }
    envoi = true;
    try {
      await validerTotp(totp);
      await ouvert();
    } catch (e) {
      montrer(e, "totp");
    } finally {
      envoi = false;
    }
  }

  async function deconnecter() {
    await seDeconnecter();
    banni = null;
    vue = "form";
    bandeau = { kind: "info", texte: t("account.loggedOut") };
  }
</script>

<Cadre titre={t("account.login.title")}>
  {#if bandeau}<Banner kind={bandeau.kind}>{bandeau.texte}</Banner>{/if}
  {#if account.erreur === "coffre_illisible" && bandeau?.texte !== t("account.err.coffre")}<Banner kind="danger">{t("account.err.coffre")}</Banner>{/if}

  {#if vue === "connecte"}
    <p class="note" data-connecte>{t("account.connected")}</p>
    {#if banni}
      <Banner kind="warn">{t("account.banned", { date: jourLong(banni.date), motif: t(MOTIFS[(banni.motif ?? 10) - 1] ?? "report.cat.10") })}</Banner>
    {/if}
    <div class="actions">
      <Button onpress={() => navigate(apres === "salon" && __SALONS__ ? "/salon/nouveau" : "/")}>{t("account.continue")}</Button>
      <Button variant="secondary" onpress={deconnecter}>{t("account.logout")}</Button>
    </div>
  {:else if vue === "form"}
    <form novalidate onsubmit={(e) => e.preventDefault()}>
      <TextField label={t("account.email")} type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" error={errs.email} bind:value={email} bind:el={els.email} oninput={() => (errs.email = undefined)} />
      <MotDePasse label={t("account.password")} autocomplete="current-password" bind:value={mdp} />
      <Case label={t("account.stay")} bind:checked={rester} />
      <Button type="submit" onpress={connecter}>{envoi ? t("account.verifying") : t("account.login.submit")}</Button>
    </form>
    <!-- « Créer un compte » à droite (propriétaire, 20 novembre). -->
    <ul class="liens split">
      <li><a href={href("/compte/oubli")} onclick={(e) => followLink(e, "/compte/oubli")}>{t("account.login.forgot")}</a></li>
      <li><a href={href(versInscription)} onclick={(e) => followLink(e, versInscription)} data-create>{t("account.login.create")}</a></li>
    </ul>
  {:else}
    <form novalidate onsubmit={(e) => e.preventDefault()}>
      <CodeField label={t("account.totp")} error={errs.totp} bind:value={totp} bind:el={els.totp} onvalue={() => (errs.totp = undefined)} />
      <Button type="submit" onpress={valider}>{envoi ? t("account.verifying") : t("account.totp.submit")}</Button>
    </form>
    <ul class="liens">
      <li><a href={href("/compte/oubli")} onclick={(e) => followLink(e, "/compte/oubli")}>{t("account.totp.lost")}</a></li>
    </ul>
  {/if}
</Cadre>
