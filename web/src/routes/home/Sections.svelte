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
  import { scramble } from "../../ui/decor";
  import { ArrowRight, Broom, EyeOff, Lock, UserX } from "../../ui/Icon";
  import OffersStrip from "../../ui/OffersStrip.svelte";
  import TabIcon from "../../ui/TabIcon.svelte";

  const how = [
    { k: "add", tint: "mint" },
    { k: "seal", tint: "blue" },
    { k: "go", tint: "cyan" },
  ] as const;
  // Panneau « en clair | chiffré » (19 novembre) : exemples, jamais des données de la personne.
  const rows = $derived([
    { k: "a", a: "vacances.jpg", b: "3,2 Mo", note: false },
    { k: "b", a: "contrat-signé.pdf", b: "184 Ko", note: false },
    { k: "c", a: t("home.how.voice"), b: "0:42", note: false },
    { k: "d", a: t("home.how.note1"), b: "", note: true },
    { k: "e", a: t("home.how.note2"), b: "", note: true },
  ]);
  // Le balayage ne tourne que si le panneau est à l'écran et l'onglet visible (ambiance).
  let sealOn = $state(false);
  function watchSeal(node: HTMLElement) {
    if (typeof IntersectionObserver === "undefined") return;
    let seen = false;
    const set = () => (sealOn = seen && !document.hidden);
    const io = new IntersectionObserver(([e]) => {
      seen = e!.isIntersecting;
      set();
    });
    io.observe(node);
    document.addEventListener("visibilitychange", set);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", set);
    };
  }
  const priv = [
    { k: "account", tint: "mint" },
    { k: "server", tint: "blue" },
    { k: "clean", tint: "cyan" },
    { k: "room", tint: "amber" },
  ] as const;
</script>

