<script lang="ts">
  // Accueil, sous la carte de dépôt (refonte du 12 novembre) : « Comment ça marche » (trois
  // cartes), « Pensé pour la confidentialité » (quatre cartes) et « Offres » (Gratuit, Plus, Pro,
  // valeurs lues dans limits.ts par OffersStrip). Cartes à tuile d'icône teintée, marquée de la
  // trame du logo (trois points qui s'allument au survol) ; apparition au défilement (reveal),
  // jamais en mouvement réduit.
  import { followLink, href } from "../../app/router.svelte";
  import { getLang, t, type Key } from "../../i18n/i18n.svelte";
  import { limitParams } from "../../i18n/limit-params";
  import { reveal } from "../../ui/attach";
  import AddIcon from "../../ui/AddIcon.svelte";
  import { ArrowRight, Broom, EyeOff, Link2, Lock, UserX } from "../../ui/Icon";
  import OffersStrip from "../../ui/OffersStrip.svelte";
  import TabIcon from "../../ui/TabIcon.svelte";

  const how = [
    { k: "add", tint: "mint" },
    { k: "seal", tint: "blue" },
    { k: "go", tint: "cyan" },
  ] as const;
  const priv = [
    { k: "account", tint: "mint" },
    { k: "server", tint: "blue" },
    { k: "clean", tint: "cyan" },
    { k: "room", tint: "amber" },
  ] as const;
</script>

