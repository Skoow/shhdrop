<script lang="ts">
  // Page d'explication et pseudonyme (spec §39.4 point 3 ; textes corrigés : v3 §5.1, exigence C-3
  // 18) : après le mot de passe, avant le salon. Le pseudonyme suit les règles du moteur
  // (pseudoValide : longueur, caractères, une seule écriture) et l'unicité dans le salon (profils
  // déjà reçus). Le salon est déjà ouvert en arrière-plan : l'arrivée dans le groupe chiffré se
  // fait pendant la lecture.
  import { untrack } from "svelte";
  import { t, getLang } from "../../i18n/i18n.svelte";
  import { formatDuration } from "../../i18n/format";
  import { vue, entrer, pseudoPropose, photoProposee, choisirAvatar, verifierPseudo, conversation } from "../../salon/salon.svelte";
  import AvatarPicker from "../../ui/AvatarPicker.svelte";
  import Cadre from "../compte/Cadre.svelte";
  import TextField from "../../ui/TextField.svelte";
  import Button from "../../ui/Button.svelte";
  import Banner from "../../ui/Banner.svelte";

  const refuse = untrack(() => conversation()?.pseudoRefuse === true);
  let pseudo = $state(untrack(() => vue.monPseudo ?? pseudoPropose()));
  let essaye = $state(false);
  let photo = $state<Uint8Array | null>(untrack(() => photoProposee()));
  let champ: HTMLInputElement | undefined = $state();
  const reste = $derived(Math.max(0, (vue.finMs - Date.now()) / 1000));
  const duree = $derived(formatDuration(reste, getLang(), { coarse: true }));
  const verdict = $derived((void vue.rev, verifierPseudo(pseudo)));
  const erreur = $derived(essaye || pseudo.length > 0 ? ("code" in verdict ? t(`salon.pseudo.err.${verdict.code}`) : "") : "");

  function go(): void {
    essaye = true;
    if (!entrer(pseudo)) champ?.focus();
    else if (photo) void choisirAvatar(photo);
  }
  $effect(() => {
    if (refuse) untrack(() => champ?.focus());
  });
</script>

<Cadre titre={t("salon.intro.title")}>
  {#if refuse}<Banner kind="warn">{t("salon.pseudo.err.refuse")}</Banner>{/if}
  <ul class="points">
    <li>{t("salon.intro.1")}</li>
    <li>{t("salon.intro.2", { duree })}</li>
    <li>{t("salon.intro.3")}</li>
    <li>{t("salon.intro.9")}</li>
    <li>{t("salon.intro.4")}</li>
    <li>{t("salon.intro.5")}</li>
    <li>{t("salon.intro.6")}</li>
    <li>{t("salon.intro.7")}</li>
    <li>{t("salon.intro.8")}</li>
    <li>{t("salon.intro.10")}</li>
  </ul>
  <div class="form">
    <TextField
      label={t("salon.intro.pseudo")}
      hint={t("salon.intro.pseudo.hint")}
      bind:value={pseudo}
      bind:el={champ}
      autocomplete="off"
      autocapitalize="off"
      spellcheck={false}
      maxlength={96}
      enterkeyhint="go"
      error={erreur || undefined}
      onkeydown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          go();
        }
      }}
    />
    <!-- Photo pour ce salon (v3 §7.2), facultative : ré-encodée sur l'appareil, envoyée chiffrée. -->
    <div class="photo" role="group" aria-label={t("salon.avatar.photo")}>
      <span class="note">{t("salon.avatar.photo")}</span>
      <AvatarPicker bind:photo initiale={[...pseudo.trim()][0] ?? ""} />
    </div>
    <div class="actions"><Button onpress={go}>{t("salon.intro.enter")}</Button></div>
    {#if !vue.dansLeGroupe}<p class="note" role="status">{t("salon.intro.wait")}</p>{/if}
  </div>
</Cadre>

<style>
  .points {
    margin: 0;
    padding-inline-start: 1.2em;
    display: grid;
    gap: var(--sp-2);
    color: var(--text-2);
  }
  .form {
    display: grid;
    gap: var(--sp-4);
  }
</style>
