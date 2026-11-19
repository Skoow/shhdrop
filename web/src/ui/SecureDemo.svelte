<script lang="ts">
  // Infographie de l'accueil (refonte du 12 novembre) : ce qui se passe quand on partage, en
  // sept étapes, dans un petit écran. Dessin SVG maison, animé en CSS (transform et opacité
  // seulement) ; un seul minuteur, arrêté hors écran, onglet caché, au survol, au focus, et par
  // le bouton pause (WCAG 2.2.2). Mouvement réduit : storyboard statique, aucun minuteur.
  // Textes vrais (spec §1) : le serveur garde un bloc chiffré et une taille arrondie, jamais le
  // nom, le mot de passe ni l'adresse IP ; tout est effacé après ouverture ou à l'échéance.
  // Le brouillé est décoratif (decor.ts : générateur à graine fixe, jamais de crypto).
  import { t, type Key } from "../i18n/i18n.svelte";
  import { Lock, Pause, Play } from "./Icon";
  import { cipherText, rng } from "./decor";
  import { PAUSE, STEP_MS, STEPS, TYPE_MS } from "./demo-steps";

  const uid = $props.id();

  // Mouvement réduit, relu si la préférence change pendant la visite.
  const mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  let reduced = $state(mq?.matches === true);
  $effect(() => {
    if (!mq?.addEventListener) return;
    const on = () => (reduced = mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  });

  let step = $state(1);
  let userPaused = $state(false);
  let hover = $state(false);
  let focused = $state(false);
  let onscreen = $state(true);
  let hidden = $state(typeof document !== "undefined" && document.hidden);
  // Démarre seule, et un bouton permet de la mettre en pause (décisions du propriétaire du
  // 16 novembre ; WCAG 2.2.2). S'arrête aussi hors écran, onglet caché, sous la souris ou au focus. Le « survol » ne
  // compte qu'à la souris : sur un écran tactile, toucher ou faire défiler émet un pointerenter
  // sans pointerleave, et l'animation restait arrêtée jusqu'à ce qu'on touche ailleurs (iPhone).
  const playing = $derived(!reduced && !userPaused && !hover && !focused && onscreen && !hidden);
  // Storyboard du mouvement réduit : l'étape qui résume tout (rien de lisible sur le serveur).
  const shown = $derived(reduced ? 4 : step);

  $effect(() => {
    if (!playing) return;
    const now = step; // relu à chaque étape : un minuteur par étape
    const timer = setTimeout(() => {
      step = now === STEPS.length ? 1 : now + 1;
      typed = 0; // la frappe de l'étape suivante repart du début
    }, STEP_MS);
    return () => clearTimeout(timer);
  });

  let root: HTMLElement | undefined = $state();
  // Pause/lecture : l'état affiché est l'état réel (arrêtée au survol ou au focus aussi) ;
  // « Lire » relance même sous le pointeur ou le focus, jusqu'à ce qu'ils reviennent.
  function toggle() {
    if (playing) userPaused = true;
    else {
      userPaused = false;
      hover = false;
      focused = false;
    }
  }
  $effect(() => {
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => (onscreen = e!.isIntersecting));
    io.observe(root);
    return () => io.disconnect();
  });

  function focusOut(e: FocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (!next || !root?.contains(next)) focused = false;
  }

  // Décor : brouillé et poussière à graine fixe.
  const cipher = cipherText(0x5eed, 9, 5).split("\n");
  const r = rng(0xd157);
  const dust = Array.from({ length: 18 }, (_, i) => ({
    x: 176 + (i % 6) * 9.6,
    y: 78 + Math.floor(i / 6) * 14,
    dx: Math.round((r() - 0.3) * 60),
    dy: Math.round(-20 - r() * 50),
    d: Math.round(r() * 420),
  }));
  const at = (n: number, ...steps: number[]) => steps.includes(n);

  // Journal façon terminal (décision du propriétaire du 16 novembre) : une ligne courte par étape,
  // derrière une invite (« $ », « ! » pour l'attaquant), puis son état à droite ; quatre lignes au
  // plus à l'écran. Frappe en JavaScript (18 novembre) : UN seul curseur, qui tape le texte lettre
  // par lettre (il passe à la ligne si la place manque, aucun mot n'est coupé), puis l'état, puis
  // descend à la ligne suivante ; à la fin, il reste et clignote au bout de la dernière ligne. La
  // ligne de l'attaquant (« late ») commence un court instant après celle de l'étape.
  type Line = { n: number; text: Key; st: Key; tone: "ok" | "atk" | "end"; late?: boolean };
  const LOG: Line[] = [
    { n: 1, text: "demo.log.drop", st: "demo.st.ready", tone: "ok" },
    { n: 2, text: "demo.log.seal", st: "demo.st.ok", tone: "ok" },
    { n: 3, text: "demo.log.send", st: "demo.st.ok", tone: "ok" },
    { n: 3, text: "demo.log.intercept", st: "demo.unreadable", tone: "atk", late: true },
    { n: 4, text: "demo.log.server", st: "demo.unreadable", tone: "ok" },
    { n: 4, text: "demo.log.search", st: "demo.st.nothing", tone: "atk", late: true },
    { n: 5, text: "demo.log.link", st: "demo.st.ok", tone: "ok" },
    { n: 6, text: "demo.log.open", st: "demo.st.decrypted", tone: "ok" },
    { n: 7, text: "demo.log.erase", st: "demo.st.done", tone: "end" },
  ];
  /** Lettres tapées depuis le début de l'étape (une toutes les TYPE_MS, seulement en lecture). */
  let typed = $state(0);
  type Row = { key: string; tone: Line["tone"]; text: string[]; st: string[]; start: number; full: boolean };
  // Lignes visibles et, pour celles de l'étape courante, la lettre où leur frappe commence.
  const rows = $derived.by((): Row[] => {
    let at = 0;
    const all = LOG.filter((l) => l.n <= shown).map((l): Row => {
      const text = [...t(l.text)];
      const st = [...`${l.tone === "atk" ? "✕" : "✓"} ${t(l.st)}`];
      if (l.n < shown) return { key: l.text, tone: l.tone, text, st, start: 0, full: true };
      if (l.late) at += PAUSE;
      const row = { key: l.text, tone: l.tone, text, st, start: at, full: false };
      at += text.length + st.length;
      return row;
    });
    return all.slice(-4);
  });
  /** Fin de la frappe de l'étape (en lettres) : le minuteur s'arrête là. */
  const total = $derived(rows.reduce((m, r) => (r.full ? m : Math.max(m, r.start + r.text.length + r.st.length)), 0));
  $effect(() => {
    if (!playing || typed >= total) return;
    const id = setTimeout(() => (typed += 1), TYPE_MS);
    return () => clearTimeout(id);
  });
  /** Ce qui est tapé d'une ligne, et où est le curseur (« t » texte, « s » état, null ailleurs). */
  function shownOf(r: Row, last: boolean) {
    const k = r.full ? Infinity : typed - r.start;
    const nt = Math.max(0, Math.min(r.text.length, k));
    const ns = Math.max(0, Math.min(r.st.length, k - r.text.length));
    const typing = !r.full && k >= 0 && k < r.text.length + r.st.length;
    const cur = typing ? (k < r.text.length ? "t" : "s") : last && (r.full || k >= r.text.length + r.st.length) ? "s" : null;
    return { text: r.text.slice(0, nt).join(""), st: r.st.slice(0, ns).join(""), cur, visible: r.full || k >= 0, idle: !typing };
  }
