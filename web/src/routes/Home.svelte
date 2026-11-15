<script module lang="ts">
  // UI §20.4 : le titre entre mot par mot une seule fois par chargement de page.
  let revealed = false;
  /** Effacement de « puis plus rien. » (CSS : départ 1,4 s, 45 ms par lettre, 2,6 s chacune) :
   *  classe retirée à la fin, au plus 15 lettres ; sous les 5 s de WCAG 2.2.2. */
  const ERASE_END_MS = 1400 + 15 * 45 + 2600 + 100;

  /** D'où viennent les fichiers remis à `onfiles` (composer.add, Task 10). */
  export type Source = "fichiers" | "photo" | "video" | "depot";
  /** Actions qui ouvrent une interface dans la page (Tasks 10 à 12). */
  export type Action = "media" | "vocal" | "texte";
</script>

<script lang="ts">
  // Accueil, refonte du 12 novembre (décision du propriétaire) : sur-titre, titre, phrase, deux
  // boutons (« Choisir des fichiers » ouvre le sélecteur du composeur ; « Ouvrir un salon »,
  // bientôt), ligne de méta lue dans limits.ts ; l'infographie animée à côté (ordinateur) ou
  // dessous (téléphone) ; puis la carte de dépôt (le composeur vide : « Commencer » mène à la
  // page d'envoi « /envoyer », retours DROP), « Comment ça marche », « Pensé pour la
  // confidentialité », « Offres » et les questions. Voile de dépôt pleine page : un dépôt ouvre
  // le composeur avec ses fichiers. Un clic sur le verre n'ouvre rien.
  // Composeur rempli ou page d'envoi (`compact`) : le titre replié, trois assurances, le Salon.
  import { untrack, type Snippet } from "svelte";
  import { dragDepth, dragHasFiles, filesFromDrop } from "../flows/intake";
  import { formatBytes } from "../i18n/format";
  import { t, getLang } from "../i18n/i18n.svelte";
  import { limitParams } from "../i18n/limit-params";
  import { CONTENT_MAX } from "../limits";
  import { magnet } from "../ui/attach";
  import DropOverlay from "../ui/DropOverlay.svelte";
  import { ArrowRight, Camera, Check, Lock, Mic, Timer, Type, Upload, UserX } from "../ui/Icon";
  import Vessel from "../ui/Vessel.svelte";
  import ActiveSharesStrip from "../ui/ActiveSharesStrip.svelte";
  import PromiseBand from "../ui/PromiseBand.svelte";
  import SecureDemo from "../ui/SecureDemo.svelte";
  import TabIcon from "../ui/TabIcon.svelte";
  import { announce } from "../ui/announce";
  import Faq from "./home/Faq.svelte";
  import Sections from "./home/Sections.svelte";

  type Props = {
    /** Vrai dès qu'un élément est ajouté : le titre se replie (UI §9.1), le reste de l'accueil part. */
    compact?: boolean;
    /** Le composeur (Task 10), posé dans le réceptacle. Sans lui, le réceptacle vide. */
    children?: Snippet;
    /** Fichiers choisis ou déposés (composer.add) ; `folders` : dossiers déposés, refusés. */
    onfiles?: (files: File[], source: Source, folders: string[]) => void;
    /** Vocal, Texte : ouvrent leur interface dans la page (le collage passe par Ctrl/Cmd + V). */
    onaction?: (action: Action) => void;
    /** Faux pendant un envoi : le glisser-déposer n'ouvre pas le voile et n'ajoute rien (S9). */
    active?: boolean;
    /** « Commencer » (carte de dépôt, téléphone) : mène à la page d'envoi « /envoyer » (Compose, retours DROP). */
    onadd?: () => void;
    /** « Choisir des fichiers » (héros) : ouvre directement le sélecteur de fichiers du composeur. */
    onpick?: () => void;
  };
  let { compact = false, children, onfiles, onaction, active = true, onadd, onpick }: Props = $props();

  // Décidé au montage seulement : un repli ultérieur ne rejoue pas l'entrée.
  let reveal = $state(!revealed && !untrack(() => compact));
  revealed = true;
  // Retirée une fois l'entrée finie (≈ 1,25 s, K1 revu le 15 novembre) : un changement de langue
  // ou un compact qui repasse à faux ne rejoue pas l'entrée sur les nœuds recréés (§20.4 : une
  // seule fois).
  $effect(() => {
    if (!reveal) return;
    const timer = setTimeout(() => (reveal = false), 1300);
    return () => clearTimeout(timer);
  });
  // « puis plus rien. » se défait (retours du propriétaire du 15 novembre ; analyse du design
  // du 13 novembre, M1) : après l'entrée, ses lettres deviennent des points (la trame du logo),
  // de droite à gauche, les points s'éteignent, puis les lettres reviennent. Une seule fois,
  // moins de 5 s (WCAG 2.2.2), opacity et transform seulement ; rien en mouvement réduit (CSS).
  // La phrase entière reste lue d'un bloc (copie sr-only, K8).
  let erase = $state(untrack(() => reveal));
  $effect(() => {
    if (!erase) return;
    const timer = setTimeout(() => (erase = false), ERASE_END_MS);
    return () => clearTimeout(timer);
  });

  /**
   * K1 revu (15 novembre, « plus de fluidité ») : 760 ms par mot, 55 ms de décalage, respiration
   * de 40 ms après la dernière virgule (« puis », « then ») ; montée courte et opacité, sans flou
   * (le flou d'un grand texte saccadait sur téléphone). Le dernier mot finit vers 1,24 s.
   * Lettres de la seconde ligne : décalage de l'effacement, de droite à gauche (`k`).
   */
  const words = $derived.by(() => {
    const list = t("hero.title").split(/ +/);
    let breath = -1;
    list.forEach((w, i) => {
      if (w.endsWith(",") && i < list.length - 1) breath = i;
    });
    const hl = (i: number) => breath >= 0 && i > breath;
    const total = list.reduce((n, w, i) => n + (hl(i) ? [...w].length : 0), 0);
    let seen = 0;
    // Seconde ligne colorée (référence du propriétaire, 12 novembre) : « puis plus rien. ».
    return list.map((w, i) => ({
      w,
      delay: i * 55 + (hl(i) ? 40 : 0),
      hl: hl(i),
      br: breath >= 0 && i === breath + 1,
      letters: hl(i) ? [...w].map((c) => ({ c, k: total - 1 - seen++ })) : [],
    }));
  });

  // Ligne de méta : la limite gratuite vient de limits.ts (jamais écrite dans les textes).
  const meta = $derived([t("hero.meta.free", { size: formatBytes(CONTENT_MAX, getLang()) }), t("home.fact.account"), t("hero.meta.erase")]);

  // UI §9.2.1 : Vocal masqué sans MediaRecorder. Pas de bouton Coller (décision du propriétaire) : Ctrl/Cmd + V suffit.
  const canVoice = typeof MediaRecorder !== "undefined";

  function give(list: File[], source: Source, folders: string[] = []) {
    if (list.length > 0 || folders.length > 0) onfiles?.(list, source, folders);
  }
  function act(a: Action) {
    onaction?.(a);
  }

  // UI §9.2.2 : glisser de fichiers sur toute la page ; compteur contre le clignotement ;
  // fermeture au dépôt, à Échap, à la fin du glisser. Les dossiers sont refusés, pas aplatis.
  const depth = dragDepth();
  let over = $state(false);
  function close() {
    depth.reset();
    over = false;
  }
  function dragenter(e: DragEvent) {
    if (!active || !dragHasFiles(e)) return;
    e.preventDefault();
    over = depth.enter(e);
  }
  function dragover(e: DragEvent) {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }
  function dragleave(e: DragEvent) {
    if (!dragHasFiles(e)) return;
    over = depth.leave(e);
  }
  function drop(e: DragEvent) {
    if (!active || !dragHasFiles(e)) return;
    e.preventDefault();
    close();
    void filesFromDrop(e.dataTransfer!).then(({ files, folders }) => give(files, "depot", folders));
  }
