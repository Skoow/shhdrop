<script lang="ts">
  // Cadre des pages du compte (conception compte §12, §21.15) : colonne centrée de 28 rem au plus,
  // titre de l'écran (focus à l'arrivée), sous-titre, contenu.
  import { untrack, type Snippet } from "svelte";

  type Props = { titre: string; sous?: string; children: Snippet };
  let { titre, sous, children }: Props = $props();
  let h1: HTMLHeadingElement | undefined = $state();
  $effect(() => {
    if (h1) untrack(() => h1?.focus({ preventScroll: true }));
  });
</script>

<section class="cadre" aria-labelledby="compte-titre">
  <h1 id="compte-titre" class="titre" tabindex="-1" data-large-title bind:this={h1}>{titre}</h1>
  {#if sous}<p class="sous">{sous}</p>{/if}
  {@render children()}
</section>

<style>
  .cadre {
    width: min(100%, 28rem);
    margin-inline: auto;
    padding: var(--sp-6) var(--sp-4) var(--sp-8);
    display: grid;
    gap: var(--sp-5);
    min-width: 0;
  }
  .titre {
    margin: 0;
    font-size: var(--fs-screen);
    font-stretch: var(--wd-screen);
    line-height: 1.1;
  }
  .titre:focus {
    outline: none;
  }
  .sous {
    margin: calc(-1 * var(--sp-3)) 0 0;
    color: var(--text-2);
  }
  .cadre :global(form) {
    display: grid;
    gap: var(--sp-5);
    min-width: 0;
  }
  .cadre :global(.liens) {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2) var(--sp-5);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .cadre :global(.liens a),
  .cadre :global(a.lien) {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--accent);
    font-weight: 560;
    text-underline-offset: 3px;
  }
  .cadre :global(.note) {
    margin: 0;
    color: var(--text-2);
  }
  .cadre :global(.actions) {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
  }
  .cadre :global(.actions > .btn) {
    flex: 1 1 auto;
  }
  @media (max-width: 899px) {
    .cadre {
      padding: var(--sp-2) 0 var(--sp-6);
      gap: var(--sp-4);
    }
  }
</style>
