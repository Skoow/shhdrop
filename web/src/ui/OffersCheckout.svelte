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
  import { Check, Lock, Timer } from "./Icon";

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
  // Moyen de paiement (propriétaire, 18 et 19 novembre) : carte bancaire (Stripe), PayPal, crypto.
  // Rien n'est encore branché : le choix ne fait que préparer le récapitulatif.
  type Means = "card" | "paypal" | "crypto";
  let means = $state<Means>("card");
  const MEANS: readonly Means[] = ["card", "paypal", "crypto"];
  // Ce que l'offre choisie ajoute au gratuit (lu dans PAID et limits.ts).
  const adds = $derived(
    chosen
      ? [
          t("offers.adds.size", { size: formatBytes(PAID[chosen].bytes, lang), free: formatBytes(CONTENT_MAX, lang) }),
          t("offers.adds.ttl", { n: Math.max(...PAID[chosen].ttlDays), free: formatDuration(TTL_MAX_HOURS * 3600, lang) }),
          t("offers.adds.opens", { n: PAID[chosen].opens, free: MAX_OPENS }),
          t("offers.adds.first"),
        ]
      : [],
  );
</script>

<div class="co" data-checkout>
  <!-- Mise en page « La trame », version 2 (propriétaire, 19 novembre) : étapes numérotées à
       gauche (offre et rythme, moyen de paiement, compte), récapitulatif à droite. -->
  <div class="main">
    <section class="blk" aria-labelledby="{uid}-s1">
      <h2 id="{uid}-s1"><span class="n num" aria-hidden="true">1</span>{t("offers.steps.offer")}</h2>
      <fieldset class="tiers">
        <legend class="sr-only">{t("offers.choose.label")}</legend>
        {#each TIERS as x (x)}
          <div class={["card", x, { on: chosen === x }]} data-tier={x}>
            <p class="nm">{name(x)}{#if x === "free"}<span class="cur">{t("offers.free.now")}</span>{/if}</p>
            <p class="big num"><span class="bv">{details(x)[0]!.v}</span> <span class="bu">{t("offers.big.unit")}</span></p>
            {#if x === "free"}
              <p class="pr num"><span class="pv">{eur(0)}</span>{" "}<span class="pu">{t("offers.card.free")}</span></p>
            {:else}
              <p class="pr num" data-price><span class="pv">{eur(price(x))}</span>{" "}<span class="pu">{per}</span></p>
            {/if}
            <ul class="dt num">
              {#each details(x).slice(1) as d (d.k)}<li><span class="dk">{d.k}</span>{" "}<span class="dv">{d.v}</span></li>{/each}
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
      <p class="sub">{t("offers.rhythm")}</p>
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
      {#if chosen}
        <div class="adds">
          <p class="sub">{t("offers.adds.title", { tier: name(chosen) })}</p>
          <ul>{#each adds as a (a)}<li>{a}</li>{/each}</ul>
          <p class="same"><Lock size={14} strokeWidth={2.2} aria-hidden="true" />{t("offers.adds.same")}</p>
        </div>
      {/if}
      <!-- Prix affichés sans « TTC » à chaque ligne (17 novembre) : dit une fois ici. -->
      <p class="ttc" data-ttc>{t("offers.ttc")}</p>
    </section>

    <section class="blk" aria-labelledby="{uid}-s2">
      <h2 id="{uid}-s2"><span class="n num" aria-hidden="true">2</span>{t("offers.means.title")}</h2>
      <fieldset class="means">
        <legend class="sr-only">{t("offers.means.title")}</legend>
        {#each MEANS as m (m)}
          <label class={["mn", { on: means === m }]} data-means={m}>
            <input type="radio" name="{uid}-means" value={m} bind:group={means} />
            <span class="mt">{t(`offers.means.${m}`)}</span>
            <span class="ms">{t(`offers.means.${m}.sub`)}</span>
          </label>
        {/each}
      </fieldset>
      <p class="note">{t("offers.means.note")}</p>
    </section>

    <section class="blk" aria-labelledby="{uid}-s3">
      <h2 id="{uid}-s3"><span class="n num" aria-hidden="true">3</span>{t("offers.steps.account")}</h2>
      <p class="note">{t("offers.account.body")}</p>
    </section>
  </div>

  <aside class="side">
    {#if chosen}
      <section class="sum" aria-live="polite" data-summary>
        <p class="sl"><span class="n num" aria-hidden="true">4</span>{t("offers.summary.label")}</p>
        <p class="st"><b>{name(chosen)}</b> · {billing === "month" ? t("offers.billing.month") : t("offers.billing.year")} · <span class="num">{eur(price(chosen))} {per}</span></p>
        <dl class="kv">
          <div><dt>{t("offers.means.title")}</dt><dd>{t(`offers.means.${means}`)}</dd></div>
          <div><dt>{t("offers.summary.total")}</dt><dd class="tot num">{eur(price(chosen))} <span>{per}</span></dd></div>
        </dl>
        <p class="sn">{means === "crypto" ? t("offers.summary.crypto") : billing === "month" ? t("offers.summary.month") : t("offers.summary.year")}</p>
        <button type="button" class="go" disabled aria-describedby="{uid}-wait">{t("offers.continue")}</button>
        <p id="{uid}-wait" class="wait" data-wait>{t("offers.continue.wait")}</p>
      </section>
    {:else}
      <div class="sum empty">
        <p class="sl"><span class="n num" aria-hidden="true">4</span>{t("offers.summary.label")}</p>
        <p class="sn"><Timer size={16} strokeWidth={2} aria-hidden="true" />{t("offers.summary.pick")}</p>
      </div>
    {/if}
  </aside>
</div>

<style>
  .co {
    display: grid;
    gap: var(--sp-6);
    align-items: start;
  }
  @media (min-width: 1024px) {
    .co {
      grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
      column-gap: var(--sp-7);
    }
    .side {
      position: sticky;
      inset-block-start: 96px;
    }
  }
  .main {
    display: grid;
    gap: var(--sp-6);
    min-width: 0;
  }
  .blk {
    display: grid;
    gap: var(--sp-4);
    padding-block-start: var(--sp-5);
    border-block-start: 1px dashed rgb(150 175 255 / 0.22);
  }
  .blk:first-child {
    border-block-start: 0;
    padding-block-start: 0;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: 0;
    font-size: var(--fs-h3);
    letter-spacing: -0.01em;
  }
  .n {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: rgb(95 227 181 / 0.12);
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    font-weight: 700;
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  .sub {
    margin: 0;
    color: var(--text);
    font-weight: 600;
  }
  .tiers {
    display: grid;
    gap: var(--sp-3);
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  }
  .card {
    display: grid;
    align-content: start;
    gap: var(--sp-2);
    padding: var(--sp-4);
    border-radius: var(--r-lg);
    background: var(--surface-1);
    box-shadow: inset 0 0 0 1px var(--hair-2);
    transition: box-shadow var(--dur-fast) var(--ease-out);
  }
  .card:not(.free) {
    outline: 1px dashed rgb(150 175 255 / 0.28);
    outline-offset: -1px;
    box-shadow: none;
  }
  .card.on {
    outline: 0;
    box-shadow: inset 0 0 0 2px var(--accent), 0 16px 40px -24px rgb(95 227 181 / 0.6);
  }
  .nm {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
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
    background: rgb(95 227 181 / 0.12);
    color: var(--accent);
    font-size: var(--fs-micro);
    font-weight: 600;
  }
  .big {
    margin: 0;
    line-height: 1;
  }
  .bv {
    font-size: clamp(2rem, 1.6rem + 1.4vw, 2.75rem);
    font-weight: 800;
    letter-spacing: -0.03em;
  }
  .bu {
    color: var(--text-2);
    font-size: var(--fs-small);
  }
  .pr {
    margin: 0;
  }
  .pv {
    font-weight: 700;
  }
  .pu {
    color: var(--text-2);
    font-size: var(--fs-small);
  }
  .dt {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--fs-small);
  }
  .dt li {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-2);
  }
  .dk {
    color: var(--text-2);
  }
  .dv {
    font-weight: 600;
  }
  .pick {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    min-height: 44px;
    margin-block-start: var(--sp-2);
    border-radius: var(--r-md);
    background: var(--surface-2);
    color: var(--text);
    font-weight: 600;
    cursor: pointer;
  }
  .card.on .pick {
    background: var(--accent);
    color: var(--on-accent);
  }
  .pick input,
  .billing input,
  .mn input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .pick:has(input:focus-visible),
  .billing label:has(input:focus-visible),
  .mn:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .billing {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-2);
    max-width: 30rem;
  }
  .billing label {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    min-height: 52px;
    padding: var(--sp-2) var(--sp-4);
    border-radius: var(--r-md);
    outline: 1px dashed rgb(150 175 255 / 0.28);
    outline-offset: -1px;
    font-weight: 600;
    cursor: pointer;
  }
  .billing label.on {
    outline: 0;
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .gift {
    padding: 1px 8px;
    border-radius: var(--r-pill);
    box-shadow: inset 0 0 0 1px rgb(95 227 181 / 0.5);
    color: var(--accent);
    font-size: var(--fs-micro);
  }
  .adds ul {
    display: grid;
    gap: 0;
    margin: var(--sp-2) 0 0;
    padding: 0;
    list-style: none;
  }
  .adds li {
    padding: var(--sp-2) 0;
    border-block-end: 1px solid var(--hair);
    color: var(--text-2);
    font-size: var(--fs-small);
  }
  .same {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: var(--sp-3) 0 0;
    color: var(--text-2);
    font-size: var(--fs-small);
  }
  .same :global(svg) {
    color: var(--accent);
  }
  .ttc,
  .note {
    margin: 0;
    color: var(--text-3);
    font-size: var(--fs-small);
  }
  .means {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
    gap: var(--sp-2);
  }
  .mn {
    position: relative;
    display: grid;
    gap: 2px;
    min-height: 76px;
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--r-md);
    outline: 1px dashed rgb(150 175 255 / 0.28);
    outline-offset: -1px;
    cursor: pointer;
  }
  .mn.on {
    outline: 0;
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .mt {
    font-weight: 650;
  }
  .ms {
    color: var(--text-2);
    font-size: var(--fs-small);
  }
  /* Récapitulatif : la carte claire de la maquette, en verre clair sur le fond sombre. */
  .sum {
    display: grid;
    gap: var(--sp-3);
    padding: var(--sp-5);
    border-radius: var(--r-xl);
    background: linear-gradient(180deg, rgb(255 255 255 / 0.07), rgb(255 255 255 / 0.03));
    box-shadow: inset 0 0 0 1px rgb(150 175 255 / 0.2), 0 30px 70px -40px rgb(0 0 0 / 0.8);
  }
  .sl {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    font-size: var(--fs-h3);
    font-weight: 700;
  }
  .st {
    margin: 0;
  }
  .kv {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding-block-start: var(--sp-3);
    border-block-start: 1px dashed rgb(150 175 255 / 0.25);
  }
  .kv div {
    display: grid;
    gap: 2px;
  }
  dt {
    color: var(--text-3);
    font-size: var(--fs-micro);
  }
  dd {
    margin: 0;
    font-weight: 600;
  }
  .tot {
    font-size: 2rem;
    font-weight: 800;
  }
  .tot span {
    color: var(--text-2);
    font-size: var(--fs-small);
    font-weight: 500;
  }
  .sn {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--text-2);
    font-size: var(--fs-small);
  }
  .go {
    min-height: 52px;
    border: 0;
    border-radius: var(--r-pill);
    background: var(--surface-3);
    color: var(--text-2);
    font: inherit;
    font-weight: 650;
  }
  .wait {
    margin: 0;
    color: var(--text-3);
    font-size: var(--fs-micro);
  }
  .empty {
    background: transparent;
    outline: 1px dashed rgb(150 175 255 / 0.25);
    outline-offset: -1px;
  }
</style>
