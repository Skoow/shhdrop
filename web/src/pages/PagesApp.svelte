<script lang="ts">
  // Pages d'information servies par leur propre fichier HTML (pages séparées, conception du
  // 16 novembre) : Sécurité, Confidentialité, Offres, Conditions, Mentions légales, Signaler.
  // Seulement la coque (en-tête, menu, pied) et la page : ni composeur, ni moteur de chiffrement,
  // ni compte, ni salon. Le même composant sert au rendu du build (contenu déjà écrit dans le
  // HTML, pour les moteurs de recherche et l'affichage avant le script) et au navigateur.
  import { getDemo } from "../app/demo-hooks";
  import { router } from "../app/router.svelte";
  import { applySeo } from "../app/seo";
  import { setScreenTitle } from "../app/title";
  import { getLang } from "../i18n/i18n.svelte";
  import InfoPage from "../routes/InfoPage.svelte";
  import Offres from "../routes/Offres.svelte";
  import type { InfoName } from "../routes/pages/content";
  import AppShell from "../ui/AppShell.svelte";

  const demo = getDemo();
  const name = $derived(router.current.name);

  $effect(() => {
    void getLang();
    setScreenTitle(name);
    applySeo(name);
  });
</script>

{#snippet demoBanner()}
  {#if demo}<demo.Banner />{/if}
{/snippet}

<AppShell banner={demo ? demoBanner : undefined}>
  {#if name === "offres"}
    <Offres />
  {:else}
    <InfoPage name={name as InfoName} />
  {/if}
</AppShell>
