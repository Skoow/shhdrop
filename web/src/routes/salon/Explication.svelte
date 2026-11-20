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
  import { changerPseudo, pseudoAChoisir, pseudoLibre, verifierSaisie } from "../../account/session.svelte";
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
  let errCompte = $state("");
  const erreur = $derived(errCompte || (essaye || pseudo.length > 0 ? ("code" in verdict ? t(`salon.pseudo.err.${verdict.code}`) : "") : ""));
  // Compte sans vrai pseudo (pseudo provisoire de l'inscription, 20 novembre) : celui choisi ici
  // devient le pseudo du compte, unique parmi les comptes (vérifié avant d'entrer).
  const premier = __COMPTES__ && untrack(() => pseudoAChoisir());
  // Avec un compte et son vrai pseudo (20 novembre, propriétaire : un seul pseudo) : le salon
  // prend le pseudo du compte, non modifiable ici ; il se change dans le profil (3 fois par an).
  // Pseudo du compte déjà pris dans ce salon (course rare, `refuse`) : le champ se libère.
  const fige = __COMPTES__ && !premier && !refuse && untrack(() => pseudoPropose()) !== "";
  let envoi = false;

  async function go(): Promise<void> {
    essaye = true;
    errCompte = "";
    if (envoi) return;
    if (premier && !("code" in verdict)) {
      envoi = true;
      try {
        const r = await verifierSaisie({ pseudo });
        if (r.pseudo) errCompte = t(r.pseudo === "pseudo_reserve" ? "account.err.pseudoReserve" : `salon.pseudo.err.${r.pseudo === "pseudo_longueur" ? "longueur" : r.pseudo === "pseudo_ecritures" ? "ecritures" : "caracteres"}`);
        else if (!(await pseudoLibre(pseudo))) errCompte = t("account.pseudo.taken");
      } catch {
        errCompte = t("salon.pseudo.err.compte");
      } finally {
        envoi = false;
      }
      if (errCompte) return champ?.focus();
    }
    if (!entrer(pseudo)) return champ?.focus();
    if (photo) void choisirAvatar(photo);
    if (premier) void changerPseudo(pseudo).catch(() => undefined);
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
      readonly={fige || undefined}
      aria-readonly={fige ? "true" : undefined}
      autocomplete="off"
      autocapitalize="off"
      spellcheck={false}
      maxlength={96}
      enterkeyhint="go"
      error={erreur || undefined}
      oninput={() => (errCompte = "")}
      onkeydown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void go();
        }
      }}
    />
    <!-- Photo pour ce salon (v3 §7.2), facultative : ré-encodée sur l'appareil, envoyée chiffrée. -->
    <div class="photo" role="group" aria-label={t("salon.avatar.photo")}>
      <span class="note">{t("salon.avatar.photo")}</span>
      <AvatarPicker bind:photo initiale={[...pseudo.trim()][0] ?? ""} />
    </div>
    {#if premier}<p class="note" data-pseudo-compte>{t("salon.intro.pseudo.compte")}</p>{/if}
    {#if fige}<p class="note" data-pseudo-fige>{t("salon.intro.pseudo.fige")}</p>{/if}
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
