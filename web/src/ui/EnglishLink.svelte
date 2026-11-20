<script lang="ts">
  // Lien « English version » (propriétaire, 20 novembre) : sur la version française d'une page
  // bilingue (app/langues.ts), un navigateur anglophone voit ce petit lien vers la version
  // « /en… ». L'adresse donne la langue de ces pages (référencement : jamais de renvoi
  // automatique) ; ce lien garde le confort des anglophones. Posé en position fixe après le
  // montage seulement : il ne décale rien (aucun CLS). Rien n'est envoyé ni gardé.
  import { BILINGUE, cheminEn, langueDuChemin } from "../app/langues";
  import { detectLang, getLang } from "../i18n/i18n.svelte";

  let {
    bilingue = BILINGUE,
    chemin = typeof location === "undefined" ? null : location.pathname,
    base = import.meta.env.BASE_URL,
    navigateur = typeof navigator === "undefined" ? [] : navigator.languages,
  }: { bilingue?: boolean; chemin?: string | null; base?: string; navigateur?: readonly string[] } = $props();

  const cible = $derived.by(() => {
    if (!bilingue || chemin === null || getLang() !== "fr" || detectLang(navigateur) !== "en") return null;
    const b = base.replace(/\/$/, "");
    const p = b !== "" && chemin.startsWith(b) ? chemin.slice(b.length) || "/" : chemin;
    const l = langueDuChemin(p);
    return l?.lang === "fr" ? b + cheminEn("en", l.chemin) : null;
  });
</script>

{#if cible}
  <a class="en-link" href={cible} lang="en" hreflang="en" data-english-link>English version</a>
{/if}

<style>
  .en-link {
    position: fixed;
    right: 16px;
    bottom: calc(16px + env(safe-area-inset-bottom));
    z-index: 40;
    padding: 8px 14px;
    border-radius: 999px;
    background: rgb(11 13 18 / 0.86);
    box-shadow: inset 0 0 0 1px rgb(233 236 242 / 0.22);
    color: var(--text);
    font-size: var(--fs-small);
    text-decoration: underline;
    text-underline-offset: 3px;
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
  }
  .en-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