<section class="sec how" id="comment" aria-labelledby="how-title">
  <div class="head rv" {@attach reveal}>
    <h2 id="how-title" tabindex="-1">{t("home.how.title")}</h2>
    <p>{t("home.how.lede")}</p>
  </div>
  <!-- Proposition A2 retenue (propriétaire, 18 novembre) : trois cartes, un grand chiffre en
       filigrane, l'icône en haut, le texte en bas ; plus de frise. -->
  <ol class="cards three steps">
    {#each how as c, i (c.k)}
      <li class="hc rv" data-how-card style:--i="{i * 80}ms" {@attach reveal}>
        <span class="big" aria-hidden="true">{i + 1}</span>
        <span class="tile-ic {c.tint}" aria-hidden="true">
          {#if c.k === "add"}<AddIcon id="files" size={22} />{:else if c.k === "seal"}<Lock size={22} strokeWidth={1.8} />{:else}<Link2 size={22} strokeWidth={1.8} />{/if}
        </span>
        <h3><span class="sr-only">{i + 1}. </span>{t(`home.how.${c.k}.t` as Key)}</h3>
        <p>{t(`home.how.${c.k}.p` as Key, limitParams(getLang()))}</p>
      </li>
    {/each}
  </ol>
</section>

<section class="sec priv" aria-labelledby="priv-title">
  <div class="head rv" {@attach reveal}>
    <h2 id="priv-title" tabindex="-1">{t("home.priv.title")}</h2>
    <p>{t("home.priv.lede")}</p>
  </div>
  <ul class="cards four">
    {#each priv as c, i (c.k)}
      <li class={["card", "rv", { soon: c.k === "room" }]} data-priv-card style:--i="{i * 70}ms" {@attach reveal}>
        <span class="tile-ic {c.tint}" aria-hidden="true">
          {#if c.k === "account"}<UserX size={22} strokeWidth={1.8} />{:else if c.k === "server"}<EyeOff size={22} strokeWidth={1.8} />{:else if c.k === "clean"}<Broom size={22} strokeWidth={1.8} />{:else}<TabIcon id="chat" size={22} />{/if}
        </span>
        <h3>{t(`home.priv.${c.k}.t` as Key)}{#if c.k === "room"}{" "}<span class="pill">{t("foot.soon")}</span>{/if}</h3>
        <!-- Avec le compte (__COMPTES__) seulement, la carte dit ce que garde le compte (conception compte §16). -->
        <p>{t((__COMPTES__ && c.k === "account" ? "home.priv.account.p.comptes" : `home.priv.${c.k}.p`) as Key)}</p>
      </li>
    {/each}
  </ul>
  <!-- Plus de ligne sur la clé après le « # » sur l'accueil (décision du 16 novembre) : la page Sécurité le dit. -->
  <a class="more" href={href("/securite")} onclick={(e) => followLink(e, "/securite")}>{t("home.why.more")}<ArrowRight size={18} strokeWidth={1.9} aria-hidden="true" /></a>
</section>

<section class="sec offers" aria-labelledby="offers-title">
  <div class="head rv" {@attach reveal}>
    <h2 id="offers-title">{t("home.offers.title")}</h2>
    <p>{t("home.offers.lede")}</p>
  </div>
  <OffersStrip cards />
</section>

<style>
  .sec {
    position: relative;
    isolation: isolate;
    display: grid;
    justify-items: center;
    gap: var(--sp-7);
    padding-block: 96px 24px;
    scroll-margin-top: 72px;
  }
  /* Ordinateur (propriétaire, 18 novembre) : chaque section est une bande à part, sur toute la
     largeur (100cqw du conteneur #app) : un filet en haut, une lueur douce, et une bande sur
     deux légèrement plus claire. */
  @media (min-width: 1024px) {
    .sec {
      padding-block: 112px 104px;
    }
    .sec::before {
      content: "";
      position: absolute;
      z-index: -1;
      inset-block: 0;
      left: 50%;
      width: 100cqw;
      transform: translateX(-50%);
      border-block-start: 1px solid rgb(150 175 255 / 0.1);
      background: radial-gradient(60% 120px at 50% 0%, rgb(95 227 181 / 0.06), transparent 100%);
      pointer-events: none;
    }
    .sec.priv::before {
      background:
        radial-gradient(60% 120px at 50% 0%, rgb(92 128 255 / 0.08), transparent 100%),
        rgb(255 255 255 / 0.018);
    }
  }
  .head > * {
    max-width: 100%;
  }
  .head {
    display: grid;
    justify-items: center;
    width: 100%;
    gap: var(--sp-3);
    max-width: 40rem;
    text-align: center;
  }
  h2 {
    margin: 0;
    min-width: 0;
    overflow-wrap: break-word;
    font-size: clamp(2rem, 1.4rem + 2vw, 3rem);
    line-height: 1.05;
    font-weight: 700;
    font-stretch: 112%;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }
  h2:focus {
    outline: none;
  }
  .head p {
    margin: 0;
    color: #aab6d3;
    font-size: 1.0625rem;
    line-height: 1.55;
    text-wrap: pretty;
  }
  .cards {
    display: grid;
    gap: var(--sp-4);
    width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .offers :global([data-offer-cards]) {
    width: 100%;
  }
  /* Téléphone (retours du 15 novembre : centrage revu) : les titres de section sont centrés, le
     contenu des cartes l'est aussi (icône, titre, texte) ; sections un peu moins espacées. */
  @media (max-width: 599px) {
    .sec {
      gap: var(--sp-6);
      padding-block: 72px 16px;
    }
    .card {
      justify-items: center;
      text-align: center;
    }
  }
  /* « Comment ça marche » (A2, 18 novembre) : cartes à grand chiffre en filigrane. */
  .steps {
    counter-reset: none;
  }
  .hc {
    position: relative;
    display: grid;
    align-content: end;
    gap: var(--sp-2);
    min-width: 0;
    min-height: 220px;
    padding: var(--sp-5);
    overflow: hidden;
    border-radius: var(--r-xl);
    background: linear-gradient(180deg, rgb(255 255 255 / 0.045), rgb(255 255 255 / 0.012)), rgb(16 22 38 / 0.7);
    box-shadow: inset 0 0 0 1px rgb(150 175 255 / 0.14);
  }
  .big {
    position: absolute;
    inset-block-start: -22px;
    inset-inline-end: 10px;
    color: transparent;
    font-size: 150px;
    font-weight: 800;
    line-height: 1;
    -webkit-text-stroke: 1.5px rgb(95 227 181 / 0.32);
    pointer-events: none;
    user-select: none;
  }
  .hc .tile-ic {
    margin-block-end: var(--sp-2);
  }
  .hc p {
    margin: 0;
    max-width: 34ch;
    color: #aab6d3;
    font-size: 0.9375rem;
    line-height: 1.55;
  }
  @media (min-width: 760px) {
    .three {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .four {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 599px) {
    .hc {
      min-height: 180px;
      justify-items: center;
      text-align: center;
    }
    .big {
      font-size: 120px;
    }
  }
  @media (min-width: 1180px) {
    .four {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  .card {
    position: relative;
    isolation: isolate;
    display: grid;
    align-content: start;
    gap: var(--sp-3);
    min-width: 0;
    padding: 26px 24px 28px;
    border-radius: 20px;
    background: linear-gradient(180deg, rgb(15 22 42 / 0.88), rgb(10 15 30 / 0.88));
    box-shadow:
      inset 0 0 0 1px rgb(150 175 255 / 0.13),
      inset 0 1px 0 rgb(255 255 255 / 0.04);
    transition:
      translate 420ms var(--ease-settle),
      box-shadow var(--dur-base) var(--ease-out);
  }
  /* Lumière du haut, qui s'allume au survol (opacité seulement). */
  .card::before {
    content: "";
    position: absolute;
    z-index: -1;
    inset: 0;
    border-radius: inherit;
    background: radial-gradient(80% 60% at 30% 0%, rgb(95 227 181 / 0.09), transparent 70%);
    opacity: 0;
    transition: opacity var(--dur-base) var(--ease-out);
  }
  @media (hover: hover) {
    .card:hover {
      translate: 0 -3px;
      box-shadow:
        inset 0 0 0 1px rgb(150 175 255 / 0.26),
        inset 0 1px 0 rgb(255 255 255 / 0.06),
        0 24px 48px -28px rgb(0 0 0 / 0.9);
    }
    .card:hover::before {
      opacity: 1;
    }
    .card:hover .tile-ic::after {
      opacity: 1;
    }
  }
  
  .tile-ic {
    position: relative;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    margin-bottom: var(--sp-2);
    border-radius: 14px;
  }
  /* La trame du logo : trois points en coin, qui s'allument au survol. */
  .tile-ic::after {
    content: "";
    position: absolute;
    inset-block-start: 4px;
    inset-inline-end: 4px;
    width: 4px;
    height: 14px;
    background:
      radial-gradient(circle, currentColor 1.2px, transparent 1.6px) 50% 0 / 4px 4px no-repeat,
      radial-gradient(circle, currentColor 1.2px, transparent 1.6px) 50% 5px / 4px 4px no-repeat,
      radial-gradient(circle, currentColor 1.2px, transparent 1.6px) 50% 10px / 4px 4px no-repeat;
    opacity: 0.35;
    transition: opacity var(--dur-base) var(--ease-out);
  }
  .mint {
    background: rgb(95 227 181 / 0.12);
    box-shadow: inset 0 0 0 1px rgb(95 227 181 / 0.22);
    color: var(--accent);
  }
  .blue {
    background: rgb(92 128 255 / 0.15);
    box-shadow: inset 0 0 0 1px rgb(92 128 255 / 0.3);
    color: #9db4ff;
  }
  .cyan {
    background: rgb(62 193 245 / 0.12);
    box-shadow: inset 0 0 0 1px rgb(62 193 245 / 0.26);
    color: #7fd6f8;
  }
  .amber {
    background: rgb(245 185 64 / 0.12);
    box-shadow: inset 0 0 0 1px rgb(245 185 64 / 0.26);
    color: #f5c96b;
  }
  h3 {
    margin: 0;
    font-size: 1.1875rem;
    line-height: 1.3;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .card p {
    margin: 0;
    color: #aab6d3;
    font-size: 0.9375rem;
    line-height: 1.55;
  }
  .pill {
    display: inline-block;
    margin-inline-start: 4px;
    padding: 1px 8px;
    border-radius: var(--r-pill);
    background: rgb(95 227 181 / 0.1);
    box-shadow: inset 0 0 0 1px rgb(95 227 181 / 0.28);
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 600;
    vertical-align: 2px;
  }
  .more {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-height: 44px;
    color: var(--text);
    font-weight: 600;
    text-decoration: none;
  }
  .more :global(svg) {
    color: var(--accent);
    transition: transform 420ms var(--ease-settle);
  }
  .more:hover :global(svg) {
    transform: translateX(4px);
  }
  .more:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 6px;
  }
  @media (max-width: 599px) {
    .sec {
      padding-block-start: 72px;
      gap: var(--sp-6);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .card,
    .card::before,
    .tile-ic::after,
    .more :global(svg) {
      transition: none;
    }
    .card:hover,
    .more:hover :global(svg) {
      translate: none;
      transform: none;
    }
  }
  @media (forced-colors: active) {
    .card {
      border: 1px solid CanvasText;
    }
    .card::before,
    .tile-ic::after {
      display: none;
    }
  }
</style>