</script>

<svelte:document onvisibilitychange={() => (hidden = document.hidden)} />

<!-- Cadre « figure » : coins marqués, légende Fig. 01 dessous. -->
<figure class="fig">
<div class="frame">
<div
  bind:this={root}
  class={["demo", { board: reduced, paused: !playing && !reduced }]}
  data-demo
  data-ambient
  data-step={shown}
  role="group"
  aria-labelledby="{uid}-t"
  onfocusin={() => (focused = true)}
  onfocusout={focusOut}
>
  <div class="bar">
    <span class="lights" aria-hidden="true"><i></i><i></i><i></i></span>
    <h3 class="sr-only" id="{uid}-t">{t("demo.title")}</h3>
    <span class="bar-t" aria-hidden="true">{t("demo.bar")}</span>
  </div>

  <!-- Survol de la scène ou du journal : arrêt ; la barre du bas (pause, lecture) n'arrête rien. -->
  <div class="view" role="presentation" data-demo-view onpointerenter={(e) => (hover = e.pointerType === "mouse")} onpointerleave={() => (hover = false)}>
  <div class="stage" aria-hidden="true">
    <svg viewBox="0 22 400 206" focusable="false">
      <defs>
        <linearGradient id="{uid}-wire" x1="0" x2="1">
          <stop offset="0" stop-color="currentColor" stop-opacity="0.05" />
          <stop offset="0.5" stop-color="currentColor" stop-opacity="0.35" />
          <stop offset="1" stop-color="currentColor" stop-opacity="0.05" />
        </linearGradient>
      </defs>

      <!-- Balayage de l'étape 2 (reprise de « La trame », 19 novembre) : une ligne menthe descend sur
           l'écran ; au-dessus d'elle le chiffré, au-dessous la photo encore lisible. -->
      <clipPath id="{uid}-above"><rect class={["scanr", "up", { go: shown === 2, done: shown > 2 && shown < 7 }]} x="24" y="52" width="84" height="104" /></clipPath>
      <clipPath id="{uid}-below"><rect class={["scanr", "down", { go: shown === 2, done: shown > 2 && shown < 7 }]} x="24" y="52" width="84" height="104" /></clipPath>

      <!-- Liaisons -->
      <path class="wire" d="M108 106H158M242 106H292" stroke="url(#{uid}-wire)" />

      <!-- Vous -->
      <g class="node">
        <text class="lbl" x="66" y="40">{t("demo.you")}</text>
        <rect class="dev" x="24" y="52" width="84" height="104" rx="14" />
        <!-- Écran d'appareil (18 novembre) : encoche en haut, barre du bas. -->
        <rect class="notch" x="56" y="57" width="20" height="3" rx="1.5" />
        <rect class="home-bar" x="54" y="149" width="24" height="2" rx="1" />
        <g class={["photo", { on: at(shown, 1, 2) }]} clip-path="url(#{uid}-below)">
          <rect x="40" y="70" width="52" height="40" rx="6" class="ph-bg" />
          <circle cx="80" cy="80" r="5" class="ph-sun" />
          <path d="M42 108l16-18 10 10 8-7 14 15z" class="ph-hill" />
          <text class="fname" x="66" y="128">photo.jpg</text>
        </g>
        <g class={["cipher", { on: at(shown, 2, 3, 4, 5, 6) }]} clip-path="url(#{uid}-above)">
          {#each cipher as line, i (i)}<text class="mono" x="66" y={76 + i * 11}>{line}</text>{/each}
          <text class="fname x" x="66" y="138">Xq9#7b.z</text>
        </g>
        <rect class={["scan", { go: shown === 2 }]} x="26" y="52" width="80" height="2" rx="1" />
        <g class={["sent", { on: at(shown, 7) }]}>
          <circle cx="66" cy="96" r="13" />
          <path d="M60 96.5l4 4 8-8.5" />
          <text x="66" y="128">{t("demo.st.sent")}</text>
        </g>
        <g transform="translate(100 56)">
          <g class={["lock", { on: at(shown, 2, 3, 4, 5, 6) }]}>
            <circle r="11" class="lock-bg" />
            <path class="lock-shackle" d="M-4 -1v-3a4 4 0 0 1 8 0v3" />
            <rect x="-5.5" y="-1" width="11" height="8" rx="2" class="lock-body" />
          </g>
        </g>
      </g>

      <!-- Paquet chiffré vers le serveur, puis vers le destinataire -->
      <g class={["packet", "to-server", { on: at(shown, 3) }]}>
        {#each [0, 1, 2, 3, 4, 5] as k (k)}<rect x={112 + (k % 3) * 7} y={99 + Math.floor(k / 3) * 7} width="5" height="5" rx="1" />{/each}
      </g>
      <g class={["packet", "to-peer", { on: at(shown, 6) }]}>
        {#each [0, 1, 2, 3, 4, 5] as k (k)}<rect x={246 + (k % 3) * 7} y={99 + Math.floor(k / 3) * 7} width="5" height="5" rx="1" />{/each}
      </g>

      <!-- Serveur -->
      <g class="node">
        <text class="lbl" x="200" y="40">{t("demo.server")}</text>
        <rect class={["srv", { gone: at(shown, 7) }]} x="158" y="52" width="84" height="104" rx="12" />
        <g class="leds"><circle cx="170" cy="63" r="2" /><circle cx="177" cy="63" r="2" /><circle cx="184" cy="63" r="2" /></g>
        <!-- Baies du serveur (18 novembre) : trois emplacements vides, que les blocs chiffrés remplissent. -->
        <g class={["slots", { off: at(shown, 7) }]}>
          {#each [0, 1, 2] as k (k)}<rect x="172" y={74 + k * 14} width="56" height="10" rx="3" />{/each}
        </g>
        <g class={["blocks", { on: at(shown, 4, 5, 6) }]}>
          {#each [0, 1, 2] as k (k)}<rect x="172" y={74 + k * 14} width="56" height="10" rx="3" />{/each}
        </g>
        <g class={["chip", "unread", { on: at(shown, 4, 5, 6) }]}>
          <rect x="168" y="124" width="64" height="18" rx="9" />
          <text x="200" y="136.5">{t("demo.unreadable")}</text>
        </g>
        <g class={["dust", { on: at(shown, 7) }]}>
          {#each dust as p, i (i)}<rect x={p.x} y={p.y} width="5" height="5" rx="1" style:--dx="{p.dx}px" style:--dy="{p.dy}px" style:--dl="{p.d}ms" />{/each}
        </g>
        <text class={["nothing", { on: at(shown, 7) }]} x="200" y="108">{t("demo.empty")}</text>
      </g>

      <!-- Destinataire -->
      <g class="node">
        <text class="lbl" x="334" y="40">{t("demo.to")}</text>
        <rect class="dev" x="292" y="52" width="84" height="104" rx="14" />
        <rect class="notch" x="324" y="57" width="20" height="3" rx="1.5" />
        <rect class="home-bar" x="322" y="149" width="24" height="2" rx="1" />
        <!-- Avant l'ouverture : l'appareil attend le lien et le mot de passe. -->
        <g class={["wait", { on: at(shown, 1, 2, 3, 4, 5) }]}>
          <rect x="324" y="86" width="20" height="15" rx="3.5" />
          <path d="M328.5 86v-3.5a5.5 5.5 0 0 1 11 0V86" />
          <text x="334" y="122">{t("demo.st.waiting")}</text>
        </g>
        <g class={["photo", "peer", { on: at(shown, 6) }]}>
          <rect x="308" y="70" width="52" height="40" rx="6" class="ph-bg" />
          <circle cx="348" cy="80" r="5" class="ph-sun" />
          <path d="M310 108l16-18 10 10 8-7 14 15z" class="ph-hill" />
          <text class="fname" x="334" y="128">photo.jpg</text>
        </g>
        <g transform="translate(368 56)">
          <g class={["lock", "open", { on: at(shown, 6) }]}>
            <circle r="11" class="lock-bg" />
            <path class="lock-shackle" d="M-4 -1v-3a4 4 0 0 1 8 -1" />
            <rect x="-5.5" y="-1" width="11" height="8" rx="2" class="lock-body" />
          </g>
        </g>
      </g>

      <!-- Lien et mot de passe : chez vous, puis au destinataire, jamais par le serveur -->
      <g class={["keys", { on: at(shown, 5, 6), there: at(shown, 6) }]}>
        <g class="kchip link"><rect x="22" y="174" width="88" height="20" rx="10" /><text x="66" y="187.5">{t("demo.link")} #…</text></g>
        <g class="kchip pw"><rect x="22" y="200" width="88" height="20" rx="10" /><text x="66" y="213.5">{t("demo.pw")}</text></g>
      </g>

      <!-- L'attaquant repart bredouille -->
      <g class={["thief", "wire-t", { on: at(shown, 3) }]} transform="translate(133 194)">
        {@render hood()}
        <text class="huh" x="0" y="-28">?</text>
        <g class="bubble"><rect x="18" y="-34" width="56" height="20" rx="10" /><text x="46" y="-20">x9#/=Q</text></g>
      </g>
      <g class={["thief", "srv-t", { on: at(shown, 4, 7), done: at(shown, 7) }]} transform="translate(178 198)">
        {@render hood()}
        <g class={["tags", { on: at(shown, 4) }]}>
          <text x="20" y="-14">✕ {t("demo.noname")}</text>
          <text x="20" y="0">✕ {t("demo.nopw")}</text>
          <text x="20" y="14">✕ {t("demo.noip")}</text>
        </g>
      </g>
    </svg>
  </div>

  <!-- Journal : une ligne (ou deux, quand l'attaquant passe) par étape, la dernière avec son
       curseur ; seules les dernières restent à l'écran. Visuel seulement : la liste des étapes
       ci-dessous est lue en entier par le lecteur d'écran, sans rien annoncer à chaque ligne. -->
  {#if !reduced}
    <ol class="log" aria-hidden="true">
      {#each rows as r, i (r.key)}
        {@const v = shownOf(r, i === rows.length - 1)}
        {#if v.visible}
          <li class={["ln", r.tone, { last: i === rows.length - 1 }]} style:--m={r.st.length}>
            <span class="li-ic">{r.tone === "atk" ? "!" : "$"}</span>
            <span class="li-t">{v.text}{#if v.cur === "t"}<span class="cur"></span>{/if}</span>
            <span class="li-s">{v.st}{#if v.cur === "s"}<span class={["cur", { idle: v.idle }]}></span>{/if}</span>
          </li>
        {/if}
      {/each}
    </ol>
  {/if}
  </div>
  <div class="info">
    <span class="info-t" aria-hidden="true"><Lock size={12} strokeWidth={2.2} />{t("demo.info")}</span>
    {#if !reduced}
      <button type="button" class="toggle" data-demo-toggle aria-label={playing ? t("demo.pause") : t("demo.play")} onclick={toggle}>
        {#if !playing}<Play size={14} strokeWidth={2.2} aria-hidden="true" />{:else}<Pause size={14} strokeWidth={2.2} aria-hidden="true" />{/if}
      </button>
    {/if}
  </div>
  <ol class={["steps", { "sr-only": !reduced }]} data-demo-steps>
    {#each STEPS as n (n)}
      <li><span class="st">{t(`demo.s${n}.t` as "demo.s1.t")}</span> <span class="sd">{t(`demo.s${n}.d` as "demo.s1.d")}</span></li>
    {/each}
  </ol>
</div>
</div>

<!-- Plus de légende « Fig. 01 » (17 novembre). -->
</figure>



{#snippet hood()}
  <g class="hood">
    <path class="cloak" d="M-15 18c0-12 5-20 15-20s15 8 15 20z" />
    <path class="cowl" d="M0 -22c-9 0-14 7-14 15 0 5 2 9 5 11h18c3-2 5-6 5-11 0-8-5-15-14-15z" />
    <ellipse class="face" cx="0" cy="-5" rx="7.5" ry="7" />
    <circle class="eye" cx="-3" cy="-6" r="1.4" />
    <circle class="eye" cx="3" cy="-6" r="1.4" />
  </g>
{/snippet}

<style>
  .demo {
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
    --mint: var(--accent);
    --vio: var(--sig-blue);
    position: relative;
    display: grid;
    grid-template-rows: auto auto auto;
    overflow: hidden;
    border-radius: 22px;
    background:
      radial-gradient(120% 80% at 50% 0%, rgb(61 109 255 / 0.12), transparent 60%),
      linear-gradient(180deg, rgb(16 23 44 / 0.92), rgb(9 13 27 / 0.94));
    box-shadow:
      inset 0 0 0 1px rgb(150 175 255 / 0.14),
      inset 0 1px 0 rgb(255 255 255 / 0.06),
      0 40px 80px -40px rgb(0 0 0 / 0.9),
      0 0 0 1px rgb(0 0 0 / 0.4);
    color: var(--text);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid rgb(150 175 255 / 0.1);
    background: rgb(255 255 255 / 0.02);
  }
  .lights {
    display: inline-flex;
    gap: 6px;
  }
  .lights i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: rgb(233 236 242 / 0.16);
  }
  .lights i:first-child {
    background: var(--mint);
    opacity: 0.8;
  }
  .bar-t {
    margin: 0;
    color: var(--text-2);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0;
  }
  .stage {
    padding: 10px 10px 0;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
    color: var(--text-2);
    font-family: var(--font-sans);
  }
  .wire {
    fill: none;
    stroke-width: 1.5;
    stroke-dasharray: 3 4;
  }
  .lbl {
    fill: var(--text-2);
    font-size: 11px;
    font-weight: 600;
    text-anchor: middle;
  }
  .dev,
  .srv {
    fill: rgb(255 255 255 / 0.03);
    stroke: rgb(150 175 255 / 0.22);
    stroke-width: 1;
  }
  .srv {
    transition: stroke 400ms var(--ease-out);
  }
  .srv.gone {
    stroke-dasharray: 4 4;
  }
  .leds circle {
    fill: var(--mint);
    opacity: 0.55;
  }
  /* Balayage : les deux découpes glissent ensemble, la ligne les suit. */
  .scanr {
    transform-box: view-box;
    transition: transform 1700ms var(--ease-in-out) 250ms;
  }
  .scanr.up {
    transform: translateY(-104px);
  }
  .scanr.down {
    transform: translateY(0);
  }
  .scanr.up.go,
  .scanr.up.done {
    transform: translateY(0);
  }
  .scanr.down.go,
  .scanr.down.done {
    transform: translateY(104px);
  }
  .scan {
    fill: var(--mint);
    opacity: 0;
    filter: drop-shadow(0 0 4px rgb(95 227 181 / 0.9));
  }
  .scan.go {
    animation: scan 1700ms var(--ease-in-out) 250ms both;
  }
  @keyframes scan {
    0% {
      opacity: 1;
      transform: translateY(0);
    }
    92% {
      opacity: 1;
      transform: translateY(102px);
    }
    100% {
      opacity: 0;
      transform: translateY(102px);
    }
  }
  .notch,
  .home-bar {
    fill: rgb(150 175 255 / 0.25);
  }
  .slots rect {
    fill: rgb(255 255 255 / 0.02);
    stroke: rgb(150 175 255 / 0.18);
    stroke-width: 0.8;
    stroke-dasharray: 2 2;
  }
  .slots {
    transition: opacity 420ms var(--ease-out);
  }
  .slots.off {
    opacity: 0;
  }
  .wait rect,
  .wait path {
    fill: none;
    stroke: rgb(150 175 255 / 0.45);
    stroke-width: 1.4;
    stroke-linecap: round;
  }
  .wait text,
  .sent text {
    fill: var(--text-2);
    font-family: var(--font-mono);
    font-size: 8.5px;
    text-anchor: middle;
  }
  .sent circle {
    fill: rgb(95 227 181 / 0.14);
    stroke: rgb(95 227 181 / 0.6);
  }
  .sent path {
    fill: none;
    stroke: var(--mint);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .ph-bg {
    fill: #1d3a6b;
  }
  .ph-sun {
    fill: #ffd27a;
  }
  .ph-hill {
    fill: #5fe3b5;
    opacity: 0.85;
  }
  .fname {
    fill: var(--text);
    font-size: 10px;
    font-weight: 600;
    text-anchor: middle;
  }
  .fname.x,
  .mono {
    font-family: var(--font-mono);
  }
  .mono {
    fill: var(--mint);
    font-size: 8.5px;
    text-anchor: middle;
    opacity: 0.85;
  }
  .lock-bg {
    fill: var(--mint);
  }
  .lock-shackle {
    fill: none;
    stroke: #04140e;
    stroke-width: 1.8;
    stroke-linecap: round;
  }
  .lock-body {
    fill: #04140e;
  }

  /* Tout ce qui apparaît : opacité et transformation seulement. */
  .photo,
  .cipher,
  .lock,
  .blocks,
  .chip,
  .nothing,
  .keys,
  .thief,
  .tags,
  .packet,
  .wait,
  .sent {
    opacity: 0;
    transition:
      opacity 420ms var(--ease-out),
      transform 520ms var(--ease-out);
  }
  .on {
    opacity: 1;
  }
  .photo,
  .cipher,
  .blocks,
  .chip,
  .nothing,
  .keys,
  .tags {
    transform-box: fill-box;
    transform-origin: 50% 50%;
  }
  .photo:not(.on) {
    transform: scale(0.94);
  }
  .cipher:not(.on) {
    transform: scale(1.04);
  }
  /* Le cadenas est dessiné autour de l'origine de son groupe : il grandit sur place. */
  .lock {
    transform-box: view-box;
    transform-origin: 0 0;
  }
  .lock:not(.on) {
    scale: 0.4;
  }
  .lock {
    transition:
      opacity 300ms var(--ease-out),
      scale 520ms var(--ease-settle);
  }
  .blocks rect {
    fill: rgb(95 227 181 / 0.18);
    stroke: rgb(95 227 181 / 0.45);
    stroke-width: 0.8;
  }
  .chip rect {
    fill: rgb(95 227 181 / 0.14);
    stroke: rgb(95 227 181 / 0.5);
  }
  .chip text {
    fill: var(--mint);
    font-size: 9.5px;
    font-weight: 650;
    text-anchor: middle;
  }
  .nothing.on {
    transition-delay: 900ms;
  }
  .nothing {
    fill: var(--text-2);
    font-size: 10px;
    font-weight: 600;
    text-anchor: middle;
  }
  .packet rect {
    fill: var(--mint);
  }
  .packet.on {
    animation: travel 1700ms var(--ease-in-out) both;
  }
  @keyframes travel {
    0% {
      transform: translateX(0);
      opacity: 0;
    }
    15% {
      opacity: 1;
    }
    85% {
      opacity: 1;
    }
    100% {
      transform: translateX(40px);
      opacity: 0;
    }
  }
  .dust rect {
    fill: var(--mint);
    opacity: 0;
  }
  .dust.on rect {
    animation: dissolve 1500ms var(--ease-out) var(--dl) both;
  }
  @keyframes dissolve {
    0% {
      opacity: 0.9;
      transform: translate(0, 0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(var(--dx), var(--dy)) scale(0.3);
    }
  }
  .kchip rect {
    fill: rgb(61 109 255 / 0.16);
    stroke: rgb(120 155 255 / 0.55);
  }
  .kchip.pw rect {
    fill: rgb(95 227 181 / 0.12);
    stroke: rgb(95 227 181 / 0.5);
  }
  .kchip text {
    fill: var(--text);
    font-size: 9.5px;
    font-weight: 600;
    text-anchor: middle;
  }
  .keys .kchip {
    transition: transform 1100ms var(--ease-in-out);
  }
  /* Par-dessous le serveur, jamais à travers lui : chaque puce prend son chemin. */
  .keys.there .link {
    transform: translateX(268px);
  }
  .keys.there .pw {
    transform: translateX(268px);
    transition-delay: 160ms;
  }

  .cloak {
    fill: #1a2442;
    stroke: rgb(150 175 255 / 0.25);
  }
  .cowl {
    fill: #222e52;
    stroke: rgb(150 175 255 / 0.3);
  }
  .face {
    fill: #070b16;
  }
  .eye {
    fill: var(--mint);
  }
  .bubble rect {
    fill: rgb(255 255 255 / 0.06);
    stroke: rgb(233 236 242 / 0.25);
  }
  .bubble text {
    fill: var(--text-2);
    font-family: var(--font-mono);
    font-size: 9px;
    text-anchor: middle;
  }
  .huh {
    fill: var(--text);
    font-size: 15px;
    font-weight: 750;
    text-anchor: middle;
  }
  .tags text {
    fill: var(--text-2);
    font-size: 9px;
    font-weight: 560;
  }
  .thief {
    transform-box: fill-box;
  }
  .thief .hood {
    transition: transform 600ms var(--ease-settle);
  }
  .thief.on .hood {
    animation: peek 1600ms var(--ease-in-out) both;
  }
  .thief.done .hood {
    animation: shrug 1800ms var(--ease-in-out) both;
  }
  @keyframes peek {
    0% {
      transform: translateY(10px);
    }
    30%,
    100% {
      transform: translateY(0);
    }
  }
  @keyframes shrug {
    0% {
      transform: translateY(0);
    }
    20% {
      transform: translateY(-3px);
    }
    40% {
      transform: translateY(0);
    }
    100% {
      transform: translate(-24px, 4px);
      opacity: 0.4;
    }
  }

  /* Journal façon terminal (16 novembre) : police mono embarquée, vert phosphore, fines lignes de
     balayage ; chaque ligne se tape lettre par lettre (largeur en ch, par crans), l'état apparaît
     ensuite ; curseur plein au bout de la dernière ligne. */
  .log {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 6px;
    height: 116px;
    margin: 0;
    padding: 10px 16px 12px;
    overflow: hidden;
    list-style: none;
    border-top: 1px solid rgb(150 175 255 / 0.1);
    background:
      repeating-linear-gradient(180deg, rgb(255 255 255 / 0.025) 0 1px, transparent 1px 3px),
      rgb(3 9 8 / 0.7);
    color: #9ff5d3;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.45;
    text-shadow: 0 0 6px rgb(95 227 181 / 0.35);
  }
  @media (max-width: 479px) {
    .log {
      padding-inline: 12px;
      font-size: 0.6875rem;
    }
  }
  .ln {
    flex: none;
    min-width: 0;
    display: grid;
    /* Texte (il passe à la ligne si besoin, jamais coupé) ; état à droite, place réservée pour
       qu'il ne pousse rien pendant sa frappe. */
    grid-template-columns: 12px minmax(0, 1fr) calc(var(--m, 10) * 1ch + 9px);
    align-items: start;
    column-gap: 8px;
  }
  /* Les anciennes lignes pâlissent : l'œil va à la dernière. */
  .ln:not(.last) {
    color: #4f8f78;
    text-shadow: none;
  }
  .li-ic {
    color: #5596f8;
    font-weight: 700;
  }
  .li-t {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .li-s {
    min-width: 0;
    color: var(--mint);
    font-weight: 600;
    white-space: nowrap;
  }
  /* Le seul curseur : au bout de ce qui se tape ; à la fin, il clignote au bout de la dernière ligne. */
  .cur {
    display: inline-block;
    width: 0.6em;
    height: 1.15em;
    margin-inline-start: 1px;
    vertical-align: text-bottom;
    background: #9ff5d3;
    box-shadow: 0 0 8px rgb(95 227 181 / 0.7);
  }
  .cur.idle {
    animation: blink 1s steps(1) infinite;
  }
  .ln.atk .li-ic,
  .ln.atk .li-t,
  .ln.atk .li-s {
    color: #ff8a8a;
    text-shadow: 0 0 6px rgb(255 107 107 / 0.35);
  }
  .ln.end .li-s {
    color: var(--text);
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  .info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    padding: 4px 6px 4px 16px;
    border-top: 1px solid rgb(150 175 255 / 0.1);
    color: var(--text-2);
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    letter-spacing: 0.02em;
  }
  .info-t {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .info-t :global(svg) {
    flex: none;
    color: var(--mint);
  }
  .toggle {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease-out);
  }
  .toggle:hover {
    background: rgb(255 255 255 / 0.06);
  }
  .toggle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  /* Figure : coins marqués (équerres menthe), légende mono dessous. */
  .fig {
    min-width: 0;
    margin: 0;
  }
  .frame {
    padding: 10px;
    --k: rgb(95 227 181 / 0.55);
    background:
      linear-gradient(var(--k), var(--k)) 0 0 / 14px 1.5px no-repeat,
      linear-gradient(var(--k), var(--k)) 0 0 / 1.5px 14px no-repeat,
      linear-gradient(var(--k), var(--k)) 100% 0 / 14px 1.5px no-repeat,
      linear-gradient(var(--k), var(--k)) 100% 0 / 1.5px 14px no-repeat,
      linear-gradient(var(--k), var(--k)) 0 100% / 14px 1.5px no-repeat,
      linear-gradient(var(--k), var(--k)) 0 100% / 1.5px 14px no-repeat,
      linear-gradient(var(--k), var(--k)) 100% 100% / 14px 1.5px no-repeat,
      linear-gradient(var(--k), var(--k)) 100% 100% / 1.5px 14px no-repeat;
  }
  
  
  /* Pause : la seule boucle (le curseur) s'arrête ; les animations finies vont à leur terme. */
  .paused .cur.idle {
    animation-play-state: paused;
  }

  /* Mouvement réduit : storyboard, sans aucun mouvement. */
  .steps {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .board .steps {
    padding: 16px;
    grid-column: 1 / -1;
    display: grid;
    gap: 8px;
    counter-reset: st;
  }
  .board .steps li {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    column-gap: 10px;
    counter-increment: st;
    font-size: var(--fs-small);
    line-height: var(--lh-small);
  }
  .board .steps li::before {
    content: counter(st);
    grid-row: 1 / span 2;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgb(95 227 181 / 0.14);
    color: var(--mint);
    font-size: 0.75rem;
    font-weight: 700;
  }
  .board .st {
    font-weight: 650;
  }
  .board .sd {
    color: var(--text-2);
  }
  .board :global(*) {
    animation: none !important;
    transition: none !important;
  }
  @media (prefers-reduced-motion: reduce) {
    .demo :global(*) {
      animation: none !important;
      transition: none !important;
    }
  }
  @media (forced-colors: active) {
    .demo {
      border: 1px solid CanvasText;
    }
  }
</style>
