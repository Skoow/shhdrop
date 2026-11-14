<script lang="ts">
  // Case à cocher des pages du compte (« Rester connecté », « J'ai au moins 15 ans… ») : vraie
  // case du navigateur (clavier, lecteurs d'écran), cible de 44 px, indice et erreur reliés.
  type Props = { label: string; checked?: boolean; hint?: string; error?: string; el?: HTMLInputElement | undefined };
  let { label, checked = $bindable(false), hint, error, el = $bindable() }: Props = $props();
  const uid = $props.id();
  const describedBy = $derived([hint ? `${uid}-hint` : "", error ? `${uid}-err` : ""].filter(Boolean).join(" ") || undefined);
</script>

<div class="case">
  <div class="ligne">
    <input bind:this={el} bind:checked id={uid} type="checkbox" aria-invalid={error ? "true" : undefined} aria-describedby={describedBy} />
    <label for={uid}>{label}</label>
  </div>
  {#if hint}<p id="{uid}-hint" class="hint">{hint}</p>{/if}
  {#if error}<p id="{uid}-err" class="err" role="alert">{error}</p>{/if}
</div>

<style>
  .case {
    display: grid;
    gap: var(--sp-1);
  }
  .ligne {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
  }
  input {
    flex: none;
    width: 22px;
    height: 22px;
    margin: 11px 0;
    accent-color: var(--accent);
  }
  label {
    padding: 11px 0;
    line-height: 1.4;
    color: var(--text);
    cursor: pointer;
  }
  .hint,
  .err {
    margin: 0 0 0 calc(22px + var(--sp-3));
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
