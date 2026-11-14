<script lang="ts">
  // Adresse e-mail (conception compte §21.3, §21.15.4 point 2, R21 ; plan, lot 13 ; monté seulement
  // avec __COMPTES__). L'adresse n'est jamais affichée : le serveur ne la garde pas en clair.
  // 1. Adresse actuelle exacte, nouvelle adresse, mot de passe (et code de l'application) : la
  //    session devient « récente », puis le code part à la NOUVELLE adresse seulement (aucun avis
  //    à l'ancienne, qui dirait « vous avez un compte »).
  // 2. Code reçu (et un nouveau code de l'application) : A_auth et l'enveloppe sont refaits avec le
  //    sel de la nouvelle adresse (account/session.svelte.ts). Le mot de passe reste dans la page
  //    le temps du changement, puis est vidé.
  // Pendant les 7 jours qui suivent une récupération par e-mail : bouton désactivé, raison dite (R4).
  import { tick } from "svelte";
  import { changementAdresse, confirmerIdentite, verifierSaisie, type EtatServeur } from "../../../account/session.svelte";
  import { getLang, t } from "../../../i18n/i18n.svelte";
  import { announce } from "../../../ui/announce";
  import Button from "../../../ui/Button.svelte";
  import CodeField from "../../../ui/CodeField.svelte";
  import TextField from "../../../ui/TextField.svelte";
  import { erreur, jourLong, type Champ } from "../erreurs";
  import Identite from "../Identite.svelte";
  import Renvoi from "../Renvoi.svelte";
  import Section from "./Section.svelte";

  type Props = { etat: EtatServeur | null };
  let { etat }: Props = $props();
  const uid = $props.id();
  let vue = $state<"ferme" | "saisie" | "code" | "fini">("ferme");
  let actuelle = $state("");
  let nouvelle = $state("");
  let mdp = $state("");
  let totp = $state("");
  let code = $state("");
  let errs = $state<Partial<Record<Champ | "nouvelle", string>>>({});
  let global = $state("");
  let els: Partial<Record<Champ | "nouvelle", HTMLInputElement | undefined>> = $state({});
  const bloque = $derived(etat?.recupJusqu ? t("account.forgot.recup", { date: jourLong(etat.recupJusqu) }) : "");

  function vider() {
    mdp = totp = code = "";
  }
  async function focus(c: Champ | "nouvelle") {
    await tick();
    els[c]?.focus();
  }
  function montrer(e: unknown) {
    const x = erreur(e, "parametres");
    if (x.champ) {
      errs = { [x.champ]: x.texte };
      void focus(x.champ);
    } else global = x.texte;
    announce(x.texte);
  }
  async function ouvrir() {
    if (bloque) return;
    vue = "saisie";
    errs = {};
    global = "";
    await focus("email");
  }
  async function recevoir() {
    errs = {};
    global = "";
    const r = await verifierSaisie({ email: nouvelle });
    if (r.email) {
      errs = { nouvelle: erreur(new Error(r.email), "parametres").texte };
      return focus("nouvelle");
    }
    try {
      await confirmerIdentite(mdp, etat?.totp ? totp : "", actuelle);
      await changementAdresse.debut(nouvelle, getLang());
    } catch (e) {
      return montrer(e);
    }
    totp = "";
    vue = "code";
    announce(t("account.email.sent"));
    await focus("code");
  }
  async function changer() {
    errs = {};
    global = "";
    if (code.length !== 6) {
      errs = { code: t("account.err.code6") };
      return focus("code");
    }
    try {
      await changementAdresse.fin(code, mdp, etat?.totp ? totp : "");
    } catch (e) {
      return montrer(e);
    }
    vider();
    actuelle = nouvelle = "";
    vue = "fini";
    announce(t("account.email.done"));
  }
  function annuler() {
    vider();
    vue = "ferme";
  }
</script>

<Section id="sec-email" titre={t("account.section.email")}>
  <div class="ligne">
    <div class="lib"><p class="val">{t("account.email.hidden")}</p></div>
    {#if vue === "ferme" || vue === "fini"}
      <Button variant="secondary" dense disabled={!!bloque} aria-label={t("account.email.changeName")} aria-describedby={bloque ? `${uid}-r` : undefined} onpress={ouvrir}>{t("account.change")}</Button>
    {/if}
  </div>
  {#if bloque}<p id="{uid}-r" class="raison">{bloque}</p>{/if}
  {#if vue === "fini"}<p class="ok" role="status">{t("account.email.done")}</p>{/if}
  {#if vue === "saisie"}
    <form class="form" novalidate onsubmit={(e) => e.preventDefault()}>
      <p class="note">{t("account.email.note")}</p>
      <Identite demanderEmail totp={!!etat?.totp} labelEmail={t("account.email.current")} hintEmail={t("account.email.current.hint")} labelMdp={t("account.password")} bind:email={actuelle} bind:mdp bind:code={totp} bind:errs bind:els />
      <TextField label={t("account.email.new")} type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" error={errs.nouvelle} bind:value={nouvelle} bind:el={els.nouvelle} oninput={() => (errs.nouvelle = undefined)} />
      {#if global}<p class="err" role="alert">{global}</p>{/if}
      <div class="actions">
        <Button type="submit" onpress={recevoir}>{t("account.signup.send")}</Button>
        <Button variant="ghost" onpress={annuler}>{t("common.cancel")}</Button>
      </div>
    </form>
  {:else if vue === "code"}
    <form class="form" novalidate onsubmit={(e) => e.preventDefault()}>
      <p class="note">{t("account.email.sent")}</p>
      <CodeField label={t("account.code")} error={errs.code} bind:value={code} bind:el={els.code} onvalue={() => (errs.code = undefined)} />
      {#if etat?.totp}<CodeField label={t("account.totp")} hint={t("account.totp.next")} error={errs.totp} bind:value={totp} bind:el={els.totp} onvalue={() => (errs.totp = undefined)} />{/if}
      {#if global}<p class="err" role="alert">{global}</p>{/if}
      <div class="actions">
        <Button type="submit" onpress={changer}>{t("account.email.submit")}</Button>
        <Renvoi onerreur={montrer} />
        <Button variant="ghost" onpress={annuler}>{t("common.cancel")}</Button>
      </div>
    </form>
  {/if}
</Section>
