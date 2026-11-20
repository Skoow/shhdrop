<script lang="ts">
  // Ce qui manque à un nouveau mot de passe, mis à jour pendant la frappe (propriétaire,
  // 20 novembre) : chaque règle cochée quand elle est remplie. Lu une fois par les lecteurs
  // d'écran quand le champ est décrit par cette liste (aria-describedby), sans annonce à chaque
  // touche.
  import { t } from "../../i18n/i18n.svelte";
  import { Check } from "../../ui/Icon";
  import { REGLES_MDP, cleRegle, reglesMdp } from "./verifs";

  let { mdp, adresse = "", id }: { mdp: string; adresse?: string; id?: string } = $props();
  const etat = $derived(reglesMdp(mdp, adresse));
</script>

<ul class="regles" {id} data-regles-mdp aria-label={t("account.mdp.regles")}>
  {#each REGLES_MDP as r (r)}
    <li class={{ ok: etat[r] }} data-regle={r} data-ok={etat[r] ? "" : undefined}>
      <span class="ic" aria-hidden="true">{#if etat[r]}<Check size={12} strokeWidth={3} />{/if}</span>
      <span>{t(cleRegle(r))}</span><span class="sr-only">{etat[r] ? t("account.mdp.ok") : t("account.mdp.manque")}</span>
    </li>
  {/each}
</ul>

<style>
  .regles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
    gap: 6px 16px;
    margin: calc(-1 * var(--sp-3)) 0 0;
    padding: 0;
    list-style: none;
    color: var(--text-2);
    font-size: var(--fs-small);
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    transition: color var(--dur-fast) var(--ease-out);
  }
  .ic {
    display: grid;
    place-items: center;
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px rgb(233 236 242 / 0.35);
    color: var(--on-accent);
  }
  li.ok {
    color: var(--text);
  }
  li.ok .ic {
    background: var(--accent);
    box-shadow: none;
  }
  @media (prefers-reduced-motion: reduce) {
    li {
      transition: none;
    }
  }
</style>