</script>

<svelte:window
  ondragenter={dragenter}
  ondragover={dragover}
  ondragleave={dragleave}
  ondrop={drop}
  ondragend={close}
  onkeydown={(e) => e.key === "Escape" && over && close()}
/>

{#snippet tile(label: string, Icon: typeof Lock, onclick: () => void, extra: "flash" | "rec" | "bars" | "caret" | "")}
  <button type="button" class="tile" {onclick} {@attach magnet}>
    <span class="ic">
      <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
      {#if extra === "bars"}<span class="bars" aria-hidden="true"><b></b><b></b><b></b></span>
      {:else if extra}<span class={extra} aria-hidden="true"></span>{/if}
    </span>
    <span class="lb">{label}</span>
  </button>
{/snippet}

<div class={["home", { compact, reveal, erase }]}>
  <section class="hero" aria-labelledby="hero-title">
    <div class="pitch">
      <!-- Plus de sur-titre « Chiffré de bout en bout » (retours du 15 novembre) : le titre, la
           phrase et les cases cochées le disent déjà. -->
      <h1 id="hero-title" tabindex="-1" class:compact>
        <!-- K8 : phrase entière pour les lecteurs d'écran, copie animée cachée. -->
        <span class="sr-only">{t("hero.title")}</span>
        <span class="words" aria-hidden="true">
          {#each words as { w, delay, hl, br, letters }, i (i)}{#if br && !compact}<br />{/if}<span class={["w", { hl: hl && !compact }]} style:--d="{delay}ms"
              >{#if hl && !compact}{#each letters as { c, k }, j (j)}<span class="l" style:--k={k}>{c}</span>{/each}{:else}{w}{/if}</span
            >{" "}{/each}
        </span>
      </h1>

      {#if !compact}
        <p class="lede">{t("hero.lede")}</p>
        <!-- Cadre des deux actions (retours du 15 novembre) : les deux boutons ressortent. -->
        <div class="ctas" data-ctas>
          <button type="button" class="pick" data-pick onclick={() => onpick?.()}>
            <Upload size={20} strokeWidth={2} aria-hidden="true" /><span>{t("hero.pick")}</span>
          </button>
          <!-- Salon (spec §39 : « le bouton du salon est à part, pour qu'on le voie ») : pas encore
               construit (désactivé, « bientôt ») ; même icône que l'onglet du téléphone. -->
          <div class="room" data-room>
            <button type="button" class="room-b hero-room" aria-disabled="true" aria-describedby="room-soon" onclick={() => announce(t("tabs.soon.chat"))}>
              <TabIcon id="chat" size={20} /><span>{t("hero.room")}</span><span class="room-soon">{t("foot.soon")}</span>
            </button>
            <p id="room-soon" class="sr-only">{t("tabs.soon.chat")}</p>
          </div>
          <!-- Téléphone : le bloc « Que voulez-vous envoyer ? » est retiré de l'accueil (doublon de
               « Choisir des fichiers ») ; la création sur place reste à un geste, par la page d'envoi. -->
          <button type="button" class="more" data-more onclick={() => onadd?.()}>
            <span>{t("hero.more")}</span><ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <ul class="meta" aria-label={t("home.facts.label")} data-meta>
          {#each meta as m, i (i)}<li><span class="ck" aria-hidden="true"><Check size={12} strokeWidth={2.6} /></span>{m}</li>{/each}
        </ul>
      {:else}
        <!-- Page d'envoi (retours du propriétaire du 12 novembre) : le titre reste visible, avec
             trois assurances courtes sous lui ; rien de plus haut que la zone de dépôt. -->
        <ul class="assure" aria-label={t("home.facts.label")} data-assure>
          <li><Lock size={15} strokeWidth={2} aria-hidden="true" />{t("send.assure.browser")}</li>
          <li><UserX size={15} strokeWidth={2} aria-hidden="true" />{t("home.fact.account")}</li>
          <li><Timer size={15} strokeWidth={2} aria-hidden="true" />{t("send.assure.burn")}</li>
        </ul>
        <div class="room compact" data-room>
          <button type="button" class="room-b" aria-disabled="true" aria-describedby="room-soon" onclick={() => announce(t("tabs.soon.chat"))}>
            <span class="room-ic" aria-hidden="true"><TabIcon id="chat" size={22} /></span>
            <span class="room-t">{t("foot.room")}</span>
            <span class="room-soon">{t("foot.soon")}</span>
          </button>
          <p id="room-soon" class="sr-only">{t("tabs.soon.chat")}</p>
        </div>
      {/if}
    </div>
    {#if !compact}<div class="demo-slot"><SecureDemo /></div>{/if}
  </section>

  {#if !compact}<div class="band-slot"><PromiseBand /></div>{/if}

  <!-- « Vos partages actifs » (spec §33.1, UI §9.6.1) : lecture locale seulement, rien sans partage actif. -->
  {#if !compact}<div class="shares"><ActiveSharesStrip /></div>{/if}

  <div class="compose" data-slot="compose">
    <Vessel empty={!children} drop={over}>
      {#if children}
        {@render children()}
      {:else}
        <div class="empty">
          <span class="drop-ic" aria-hidden="true"><Upload size={22} strokeWidth={1.9} /></span>
          <div class="drop-say">
            <h2 class="drop-title">
              <span class="t-fine">{t("compose.drop.title")}</span><span class="t-touch">{t("compose.drop.titleTouch")}</span>
            </h2>
          </div>
          <button type="button" class="browse" onclick={() => onadd?.()}>
            <span>{t("home.end.cta")}</span>
            <ArrowRight size={20} strokeWidth={1.9} aria-hidden="true" />
          </button>
          <div class="make" role="group" aria-labelledby="make-title">
            <p class="make-t" id="make-title">{t("compose.add.make")}</p>
            <div class="tiles">
              {@render tile(t("compose.add.media"), Camera, () => act("media"), "flash")}
              {#if canVoice}{@render tile(t("compose.add.voice"), Mic, () => act("vocal"), "bars")}{/if}
              {@render tile(t("compose.add.text"), Type, () => act("texte"), "caret")}
            </div>
          </div>
          <p class="proof num">{t("home.proof", limitParams(getLang()))}</p>
          <!-- Téléphone : une seule action, « Commencer », vers la page d'envoi (retours DROP). -->
          <button type="button" class="add-big" onclick={() => onadd?.()}>
            <span class="ab-ic" aria-hidden="true"><ArrowRight size={26} strokeWidth={2.2} /></span>
            <span class="ab-tx"><span class="ab-t">{t("home.end.cta")}</span><span class="ab-s">{t("add.big.sub")}</span></span>
          </button>
        </div>
      {/if}
    </Vessel>
  </div>

  {#if !compact}
    <Sections />
    <Faq />
  {/if}
</div>

<DropOverlay open={over} />

<style>
  .home {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  /* ---------- Héros : texte centré, infographie dessous (téléphone), à droite (ordinateur) ---------- */
  .hero {
    position: relative;
    isolation: isolate;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-6);
    padding-block: var(--sp-4) var(--sp-6);
  }
  /* Halo : menthe et bleu derrière l'infographie, lumière fixe (rien ne bouge). */
  .home:not(.compact) .hero::before {
    content: "";
    position: absolute;
    z-index: -1;
    inset: -80px 0 0;
    pointer-events: none;
    background:
      radial-gradient(38% 46% at 74% 42%, rgb(51 102 255 / 0.16), transparent 70%),
      radial-gradient(30% 40% at 62% 62%, rgb(95 227 181 / 0.09), transparent 70%);
  }
  .pitch {
    display: grid;
    justify-items: start;
    align-content: center;
    gap: var(--sp-4);
    min-width: 0;
  }
  .pitch > * {
    max-width: 100%;
  }
  h1 {
    margin: 0;
    font-size: clamp(2.5rem, 1.1rem + 4.4vw, 4.75rem);
    line-height: 1;
    font-weight: 700;
    font-stretch: var(--wd-display);
    letter-spacing: -0.04em;
    max-width: 13ch;
    /* Texte agrandi sur téléphone : un mot plus large que l'écran se coupe au lieu de déborder. */
    overflow-wrap: break-word;
    min-width: 0;
    text-wrap: balance;
    view-transition-name: hero-title;
  }
  h1.compact {
    font-size: var(--fs-h1);
    line-height: var(--lh-h1);
    font-weight: var(--fw-h1);
    font-stretch: var(--wd-h1);
    letter-spacing: -0.015em;
    max-width: none;
  }
  h1:focus {
    outline: none;
  }
  .w {
    display: inline-block;
  }
  .lede {
    margin: 0;
    max-width: 44ch;
    overflow-wrap: break-word;
    color: #aab6d3;
    font-size: 1.0625rem;
    line-height: 1.55;
    text-wrap: pretty;
  }
  /* Cadre des deux actions (retours du 15 novembre) : verre sombre, filet lumineux en haut
     (menthe vers bleu, comme le pied de page), coins larges ; les boutons gardent leurs couleurs. */
  .ctas {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    margin-top: var(--sp-2);
    padding: var(--sp-3);
    border-radius: 22px;
    background:
      linear-gradient(180deg, rgb(255 255 255 / 0.05), rgb(255 255 255 / 0.015)),
      rgb(13 17 26 / 0.72);
    box-shadow:
      inset 0 0 0 1px rgb(150 175 255 / 0.16),
      0 24px 60px -28px rgb(51 102 255 / 0.55);
  }
  .ctas::before {
    content: "";
    position: absolute;
    inset-inline: 18%;
    inset-block-start: 0;
    block-size: 1px;
    background: linear-gradient(90deg, transparent, rgb(95 227 181 / 0.7), rgb(85 150 248 / 0.5), transparent);
    pointer-events: none;
  }
  /* « Ou créez sur place » : téléphone seulement (sur ordinateur, la zone de dépôt de l'accueil
     propose déjà Photo, Vocal et Texte). */
  .more {
    display: none;
  }
  @media (max-width: 767px) {
    .more {
      /* Après « Ouvrir un salon » (.room : order 4). */
      order: 5;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 44px;
      width: 100%;
      border: 0;
      border-radius: 12px;
      background: transparent;
      color: var(--text-2);
      font: inherit;
      font-size: var(--fs-small);
      font-weight: 560;
      cursor: pointer;
    }
    .more:hover,
    .more:focus-visible {
      color: var(--text);
    }
    .more:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    /* Le bloc « Que voulez-vous envoyer ? » ne reste que sur la page d'envoi. */
    .home:not(.compact) .compose {
      display: none;
    }
  }
  /* Bouton principal : blanc plein, icône ; un léger halo vert au survol (le « scellé »). */
  .pick {
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 52px;
    padding: 0 22px;
    border: 0;
    border-radius: 14px;
    background: #fff;
    color: #07102a;
    font: inherit;
    font-size: 1rem;
    font-weight: 650;
    cursor: pointer;
    box-shadow:
      0 14px 30px -14px rgb(51 102 255 / 0.7),
      inset 0 -2px 0 rgb(7 16 42 / 0.12);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition:
      transform 360ms var(--ease-settle),
      box-shadow var(--dur-base) var(--ease-out);
  }
  .pick :global(svg) {
    transition: transform 420ms var(--ease-settle);
  }
  @media (hover: hover) {
    .pick:hover {
      transform: translateY(-2px);
      box-shadow:
        0 18px 36px -14px rgb(51 102 255 / 0.85),
        0 0 0 4px rgb(95 227 181 / 0.18),
        inset 0 -2px 0 rgb(7 16 42 / 0.12);
    }
    .pick:hover :global(svg) {
      transform: translateY(-2px);
    }
  }
  .pick:active {
    transform: scale(0.97);
    transition-duration: var(--dur-press);
  }
  .pick:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
  /* Secondaire : contour, désactivé (bientôt) mais lisible. */
  .room-b.hero-room {
    /* Texte agrandi sur 320 px : « bientôt » passe dessous au lieu de déborder. */
    flex-wrap: wrap;
    row-gap: 2px;
    padding-block: 8px;
    min-height: 52px;
    padding: 0 18px;
    gap: 10px;
    border-style: solid;
    border-color: rgb(150 175 255 / 0.26);
    border-radius: 14px;
    background: rgb(255 255 255 / 0.02);
    color: var(--text);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    margin: var(--sp-1) 0 0;
    padding: 0;
    list-style: none;
    color: #8f9cbd;
    font-size: var(--fs-small);
  }
  .meta li {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  /* Petites cases cochées (référence du propriétaire, 12 novembre). */
  .ck {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background: rgb(95 227 181 / 0.14);
    box-shadow: inset 0 0 0 1px rgb(95 227 181 / 0.35);
    color: var(--accent);
  }
  .w.hl {
    color: var(--accent);
  }
  .band-slot {
    min-width: 0;
    margin-block: 0 var(--sp-6);
  }
  @media (max-width: 599px) {
    .ctas,
    .ctas > .room {
      display: grid;
      width: 100%;
    }
    /* Le cadre centré hérite de justify-content: center (tablette) : sa colonne doit s'étirer. */
    .home:not(.compact) .ctas {
      grid-template-columns: minmax(0, 1fr);
      justify-content: stretch;
    }

    .pick,
    .ctas .room-b.hero-room {
      width: 100%;
      justify-content: center;
    }
  }
  .demo-slot {
    min-width: 0;
  }
  /* Page d'envoi (retours du 12 novembre) : le titre visible, plus petit, à gauche ; trois
     assurances dessous ; le Salon à droite (ordinateur) ou dessous (téléphone). */
  .home.compact .hero {
    padding-top: 0;
    padding-bottom: var(--sp-2);
    gap: var(--sp-3);
  }
  /* Une rangée sur ordinateur (titre, assurances, Salon à droite) : la liste garde sa hauteur ;
     les assurances passent dessous quand la place manque. */
  .home.compact .pitch {
    order: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-5);
  }
  .home.compact .compose {
    order: 2;
  }
  h1.compact {
    order: 1;
    flex: 0 1 auto;
    font-size: clamp(1.5rem, 1.2rem + 0.8vw, 1.875rem);
    line-height: 1.15;
    text-wrap: balance;
  }
  .assure {
    order: 2;
    flex: 0 1 auto;
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px var(--sp-4);
    color: var(--text-2);
    font-size: var(--fs-small);
  }
  .assure li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .assure :global(svg) {
    flex: none;
    color: var(--accent);
  }
  .room.compact {
    order: 3;
    margin-inline-start: auto;
  }
  /* Téléphone : titre, assurances, puis Salon, les uns sous les autres, à gauche. */
  @media (max-width: 599px) {
    .assure,
    .room.compact {
      flex-basis: 100%;
      margin-inline-start: 0;
    }
  }
  /* Salon (bientôt) : à part des actions d'envoi, désactivé mais lisible. */
  .room {
    order: 4;
    display: grid;
    justify-items: start;
    gap: 6px;
  }
  .room-b {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 6px 14px 6px 6px;
    border: 1px dashed rgb(233 236 242 / 0.24);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.03);
    color: var(--text-2);
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 640;
    cursor: not-allowed;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .room-b:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .room-ic {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.06);
    color: var(--text-2);
  }
  .room-soon {
    padding: 1px 8px;
    border-radius: var(--r-pill);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: var(--fs-micro);
    font-weight: 560;
  }
  @media (forced-colors: active) {
    .room-b {
      border: 1px dashed GrayText;
      color: GrayText;
    }
  }

  .drop-say {
    display: grid;
    gap: var(--sp-1);
    padding-inline: 4px;
  }
  .drop-title {
    font-size: 1.375rem;
    line-height: 1.2;
    font-weight: 640;
    font-stretch: 108%;
    letter-spacing: -0.015em;
  }
  .t-touch {
    display: none;
  }
  @media (hover: none) and (pointer: coarse) {
    .t-fine {
      display: none;
    }
    .t-touch {
      display: inline;
    }
  }

  /* « Commencer » (page d'envoi) : bouton contour ; le blanc plein reste au héros (refonte du 12 novembre). */
  .browse {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 52px;
    padding: 0 var(--sp-5);
    border: 1px solid rgb(150 175 255 / 0.28);
    border-radius: 14px;
    background: rgb(255 255 255 / 0.03);
    color: var(--text);
    font: inherit;
    font-size: 1rem;
    font-weight: 620;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition:
      transform var(--dur-press) var(--ease-out),
      background-color var(--dur-fast) var(--ease-out);
  }
  .browse :global(svg) {
    transition: transform 500ms var(--ease-settle);
  }
  @media (hover: hover) {
    .browse:hover {
      border-color: rgb(150 175 255 / 0.5);
      background: rgb(255 255 255 / 0.06);
    }
    .browse:hover :global(svg) {
      transform: translateX(4px);
    }
  }
  .browse:active {
    transform: scale(0.97);
  }

  .make {
    display: grid;
    gap: 10px;
  }

  /* Téléphone : « Ajouter » remplace « Commencer » et la rangée de tuiles (aucun doublon). */
  .add-big {
    display: none;
  }
  @media (max-width: 759px) {
    .browse,
    .make {
      display: none;
    }
    .add-big {
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr);
      align-items: center;
      gap: var(--sp-4);
      width: 100%;
      min-height: 80px;
      padding: var(--sp-3) var(--sp-4) var(--sp-3) var(--sp-3);
      border: 0;
      border-radius: var(--r-xl);
      background: var(--paper);
      color: var(--ink);
      font: inherit;
      text-align: start;
      cursor: pointer;
      box-shadow:
        0 14px 30px -18px rgb(0 0 0 / 0.9),
        inset 0 -2px 0 rgb(11 13 18 / 0.12);
      transition: transform var(--dur-press) var(--ease-out);
    }
    .add-big:active {
      transform: scale(0.98);
    }
    .ab-ic {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border-radius: 18px;
      background: var(--ink);
      color: var(--accent);
    }
    .ab-tx {
      display: grid;
      gap: 2px;
      min-width: 0;
    }
    .ab-t {
      font-size: 1.25rem;
      font-weight: 650;
      font-stretch: 108%;
      /* « Commencer » à 200 % sur 320 px : coupé (avec trait d'union) plutôt que débordé. */
      hyphens: auto;
      overflow-wrap: anywhere;
    }
    .ab-s {
      color: rgb(11 13 18 / 0.68);
      font-size: var(--fs-small);
      line-height: var(--lh-small);
    }
    .empty {
      gap: var(--sp-5);
    }
    /* Composeur : un écran d'app, pas une carte dans la page (ni cadre, ni liseré). */
    .home.compact .compose :global(.vessel) {
      background: transparent;
      box-shadow: none;
    }
    .home.compact .compose :global(.vessel > .line) {
      display: none;
    }
  }
  /* Composeur sur ordinateur (retours du 12 novembre) : la carte a un contour entier ; l'ouverture
     de la capsule (motif du logo) laissait le haut sans bord, de la gauche jusqu'au milieu. Le
     dépôt garde son ouverture resserrée. */
  .home.compact .compose :global(.vessel:not(.drop) .track) {
    stroke-dasharray: none;
  }
  .make-t {
    margin: 0;
    padding-inline: 4px;
    color: var(--text-2);
    font-size: var(--fs-small);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 3.5rem), 1fr));
    gap: var(--sp-2);
  }
  .tile {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: var(--sp-2);
    min-height: 84px;
    min-width: 0;
    padding: var(--sp-3) var(--sp-1);
    border: 0;
    border-radius: 18px;
    background: rgb(255 255 255 / 0.045);
    box-shadow:
      inset 0 0 0 1px var(--hair),
      inset 0 1px 0 rgb(255 255 255 / 0.05);
    color: var(--text);
    font: inherit;
    font-size: var(--fs-small);
    font-weight: 560;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transform: translate(var(--tx, 0px), var(--ty, 0px)) scale(var(--s, 1));
    transition:
      transform 520ms var(--ease-settle),
      background-color var(--dur-fast) var(--ease-out),
      box-shadow var(--dur-fast) var(--ease-out);
  }
  /* Reflet sous le pointeur (magnet). */
  .tile::before {
    content: "";
    position: absolute;
    z-index: -1;
    left: 0;
    top: 0;
    width: 160px;
    height: 160px;
    margin: -80px 0 0 -80px;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgb(95 227 181 / 0.16), transparent);
    opacity: 0;
    transform: translate(var(--lx, 50%), var(--ly, 50%));
    transition: opacity var(--dur-base) var(--ease-out);
  }
  .ic {
    position: relative;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    color: var(--text-2);
    transition:
      color var(--dur-fast) var(--ease-out),
      transform 520ms var(--ease-settle);
  }
  .lb {
    max-width: 100%;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  @media (hover: hover) {
    .tile:hover {
      background: rgb(255 255 255 / 0.075);
      box-shadow:
        inset 0 0 0 1px var(--hair-2),
        inset 0 1px 0 rgb(255 255 255 / 0.08);
    }
    .tile:hover::before {
      opacity: 1;
    }
    .tile:hover .ic {
      color: var(--accent);
      transform: translateY(-3px) scale(1.08);
    }
  }
  .tile:active {
    --s: 0.95;
    transition-duration: var(--dur-press);
  }
  /* Petits gestes propres à chaque tuile, au survol seulement : déclencheur, voyant, niveaux, curseur. */
  .flash,
  .rec,
  .bars,
  .caret {
    position: absolute;
    opacity: 0;
  }
  .flash {
    inset: -6px;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgb(201 251 232 / 0.85), transparent);
  }
  .rec {
    right: -3px;
    top: -1px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
  }
  .bars {
    left: 100%;
    margin-left: 3px;
    display: flex;
    gap: 2px;
    align-items: center;
    height: 18px;
  }
  .bars b {
    width: 2px;
    height: 14px;
    border-radius: 2px;
    background: currentColor;
    transform: scaleY(0.3);
  }
  .caret {
    left: 100%;
    margin-left: 2px;
    top: 4px;
    width: 2px;
    height: 20px;
    background: currentColor;
  }
  @media (hover: hover) and (prefers-reduced-motion: no-preference) {
    .tile:hover .flash {
      animation: flash 520ms var(--ease-out) 1;
    }
    .tile:hover .rec {
      animation: rec 1s var(--ease-in-out) 2 both;
    }
    .tile:hover .bars {
      opacity: 1;
    }
    .tile:hover .bars b {
      animation: level 900ms var(--ease-in-out) 4 alternate;
    }
    .tile:hover .bars b:nth-child(2) {
      animation-delay: -300ms;
    }
    .tile:hover .bars b:nth-child(3) {
      animation-delay: -600ms;
    }
    .tile:hover .caret {
      animation: caret 1s steps(1) 2;
    }
  }
  @keyframes flash {
    30% {
      opacity: 0.9;
    }
    100% {
      opacity: 0;
    }
  }
  @keyframes rec {
    50% {
      opacity: 1;
    }
  }
  @keyframes level {
    to {
      transform: scaleY(1);
    }
  }
  @keyframes caret {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
  }

  .proof {
    max-width: none;
    margin: 0;
    padding: var(--sp-3) 4px 0;
    border-top: 1px solid var(--hair);
    color: var(--text-2);
    font-size: 0.8125rem;
  }


  /* ---------- Carte de dépôt : le composeur vide ---------- */
  .shares {
    min-width: 0;
  }
  .shares:empty {
    display: none;
  }
  .compose {
    position: relative;
    isolation: isolate;
    min-width: 0;
  }
  .home:not(.compact) .compose {
    width: 100%;
    max-width: 880px;
    margin-inline: auto;
  }
  .empty {
    position: relative;
    display: grid;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--sp-4);
  }
  .drop-ic {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: rgb(95 227 181 / 0.12);
    box-shadow: inset 0 0 0 1px rgb(95 227 181 / 0.25);
    color: var(--accent);
  }

  /* ---------- Entrée (K1 : tout fini à 900 ms au plus, tout cliquable dès l'affichage) ---------- */
  @media (prefers-reduced-motion: no-preference) {
    /* Audit performance (5 novembre) : le texte au-dessus de la ligne de flottaison ne part
       jamais d'une opacité nulle (le LCP attendait la fin de l'entrée) ; montée et flou seulement. */
    .reveal .w {
      animation: word-in 760ms var(--ease-out) var(--d) both;
    }
    .reveal .lede,
    .reveal .ctas,
    .reveal .meta {
      animation: rise-only 560ms var(--ease-out) var(--i, 0ms) both;
    }
    .reveal .lede {
      --i: 120ms;
    }
    .reveal .ctas {
      --i: 200ms;
    }
    .reveal .meta {
      --i: 260ms;
    }
    .reveal .demo-slot {
      animation: vault-in var(--dur-moment) var(--ease-settle) 120ms both;
    }
    .reveal .compose {
      animation: rise-in 560ms var(--ease-settle) 240ms both;
    }
  }
  @keyframes word-in {
    from {
      opacity: 0.35;
      transform: translateY(0.22em);
    }
  }
  /* « puis plus rien. » se défait : la lettre s'éteint et rétrécit, un point de la trame prend
     sa place puis s'éteint (« plus rien »), la lettre revient. */
  .l {
    position: relative;
    display: inline-block;
  }
  .l::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 58%;
    width: 0.16em;
    height: 0.16em;
    margin: -0.08em 0 0 -0.08em;
    border-radius: 50%;
    background: currentColor;
    opacity: 0;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: no-preference) {
    .erase .l {
      animation: letter-out 2600ms var(--ease-in-out) calc(1400ms + var(--k) * 45ms) both;
    }
    .erase .l::after {
      animation: letter-dot 2600ms var(--ease-in-out) calc(1400ms + var(--k) * 45ms) both;
    }
  }
  @keyframes letter-out {
    0% {
      opacity: 1;
      transform: none;
    }
    16%,
    66% {
      opacity: 0;
      transform: scale(0.55);
    }
    86%,
    100% {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes letter-dot {
    0%,
    8% {
      opacity: 0;
      transform: scale(0);
    }
    18%,
    34% {
      opacity: 1;
      transform: none;
    }
    48%,
    100% {
      opacity: 0;
      transform: scale(0.4);
    }
  }
  @keyframes rise-only {
    from {
      transform: translateY(var(--rise));
    }
  }
  @keyframes rise-in {
    from {
      opacity: 0;
      transform: translateY(var(--rise));
    }
  }
  @keyframes vault-in {
    from {
      opacity: 0;
      transform: translateY(24px) scale(0.985);
    }
  }

  @media (min-width: 600px) {
    .empty {
      padding: var(--sp-6) var(--sp-6) var(--sp-5);
    }
  }
  /* Téléphone et tablette (téléphone ajouté le 15 novembre : centrage revu) : texte centré,
     infographie dessous, à largeur lisible. */
  @media (max-width: 1023px) {
    .home:not(.compact) h1 {
      margin-inline: auto;
    }
    .home:not(.compact) .pitch {
      justify-items: center;
      text-align: center;
    }
    .home:not(.compact) .ctas,
    .home:not(.compact) .meta {
      justify-content: center;
    }
    .demo-slot {
      width: 100%;
      max-width: 560px;
      margin-inline: auto;
    }
  }
  /* Ordinateur : texte à gauche, l'écran de démonstration à droite, sur le premier écran. */
  @media (min-width: 1024px) {
    .hero {
      grid-template-columns: minmax(0, 1fr) minmax(440px, 540px);
      align-items: center;
      column-gap: clamp(48px, 6vw, 96px);
      padding-block: var(--sp-6) var(--sp-7);
    }
    .home.compact .hero {
      grid-template-columns: minmax(0, 1fr);
      padding-block: 0;
    }
    .lede {
      font-size: 1.1875rem;
    }
    .drop-title {
      font-size: 1.625rem;
    }
    .tile {
      min-height: 92px;
    }
    /* Carte vide : titre et « Commencer » sur une ligne, gestes dessous. */
    .home:not(.compact) .empty {
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      column-gap: var(--sp-4);
    }
    .home:not(.compact) .make,
    .home:not(.compact) .proof {
      grid-column: 1 / -1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tile,
    .ic,
    .pick,
    .pick :global(svg),
    .browse,
    .browse :global(svg) {
      transition: none;
    }
    .tile:active,
    .pick:active,
    .pick:hover,
    .browse:active {
      transform: none;
    }
  }
  @media (forced-colors: active) {
    /* Le navigateur pose un fond plein derrière chaque ligne : avec un interligne < 1, celui de la
       ligne suivante masquait les jambages (« passe », « lien, »). */
    h1 {
      line-height: 1.15;
    }
    .home:not(.compact) .hero::before,
    .tile::before,
    .flash {
      display: none;
    }
    .tile,
    .pick,
    .browse,
    .add-big {
      border: 1px solid ButtonText;
      box-shadow: none;
    }
    .ctas {
      border: 1px solid CanvasText;
    }
    .ctas::before {
      display: none;
    }
  }
</style>
