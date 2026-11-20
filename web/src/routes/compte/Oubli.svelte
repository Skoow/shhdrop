<script lang="ts">
  // Mot de passe oublié (/compte/oubli ; conception compte §21.2.3, §21.2.4, §21.15.6 ; plan,
  // lot 10). Page montée seulement si __COMPTES__ (App.svelte).
  // 1. Adresse EXACTE du compte (§5.1 : l'e-mail ne part qu'à elle) → oubli/debut, même réponse
  //    pour toute adresse.
  // 2. Code reçu ; double authentification active : code de l'application, ou « Je n'ai plus mon
  //    application » → retrait dans 7 jours (texte d'attente), rien d'autre ne change.
  // 3. Ce qui est gardé et perdu est dit AVANT de valider ; nouveau mot de passe → nouveau
  //    clé de compte et coffre privé vide sur l'appareil ; profil rendu par le séquestre ; toutes les
  //    autres sessions fermées ; 7 jours sans changement d'adresse ni suppression (dit à la fin).
  import { tick } from "svelte";
  import { etatCompte, oubli, verifierSaisie } from "../../account/session.svelte";
  import { followLink, href, navigate } from "../../app/router.svelte";
  import { getLang, t } from "../../i18n/i18n.svelte";
  import { announce } from "../../ui/announce";
  import Banner from "../../ui/Banner.svelte";
  import Button from "../../ui/Button.svelte";
  import CodeField from "../../ui/CodeField.svelte";
  import TextField from "../../ui/TextField.svelte";
  import Cadre from "./Cadre.svelte";
  import { codeDe, erreur, jourLong, type Champ } from "./erreurs";
  import MotDePasse from "./MotDePasse.svelte";
  import { obtenirPreuve, preparerPreuve } from "./preuve";
  import Renvoi from "./Renvoi.svelte";
  import DemoCode from "./DemoCode.svelte";
  import ReglesMdp from "./ReglesMdp.svelte";
  import { mdpFort } from "./verifs";

  let etape = $state<"adresse" | "code" | "attente" | "mdp" | "fini">("adresse");
  let email = $state("");
  let code = $state("");
  let totp = $state("");
  let totpDemande = $state(false);
  let mdp = $state("");
  let attente = $state("");
  let recup = $state<string | null>(null);
  let errs = $state<Partial<Record<Champ, string>>>({});
  let bandeau = $state<string | null>(null);
  let envoi = $state(false);
  const els: Partial<Record<Champ, HTMLInputElement | undefined>> = $state({});

  async function focus(c: Champ) {
    await tick();
    els[c]?.focus();
  }
  function montrer(e: unknown) {
    const x = erreur(e, "oubli");
    if (x.champ) {
      errs = { [x.champ]: x.texte };
      void focus(x.champ);
    } else bandeau = x.texte;
    if (codeDe(e) === "not_found" && etape === "mdp") etape = "adresse"; // étape échue : on recommence
  }

  async function recevoir() {
    bandeau = null;
    errs = {};
    const r = await verifierSaisie({ email });
    if (r.email) {
      errs = { email: erreur(new Error(r.email), "oubli").texte };
      return focus("email");
    }
    try {
      await oubli.debut(email, getLang(), await obtenirPreuve());
    } catch (e) {
      return montrer(e);
    }
    code = totp = "";
    totpDemande = false;
    etape = "code";
    announce(t("account.forgot.sent"));
    void focus("code");
  }

  async function verifier(perdu: boolean) {
    bandeau = null;
    errs = {};
    if (code.length !== 6) {
      errs = { code: t("account.err.code6") };
      return focus("code");
    }
    if (totpDemande && !perdu && totp.length !== 6) {
      errs = { totp: t("account.err.code6") };
      return focus("totp");
    }
    envoi = !perdu;
    try {
      const r = await oubli.verifier(code, totpDemande && !perdu ? totp : "", perdu);
      if (r === "ok") {
        etape = "mdp";
        void focus("mdp");
      } else {
        attente = r.attenteJusqu;
        etape = "attente";
        announce(t("account.forgot.attente", { date: jourLong(attente) }));
      }
    } catch (e) {
      if (codeDe(e) === "totp_requis") {
        totpDemande = true;
        announce(t("account.forgot.totpNeeded"));
        return focus("totp");
      }
      montrer(e);
    } finally {
      envoi = false;
    }
  }

  async function changer() {
    bandeau = null;
    errs = {};
    const r = await verifierSaisie({ email, mdp });
    if (r.mdp || !mdpFort(mdp, email)) {
      errs = { mdp: r.mdp ? erreur(new Error(r.mdp), "oubli").texte : t("account.mdp.faible") };
      return focus("mdp");
    }
    envoi = true;
    try {
      await oubli.fin(mdp, false);
    } catch (e) {
      return montrer(e);
    } finally {
      envoi = false;
    }
    mdp = "";
    try {
      recup = (await etatCompte()).recupJusqu;
    } catch {
      recup = null;
    }
    etape = "fini";
    announce(t("account.forgot.done"));
  }
