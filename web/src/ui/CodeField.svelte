<script lang="ts">
  // Code à 6 chiffres reçu par e-mail ou donné par l'application d'authentification (conception
  // compte §12) : étiquette visible, autocomplete one-time-code, clavier numérique ; le collage
  // n'est jamais bloqué (pas de maxlength) : espaces, tirets et autres caractères sont retirés,
  // 6 chiffres gardés au plus.
  type Props = {
    label: string;
    value?: string;
    hint?: string;
    error?: string;
    onvalue?: (v: string) => void;
    el?: HTMLInputElement | undefined;
    disabled?: boolean;
  };
  let { label, value = $bindable(""), hint, error, onvalue, el = $bindable(), disabled = false }: Props = $props();
  const uid = $props.id();
  const describedBy = $derived([hint ? `${uid}-hint` : "", error ? `${uid}-err` : ""].filter(Boolean).join(" ") || undefined);

  function oninput(e: Event) {
    const i = e.currentTarget as HTMLInputElement;
    const v = i.value.replace(/\D/g, "").slice(0, 6);
    i.value = v;
    value = v;
    onvalue?.(v);
  }
</script>

<div class="field">
  <label for={uid}>{label}</label>
  <input
    bind:this={el}
    {value}
    {oninput}
    {disabled}
    id={uid}
    type="text"
    inputmode="numeric"
    autocomplete="one-time-code"
    spellcheck="false"
    class={["input", { invalid: !!error }]}
    aria-invalid={error ? "true" : undefined}
    aria-describedby={describedBy}
  />
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
  .input {
    width: min(100%, 14rem);
    min-height: 52px;
    padding: 0 var(--sp-4);
    border: 1px solid var(--line-strong);
    border-radius: var(--r-md);
    background: var(--surface-1);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 1.375rem;
    letter-spacing: 0.3em;
    font-variant-numeric: tabular-nums;
  }
  .input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .input.invalid {
    border-color: var(--danger);
  }
  .input:disabled {
    color: var(--text-disabled);
    background: var(--surface-2);
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
</style>
