<script lang="ts">
  // Démo seulement (compte essayable, 19 novembre) : aucun e-mail n'est envoyé ; le code que le
  // faux serveur de l'onglet aurait envoyé s'affiche ici, sous la phrase « code envoyé ». Rien en
  // production (getDemo() rend null).
  import { getDemo } from "../../app/demo-hooks";
  import { t } from "../../i18n/i18n.svelte";

  const demo = getDemo();
  const envoi = demo?.compteCode() ?? null;
</script>

{#if demo}
  <p class="demo-code" role="note" data-demo-code>
    {demo.compteNote}
    {#if envoi}<br /><span>{t("account.demo.code", { email: envoi.email })}</span> <b class="num">{envoi.code}</b>{/if}
  </p>
{/if}

<style>
  .demo-code {
    margin: 0;
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--r-md);
    background: rgb(95 227 181 / 0.08);
    box-shadow: inset 0 0 0 1px rgb(95 227 181 / 0.3);
    color: var(--text-2);
    font-size: var(--fs-small);
    line-height: 1.5;
  }
  b {
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 1.125rem;
    letter-spacing: 0.12em;
  }
</style>