<section class="sec how band" style:--tone="95 227 181" id="comment" aria-labelledby="how-title">
  <div class="head rv" {@attach reveal}>
    <h2 id="how-title" tabindex="-1">{t("home.how.title")}</h2>
    <p>{t("home.how.lede")}</p>
  </div>
  <!-- Reprise de « Le chiffré » (propriétaire, 19 novembre), améliorée : un panneau « en clair |
       chiffré » ; une ligne menthe le balaie et transforme sur son passage les noms de fichiers et la
       note en texte chiffré, puis revient. Décor seulement (texte brouillé à graine fixe, decor.ts),
       caché aux lecteurs d'écran ; les trois étapes dessous portent le sens. -->
  <div class={["seal", "rv", { run: sealOn }]} aria-hidden="true" data-ambient {@attach reveal} {@attach watchSeal}>
    <div class="sl-head">
      <span>{t("home.how.clear")}</span>
      <span class="sl-badge"><Lock size={12} strokeWidth={2.4} />{t("home.how.sealed")}</span>
      <span>{t("home.how.cipher")}</span>
    </div>
    <div class="sl-body">
      <div class="sl-layer clear">
        {#each rows as r (r.k)}<p class={["sl-row", { note: r.note }]}><span>{r.a}</span>{#if r.b}<span class="num">{r.b}</span>{/if}</p>{/each}
      </div>
      <div class="sl-layer ciph">
        {#each rows as r, i (r.k)}<p class={["sl-row", { note: r.note }]}><span>{scramble(r.a, 1, 0x51 + i * 7)}</span>{#if r.b}<span class="num">{scramble(r.b, 1, 0x91 + i * 5)}</span>{/if}</p>{/each}
      </div>
      <span class="sl-line"></span>
    </div>
  </div>
  <ol class="steps3">
    {#each how as c, i (c.k)}
      <li class="st rv" data-how-card style:--i="{i * 80}ms" {@attach reveal}>
        <span class="n num" aria-hidden="true">{i + 1}</span>
        <div>
          <h3><span class="sr-only">{i + 1}. </span>{t(`home.how.${c.k}.t` as Key)}</h3>
          <p>{t(`home.how.${c.k}.p` as Key, limitParams(getLang()))}</p>
        </div>
      </li>
    {/each}
  </ol>
</section>

<section class="sec priv band" style:--tone="92 128 255" aria-labelledby="priv-title">
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

<section class="sec offers band" style:--tone="70 205 235" aria-labelledby="offers-title">
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
  /* Bandes (18 novembre) : voir .band dans ui/base.css ; chaque section a sa teinte. */
  @media (min-width: 1024px) {
    .sec {
      padding-block: 120px 112px;
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
  /* « Comment ça marche » (19 novembre) : panneau en clair | chiffré balayé par une ligne. */
  .seal {
    width: 100%;
    max-width: 920px;
    border-radius: var(--r-xl);
    background: rgb(8 12 20 / 0.75);
    box-shadow: inset 0 0 0 1px rgb(150 175 255 / 0.16), 0 30px 80px -40px rgb(0 0 0 / 0.8);
    overflow: hidden;
  }
  .sl-head {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    justify-content: space-between;
    align-items: center;
    padding: var(--sp-3) var(--sp-5);
    color: var(--text-3);
    font-family: var(--font-mono);
    font-size: var(--fs-micro);
    border-block-end: 1px solid rgb(150 175 255 / 0.08);
  }
  .sl-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: var(--r-pill);
    background: var(--accent);
    color: var(--on-accent);
    font-family: var(--font-sans);
    font-weight: 700;
  }
  .sl-body {
    --x: 50%;
    position: relative;
    overflow: hidden;
    display: grid;
    padding: var(--sp-5) var(--sp-5) var(--sp-6);
    font-family: var(--font-mono);
    font-size: clamp(0.8125rem, 0.7rem + 0.4vw, 1.0625rem);
  }
  .sl-layer {
    grid-area: 1 / 1;
    display: grid;
    gap: 10px;
    justify-self: center;
    width: min(100%, 34em);
  }
  .sl-row {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-4);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
  }
  .clear {
    color: var(--text);
    clip-path: inset(0 calc(100% - var(--x)) 0 0);
  }
  .ciph {
    color: var(--accent);
    opacity: 0.85;
    clip-path: inset(0 0 0 var(--x));
    text-shadow: 0 0 10px rgb(95 227 181 / 0.35);
  }
  .clear .sl-row:nth-child(4) {
    margin-block-start: var(--sp-3);
  }
  .ciph .sl-row:nth-child(4) {
    margin-block-start: var(--sp-3);
  }
  .sl-line {
    position: absolute;
    inset-block: 0;
    left: var(--x);
    width: 2px;
    background: var(--accent);
    box-shadow: 0 0 18px 2px rgb(95 227 181 / 0.55);
  }
  @property --x {
    syntax: "<percentage>";
    inherits: true;
    initial-value: 50%;
  }
  @media (prefers-reduced-motion: no-preference) {
    .sl-body {
      animation: sweep 7s var(--ease-in-out) infinite alternate;
      animation-play-state: paused;
    }
    .run .sl-body {
      animation-play-state: running;
    }
  }
  @keyframes sweep {
    0%,
    8% {
      --x: 104%;
    }
    92%,
    100% {
      --x: -4%;
    }
  }
  .steps3 {
    display: grid;
    gap: var(--sp-5);
    width: 100%;
    max-width: 920px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .st {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--sp-3);
    align-items: start;
  }
  .st .n {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    background: rgb(95 227 181 / 0.12);
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 0.875rem;
    font-weight: 700;
  }
  .st h3 {
    margin: 0 0 4px;
  }
  .st p {
    margin: 0;
    color: #aab6d3;
    font-size: 0.9375rem;
    line-height: 1.55;
  }
  @media (min-width: 760px) {
    .steps3 {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (min-width: 760px) {
    .four {
      grid-template-columns: repeat(2, minmax(0, 1fr));
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
