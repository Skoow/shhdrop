<script lang="ts">
  // Mot de passe du compte (conception compte §12) : étiquette visible, autocomplete exact
  // (new-password ou current-password), collage permis, bouton « Afficher » / « Masquer » dans le
  // champ (44 px). Le mot de passe ne quitte jamais l'appareil : seul account/ en tire A_auth.
  import { t } from "../../i18n/i18n.svelte";
  import { Eye, EyeOff } from "../../ui/Icon";

  type Props = {
    label: string;
    value?: string;
    autocomplete: "new-password" | "current-password";
    hint?: string;
    error?: string;
    el?: HTMLInputElement | undefined;
    oninput?: () => void;
  };
  let { label, value = $bindable(""), autocomplete, hint, error, el = $bindable(), oninput }: Props = $props();
  const uid = $props.id();
  let shown = $state(false);
  const describedBy = $derived([hint ? `${uid}-hint` : "", error ? `${uid}-err` : ""].filter(Boolean).join(" ") || undefined);
</script>

<div class="field">
  <label for={uid}>{label}</label>
  <div class={["box", { invalid: !!error }]}>
    <input
      bind:this={el}
      bind:value
      {oninput}
      id={uid}
      type={shown ? "text" : "password"}
      {autocomplete}
      autocapitalize="off"
      spellcheck="false"
      aria-invalid={error ? "true" : undefined}
      aria-describedby={describedBy}
    />
    <button type="button" class="ib" aria-label={shown ? t("account.password.hide") : t("account.password.show")} aria-pressed={shown} onclick={() => (shown = !shown)}>
      {#if shown}<EyeOff size={19} strokeWidth={1.9} aria-hidden="true" />{:else}<Eye size={19} strokeWidth={1.9} aria-hidden="true" />{/if}
    </button>
  </div>
  {#if hint}<p id="{uid}-hint" class="hint">{hint}</p>{/if}
  {#if error}<p id="{uid}-err" class="err" role="alert">{error}</p>{/if}
</div>

<style>
  .field {
    display: grid;
    gap: var(--sp-2);
  }
  label {
    font-size: var(--fs-small);
    line-height: var(--lh-small);
    font-weight: 600;
    color: var(--text-2);
  }
  .box {
    display: flex;
    align-items: center;
    min-height: 48px;
    border: 1px solid var(--line-strong);
    border-radius: var(--r-md);
    background: var(--surface-1);
  }
  .box:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .box.invalid {
    border-color: var(--danger);
  }
  input {
    flex: 1;
    min-width: 0;
    min-height: 46px;
    padding: 0 var(--sp-2) 0 var(--sp-4);
    border: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: max(1rem, 16px);
  }
  input:focus {
    outline: none;
  }
  .ib {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    margin-right: 2px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--text-2);
    cursor: pointer;
  }
  .ib:focus-visible {
    outline: 2px solid var(--accent);
  }
  @media (hover: hover) {
    .ib:hover {
      color: var(--text);
      background: rgb(255 255 255 / 0.07);
    }
  }
  .hint,
  .err {
    margin: 0;
    font-size: var(--fs-small);
    line-height: var(--lh-small);
  }
  .hint {
    color: var(--text-3);
  }
  .err {
    color: var(--danger);
  }
  @media (forced-colors: active) {
    .box {
      border-color: CanvasText;
    }
  }
</style>
