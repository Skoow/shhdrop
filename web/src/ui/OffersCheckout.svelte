<script lang="ts">
  // Page Offres (décision du propriétaire du 16 novembre) : une seule présentation des offres,
  // sans redite. On choisit la facturation (mensuelle ou annuelle), puis son offre (Plus ou Pro ;
  // Gratuit est l'offre en cours, rien à choisir) ; un récapitulatif dit le prix et les moyens de
  // paiement. Étapes suivantes du parcours : créer son compte, choisir son moyen de paiement,
  // payer. Elles ne sont pas encore ouvertes (compte : décision D8 après le juriste ; paiement :
  // prestataire et statut juridique, spec §38.5) : le bouton le dit, rien n'est demandé ni prélevé
  // (§38.1 : jamais un bouton « Payer » qui ne paie pas). Chiffres lus dans PAID et limits.ts.
  import { formatBytes, formatDuration } from "../i18n/format";
  import { getLang, t } from "../i18n/i18n.svelte";
  import { CONTENT_MAX, MAX_OPENS, PAID, TTL_MAX_HOURS, type PaidTier } from "../limits";
  import { Check } from "./Icon";

  type Billing = "month" | "year";
  // Mensuel sélectionné par défaut (décision du propriétaire du 16 novembre).
  let billing = $state<Billing>("month");
  let chosen = $state<PaidTier | null>(null);
  const uid = $props.id();
  const lang = $derived(getLang());
  const eur = (v: number) => new Intl.NumberFormat(lang, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
  /** Mois offerts par l'annuel (12 mois au prix mensuel, moins le prix annuel), le plus grand des deux offres. */
  const freeMonths = Math.max(...(["plus", "pro"] as const).map((x) => Math.round((12 * PAID[x].month - PAID[x].year) / PAID[x].month)));

  type Tier = "free" | PaidTier;
  const TIERS: readonly Tier[] = ["free", "plus", "pro"];
  const name = (x: Tier) => (x === "free" ? t("offers.free") : t(`paid.badge.${x}`));
  const details = (x: Tier) => [
    { k: t("offers.card.size"), v: formatBytes(x === "free" ? CONTENT_MAX : PAID[x].bytes, lang) },
    { k: t("offers.card.ttl"), v: x === "free" ? formatDuration(TTL_MAX_HOURS * 3600, lang) : t("paid.days", { n: Math.max(...PAID[x].ttlDays) }) },
    { k: t("offers.card.opens"), v: String(x === "free" ? MAX_OPENS : PAID[x].opens) },
  ];
  const price = (x: PaidTier) => (billing === "month" ? PAID[x].month : PAID[x].year);
  const per = $derived(billing === "month" ? t("offers.per.month") : t("offers.per.year"));
</script>

<div class="co" data-checkout>
  <!-- Étapes du parcours : la première seulement est ouverte aujourd'hui. -->
  <ol class="steps" aria-label={t("offers.steps.label")}>
    <li class="on" aria-current="step"><span class="n">1</span>{t("offers.steps.offer")}</li>
    <li><span class="n">2</span>{t("offers.steps.account")}</li>
    <li><span class="n">3</span>{t("offers.steps.pay")}</li>
  </ol>

  <fieldset class="billing" data-billing>
    <legend class="sr-only">{t("offers.billing.label")}</legend>
    <label class={{ on: billing === "month" }}>
      <input type="radio" name="{uid}-billing" value="month" bind:group={billing} />{t("offers.billing.month")}
    </label>
    <label class={{ on: billing === "year" }}>
      <input type="radio" name="{uid}-billing" value="year" bind:group={billing} />{t("offers.billing.year")}
      {#if freeMonths > 0}<span class="gift">{t("price.freeMonths", { n: freeMonths })}</span>{/if}
    </label>
  </fieldset>

  <fieldset class="tiers">
    <legend class="sr-only">{t("offers.choose.label")}</legend>
    {#each TIERS as x (x)}
      <div class={["card", x, { on: chosen === x }]} data-tier={x}>
        <p class="nm">{name(x)}{#if x === "free"}<span class="cur">{t("offers.free.now")}</span>{/if}</p>
        {#if x === "free"}
          <p class="pr num"><span class="pv">{eur(0)}</span>{" "}<span class="pu">{t("offers.card.free")}</span></p>
        {:else}
          <p class="pr num" data-price><span class="pv">{eur(price(x))}</span>{" "}<span class="pu">{per}</span></p>
        {/if}
        <ul class="dt num">
          {#each details(x) as d (d.k)}<li><span class="dk">{d.k}</span>{" "}<span class="dv">{d.v}</span></li>{/each}
        </ul>
        {#if x !== "free"}
          {@const tier = x}
          <label class="pick">
            <input type="radio" name="{uid}-tier" value={tier} bind:group={chosen} />
            <span>{chosen === tier ? t("offers.chosen") : t("offers.choose", { tier: name(tier) })}</span>
            {#if chosen === tier}<Check size={18} strokeWidth={2.4} aria-hidden="true" />{/if}
          </label>
        {/if}
      </div>
    {/each}
  </fieldset>
  <!-- Prix affichés sans « TTC » à chaque ligne (17 novembre) : dit une fois ici. -->
  <p class="ttc" data-ttc>{t("offers.ttc")}</p>

  {#if chosen}
    <section class="sum" aria-live="polite" data-summary>
      <p class="sl">{t("offers.summary.label")}</p>
      <p class="st"><b>{name(chosen)}</b> · {billing === "month" ? t("offers.billing.month") : t("offers.billing.year")} · <span class="num">{eur(price(chosen))} {per}</span></p>
      <p class="sn">{billing === "month" ? t("offers.summary.month") : t("offers.summary.year")}</p>
      <p class="sn">{t("offers.summary.means")}</p>
      <button type="button" class="go" disabled aria-describedby="{uid}-wait">{t("offers.continue")}</button>
      <p id="{uid}-wait" class="wait" data-wait>{t("offers.continue.wait")}</p>
    </section>
  {/if}
</div>

<style>
  .co {
    display: grid;
    gap: var(--sp-5);
  }
  .steps {
    display: flex;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--text-3);
    font-size: var(--fs-small);
  }
  .steps li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .steps .n {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px var(--line-strong);
    font-size: 0.75rem;
  }
  .steps .on {
    color: var(--text);
    font-weight: 600;
  }
  .steps .on .n {
    background: var(--accent);
    box-shadow: none;
    color: var(--bg);
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  .billing {
    display: inline-flex;
    justify-self: start;
    gap: 4px;
    padding: 4px;
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.04);
    box-shadow: inset 0 0 0 1px var(--hair);
  }
  .billing label {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 16px;
    border-radius: var(--r-pill);
    color: var(--text-2);
    font-weight: 600;
    cursor: pointer;
  }
  .billing label.on {
    background: var(--surface-3);
    color: var(--text);
  }
  .billing input,
  .pick input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .billing label:has(input:focus-visible),
  .pick:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .gift {
    padding: 1px 8px;
    border-radius: var(--r-pill);
    background: rgb(95 227 181 / 0.14);
    color: var(--accent);
    font-size: var(--fs-micro);
  }
  .tiers {
    display: grid;
    gap: var(--sp-4);
  }
  @media (min-width: 860px) {
    .tiers {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  .card {
    display: grid;
    align-content: start;
    gap: var(--sp-3);
    padding: 20px;
    border-radius: 20px;
    background: linear-gradient(180deg, rgb(15 22 42 / 0.9), rgb(10 15 30 / 0.9));
    box-shadow: inset 0 0 0 1px rgb(150 175 255 / 0.14);
  }
  .card.plus {
    box-shadow: inset 0 0 0 1px rgb(31 168 230 / 0.45);
  }
  .card.pro {
    box-shadow: inset 0 0 0 1px rgb(52 97 255 / 0.55);
  }
  .card.on {
    box-shadow:
      inset 0 0 0 2px var(--accent),
      0 18px 40px -24px rgb(95 227 181 / 0.6);
  }
  /* Nom et prix centrés (retours du propriétaire du 17 novembre). */
  .nm {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: baseline;
    gap: 8px;
    margin: 0;
    font-size: 1.375rem;
    font-weight: 700;
  }
  .plus .nm {
    color: var(--plus);
  }
  .pro .nm {
    color: var(--pro);
  }
  .cur {
    padding: 1px 8px;
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.06);
    color: var(--text-2);
    font-size: 0.75rem;
    font-weight: 500;
  }
  .pr {
    margin: 0;
    text-align: center;
  }
  .pv {
    font-size: 1.75rem;
    font-weight: 680;
  }
  .pu {
    color: var(--text-2);
    font-size: var(--fs-small);
  }
  .dt {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--fs-small);
  }
  .dt li {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-3);
    padding-block: 7px;
    border-block-start: 1px solid rgb(255 255 255 / 0.07);
  }
  .dk {
    color: var(--text-2);
  }
  .dv {
    font-weight: 600;
  }
  .pick {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px;
    border-radius: 14px;
    background: rgb(255 255 255 / 0.06);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    font-weight: 650;
    cursor: pointer;
  }
  .on .pick {
    background: var(--accent);
    box-shadow: none;
    color: var(--bg);
  }
  .ttc {
    justify-self: center;
    margin: 0;
    color: var(--text-3);
    font-size: var(--fs-small);
    text-align: center;
  }
  .sum {
    display: grid;
    gap: var(--sp-2);
    padding: 20px;
    border-radius: 20px;
    background: rgb(255 255 255 / 0.03);
    box-shadow: inset 0 0 0 1px var(--hair);
  }
  .sum p {
    margin: 0;
  }
  .sl {
    color: var(--text-3);
    font-size: var(--fs-micro);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .st {
    font-size: 1.125rem;
  }
  .sn {
    color: var(--text-2);
    font-size: var(--fs-small);
  }
  .go {
    min-height: 52px;
    margin-top: var(--sp-2);
    border: 0;
    border-radius: 14px;
    background: var(--surface-3);
    color: var(--text-disabled);
    font: inherit;
    font-weight: 650;
    cursor: not-allowed;
  }
  .wait {
    color: var(--text-2);
    font-size: var(--fs-small);
  }
  @media (forced-colors: active) {
    .card,
    .sum {
      border: 1px solid CanvasText;
    }
    .card.on {
      border: 2px solid Highlight;
    }
  }
</style>