</script>

<Cadre titre={t("account.forgot.title")} sous={etape === "adresse" ? t("account.forgot.sub") : undefined}>
  {#if bandeau}<Banner kind="danger">{bandeau}</Banner>{/if}

  {#if etape === "adresse"}
    <form novalidate onsubmit={(e) => e.preventDefault()} oninput={preparerPreuve}>
      <TextField label={t("account.forgot.email")} type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" hint={t("account.forgot.email.hint")} error={errs.email} bind:value={email} bind:el={els.email} oninput={() => (errs.email = undefined)} />
      <Button type="submit" onpress={recevoir}>{t("account.signup.send")}</Button>
    </form>
  {:else if etape === "code"}
    <p class="note">{t("account.forgot.sent")}</p>
    <form novalidate onsubmit={(e) => e.preventDefault()}>
      <DemoCode />
      <CodeField label={t("account.code")} error={errs.code} bind:value={code} bind:el={els.code} onvalue={() => (errs.code = undefined)} />
      {#if totpDemande}
        <p class="note">{t("account.forgot.totpNeeded")}</p>
        <CodeField label={t("account.totp")} error={errs.totp} bind:value={totp} bind:el={els.totp} onvalue={() => (errs.totp = undefined)} />
      {/if}
      <Button type="submit" onpress={() => verifier(false)}>{envoi ? t("account.verifying") : t("account.forgot.verify")}</Button>
    </form>
    <div class="actions">
      {#if totpDemande}<Button variant="ghost" onpress={() => verifier(true)}>{t("account.totp.lost")}</Button>{/if}
      <Renvoi onerreur={montrer} />
    </div>
  {:else if etape === "attente"}
    <Banner kind="warn">{t("account.forgot.attente", { date: jourLong(attente) })}</Banner>
    <ul class="liens">
      <li><a href={href("/compte/connexion")} onclick={(e) => followLink(e, "/compte/connexion")}>{t("account.forgot.back")}</a></li>
    </ul>
  {:else if etape === "mdp"}
    <form novalidate onsubmit={(e) => e.preventDefault()}>
      <Banner kind="info">{t("account.forgot.keep")}</Banner>
      <MotDePasse label={t("account.password.new")} autocomplete="new-password" error={errs.mdp} bind:value={mdp} bind:el={els.mdp} oninput={() => (errs.mdp = undefined)} />
      <ReglesMdp {mdp} adresse={email} />
      <Button type="submit" onpress={changer}>{envoi ? t("account.verifying") : t("account.forgot.submit")}</Button>
    </form>
  {:else}
    <p class="note" data-fini>{t("account.forgot.done")}</p>
    {#if recup}<Banner kind="info">{t("account.forgot.recup", { date: jourLong(recup) })}</Banner>{/if}
    <div class="actions">
      <Button onpress={() => navigate("/")}>{t("account.continue")}</Button>
    </div>
  {/if}
</Cadre>
