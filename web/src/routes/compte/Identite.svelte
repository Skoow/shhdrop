<script lang="ts">
  // Confirmation d'identité des paramètres (conception compte §8.5 « session récente » ; plan, lot
  // 13) : mot de passe actuel, code de l'application si la double authentification est active, et
  // l'adresse du compte seulement si cette page ne la connaît pas (rechargement avec « Rester
  // connecté » : elle n'est jamais gardée sur l'appareil). Les valeurs restent dans l'écran qui
  // monte ce bloc ; account/ n'en tire qu'A_auth (le mot de passe ne part jamais).
  // Monté seulement avec __COMPTES__ (routes/compte/pages.ts).
  import { t } from "../../i18n/i18n.svelte";
  import CodeField from "../../ui/CodeField.svelte";
  import TextField from "../../ui/TextField.svelte";
  import type { Champ } from "./erreurs";
  import MotDePasse from "./MotDePasse.svelte";

  type Props = {
    /** Demander l'adresse du compte (la page ne la connaît pas). */
    demanderEmail: boolean;
    /** Double authentification active : code de l'application. */
    totp: boolean;
    email?: string;
    mdp?: string;
    code?: string;
    errs?: Partial<Record<Champ, string>>;
    els?: Partial<Record<Champ, HTMLInputElement | undefined>>;
    /** Libellé de l'adresse (« Adresse e-mail actuelle » pour un changement d'adresse). */
    labelEmail?: string;
    hintEmail?: string;
    labelMdp?: string;
    hintTotp?: string;
  };
  let {
    demanderEmail,
    totp,
    email = $bindable(""),
    mdp = $bindable(""),
    code = $bindable(""),
    errs = $bindable({}),
    els = $bindable({}),
    labelEmail,
    hintEmail,
    labelMdp,
    hintTotp,
  }: Props = $props();
</script>

{#if demanderEmail}
  <TextField label={labelEmail ?? t("account.email")} type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" hint={hintEmail} error={errs.email} bind:value={email} bind:el={els.email} oninput={() => (errs.email = undefined)} />
{/if}
<MotDePasse label={labelMdp ?? t("account.password.current")} autocomplete="current-password" error={errs.mdp} bind:value={mdp} bind:el={els.mdp} oninput={() => (errs.mdp = undefined)} />
{#if totp}
  <CodeField label={t("account.totp")} hint={hintTotp} error={errs.totp} bind:value={code} bind:el={els.totp} onvalue={() => (errs.totp = undefined)} />
{/if}
