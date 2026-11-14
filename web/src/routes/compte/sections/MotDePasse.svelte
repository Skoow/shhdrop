<script lang="ts">
  // Mot de passe (conception compte §8.5, §21.15.4 point 3 ; demande du propriétaire du 14
  // novembre ; plan, lot 13 ; monté seulement avec __COMPTES__). Changer le mot de passe déconnecte
  // TOUJOURS les autres appareils (le serveur le fait) : aucune case pour l'éviter, une phrase le
  // dit. Mot de passe actuel (session « récente »), puis nouveau : seule une nouvelle enveloppe de
  // la clé du compte part (account/session.svelte.ts) ; les deux champs sont vidés après.
  import { tick } from "svelte";
  import { adresseConnue, changerMotDePasse, confirmerIdentite, type EtatServeur } from "../../../account/session.svelte";
  import { t } from "../../../i18n/i18n.svelte";
  import { announce } from "../../../ui/announce";
  import Button from "../../../ui/Button.svelte";
  import { erreur, type Champ } from "../erreurs";
  import Identite from "../Identite.svelte";
  import MotDePasse from "../MotDePasse.svelte";
  import Section from "./Section.svelte";

  type Props = { etat: EtatServeur | null };
  let { etat }: Props = $props();
  let vue = $state<"ferme" | "saisie" | "fini">("ferme");
  let email = $state("");
  let actuel = $state("");
  let totp = $state("");
  let nouveau = $state("");
  let errs = $state<Partial<Record<Champ | "nouveau", string>>>({});
  let global = $state("");
  let els: Partial<Record<Champ | "nouveau", HTMLInputElement | undefined>> = $state({});
  let demanderEmail = $state(false);

  async function ouvrir() {
    demanderEmail = !adresseConnue();
    vue = "saisie";
    errs = {};
    global = "";
    await tick();
    (demanderEmail ? els.email : els.mdp)?.focus();
  }
  function vider() {
    actuel = nouveau = totp = "";
  }
  async function enregistrer() {
    errs = {};
    global = "";
    try {
      await confirmerIdentite(actuel, etat?.totp ? totp : "", demanderEmail ? email : undefined);
    } catch (e) {
      return montrer(e, "mdp");
    }
    try {
      await changerMotDePasse(nouveau);
    } catch (e) {
      return montrer(e, "nouveau");
    }
    vider();
    vue = "fini";
    announce(t("account.mdp.done"));
  }
  function montrer(e: unknown, champMdp: "mdp" | "nouveau") {
    const x = erreur(e, "parametres");
    // Règles du mot de passe (court, adresse…) : elles visent le NOUVEAU mot de passe.
    const champ = x.champ === "mdp" ? champMdp : x.champ;
    if (champ) {
      errs = { [champ]: x.texte };
      void tick().then(() => els[champ]?.focus());
    } else global = x.texte;
    announce(x.texte);
  }
</script>

<Section id="sec-mdp" titre={t("account.section.mdp")}>
  <div class="ligne">
    <div class="lib"></div>
    {#if vue !== "saisie"}<Button variant="secondary" dense aria-label={t("account.mdp.changeName")} onpress={ouvrir}>{t("account.change")}</Button>{/if}
  </div>
  {#if vue === "fini"}<p class="ok" role="status">{t("account.mdp.done")}</p>{/if}
  {#if vue === "saisie"}
    <form class="form" novalidate onsubmit={(e) => e.preventDefault()}>
      <Identite {demanderEmail} totp={!!etat?.totp} bind:email bind:mdp={actuel} bind:code={totp} bind:errs bind:els />
      <MotDePasse label={t("account.password.new")} autocomplete="new-password" hint={t("account.password.hint")} error={errs.nouveau} bind:value={nouveau} bind:el={els.nouveau} oninput={() => (errs.nouveau = undefined)} />
      <p class="note">{t("account.mdp.others")}</p>
      {#if global}<p class="err" role="alert">{global}</p>{/if}
      <div class="actions">
        <Button type="submit" onpress={enregistrer}>{t("account.mdp.submit")}</Button>
        <Button variant="ghost" onpress={() => {
            vider();
            vue = "ferme";
          }}>{t("common.cancel")}</Button>
      </div>
    </form>
  {/if}
</Section>
