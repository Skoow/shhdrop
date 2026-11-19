<script module lang="ts">
  // Plus d'entrée animée (18 novembre) : l'accueil est écrit au build et affiché avant le
  // script (référencement) ; le titre s'affiche d'emblée dans son état final (17 novembre).

  /** D'où viennent les fichiers remis à `onfiles` (composer.add, Task 10). */
  export type Source = "fichiers" | "photo" | "video" | "depot";
  /** Actions qui ouvrent une interface dans la page (Tasks 10 à 12). */
  export type Action = "media" | "vocal" | "texte";
</script>

<script lang="ts">
  // Accueil, refonte du 12 novembre (décision du propriétaire) : sur-titre, titre, phrase, deux
  // boutons (« Choisir des fichiers » ouvre le sélecteur du composeur ; « Ouvrir un salon »,
  // bientôt), ligne de méta lue dans limits.ts ; l'infographie animée à côté (ordinateur) ou
  // dessous (téléphone) ; puis « Comment ça marche », « Pensé pour la
  // confidentialité », « Offres » et les questions. Voile de dépôt pleine page : un dépôt ouvre
  // le composeur avec ses fichiers. Un clic sur le verre n'ouvre rien.
  // Page d'envoi (`compact`) : trois assurances ; le Salon est avec les actions du composeur.
  import type { Snippet } from "svelte";
  import { dragDepth, dragHasFiles, filesFromDrop } from "../flows/intake";
  import { formatBytes } from "../i18n/format";
  import { t, getLang } from "../i18n/i18n.svelte";
  import { CONTENT_MAX, MAX_ITEMS } from "../limits";
  import DropOverlay from "../ui/DropOverlay.svelte";
  import { Camera, Check, MessagesSquare, Mic, Upload } from "../ui/Icon";
  import Vessel from "../ui/Vessel.svelte";
  import ActiveSharesStrip from "../ui/ActiveSharesStrip.svelte";
  import SecureDemo from "../ui/SecureDemo.svelte";
  import Faq from "./home/Faq.svelte";
  import Sections from "./home/Sections.svelte";

  type Props = {
    /** Vrai dès qu'un élément est ajouté : le titre se replie (UI §9.1), le reste de l'accueil part. */
    compact?: boolean;
    /** Le composeur (Task 10), posé dans le réceptacle. Sans lui, le réceptacle vide. */
    children?: Snippet;
    /** Fichiers choisis ou déposés (composer.add) ; `folders` : dossiers déposés, refusés. */
    onfiles?: (files: File[], source: Source, folders: string[]) => void;
    /** Faux pendant un envoi : le glisser-déposer n'ouvre pas le voile et n'ajoute rien (S9). */
    active?: boolean;
    /** « Choisir des fichiers » (héros) : ouvre directement le sélecteur de fichiers du composeur. */
    onpick?: () => void;
    /** « Ou créez sur place » (héros, 19 novembre) : page d'envoi, ce geste déjà choisi. */
    onmake?: (g: "media" | "vocal" | "room") => void;
  };
  let { compact = false, children, onfiles, active = true, onpick, onmake }: Props = $props();
  // Onglet caché : les boucles d'ambiance de l'accueil (titre en trame, panneau chiffré) s'arrêtent.
  let tabHidden = $state(typeof document !== "undefined" && document.hidden);

  // « puis plus rien. » effacé vers la dernière lettre (proposition G du 16 novembre) : affiché
  // d'emblée dans cet état, sans entrée ni extinction animée (décision du propriétaire du
  // 17 novembre) ; chaque lettre plus pâle que la précédente, le point final invisible. La phrase
  // entière reste lue d'un bloc (copie sr-only, K8).

  /**
   * Seconde ligne du titre (après la dernière virgule, « puis », « then ») : chaque lettre et son
   * rang (`k`), qui décale son effacement en trame (19 novembre).
   */
  const words = $derived.by(() => {
    const list = t("hero.title").split(/ +/);
    let breath = -1;
    list.forEach((w, i) => {
      if (w.endsWith(",") && i < list.length - 1) breath = i;
    });
    const hl = (i: number) => breath >= 0 && i > breath;
    let seen = 0;
    // Seconde ligne colorée (référence du propriétaire, 12 novembre) : « puis plus rien. ».
    return list.map((w, i) => ({
      w,
      hl: hl(i),
      br: breath >= 0 && i === breath + 1,
      letters: hl(i)
        ? [...w].map((c) => {
            const k = seen++;
            return { c, k };
          })
        : [],
    }));
  });

  // Accroche coupée autour des mots mis en avant (sans HTML dans les textes).
  const lede = $derived.by(() => {
    const marks: Record<string, string> = { "\u0000": t("hero.lede.voice"), "\u0001": t("hero.lede.notes"), "\u0002": t("hero.lede.room") };
    return t("hero.lede2", { voice: "\u0000", notes: "\u0001", room: "\u0002" })
      .split(/(\u0000|\u0001|\u0002)/)
      .map((p) => (p in marks ? { b: marks[p]! } : { s: p }));
  });

  // Ligne de méta : la limite gratuite vient de limits.ts (jamais écrite dans les textes).
  const meta = $derived([t("hero.meta.free", { size: formatBytes(CONTENT_MAX, getLang()) }), t("home.fact.account"), t("hero.meta.erase")]);

  function give(list: File[], source: Source, folders: string[] = []) {
    if (list.length > 0 || folders.length > 0) onfiles?.(list, source, folders);
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

<svelte:document onvisibilitychange={() => (tabHidden = document.hidden)} />

<svelte:window
  ondragenter={dragenter}
  ondragover={dragover}
  ondragleave={dragleave}
  ondrop={drop}
  ondragend={close}
  onkeydown={(e) => e.key === "Escape" && over && close()}
/>

<div class={["home", { compact, still: tabHidden }]}>
  <section class="hero" aria-labelledby="hero-title">
    <div class="pitch">
      <!-- Plus de sur-titre « Chiffré de bout en bout » (retours du 15 novembre) : le titre, la
           phrase et les cases cochées le disent déjà. -->
      {#if compact}
        <!-- Page d'envoi (retours du propriétaire du 17 novembre) : un titre pour les lecteurs
             d'écran (« Votre envoi » est le titre visible) ; les trois assurances sont dans le cadre
             de dépôt du composeur (ui/Assurances.svelte). -->
        <h1 id="hero-title" tabindex="-1" class="sr-only">{t("send.h1")}</h1>
      {:else}
        <h1 id="hero-title" tabindex="-1">
          <!-- K8 : phrase entière pour les lecteurs d'écran, copie animée cachée. -->
          <span class="sr-only">{t("hero.title")}</span>
          <span class="words" aria-hidden="true" data-ambient>
            {#each words as { w, hl, br, letters }, i (i)}{#if br}<br />{/if}<span class={["w", { hl }]}
                >{#if hl}{#each letters as { c, k }, j (j)}<span class="l" style:--k={k}>{c}</span>{/each}{:else}{w}{/if}</span
              >{" "}{/each}
          </span>
        </h1>
      {/if}

      {#if !compact}
        <!-- Accroche (17 novembre) : « fichiers » en général, et ce qu'on ne devine pas sans bouton
             exprès mis en avant : vocaux, notes, salon de discussion. -->
        <p class="lede" data-lede>
          {#each lede as p, i (i)}{#if "b" in p}<b class="hl">{p.b}</b>{:else}{p.s}{/if}{/each}
        </p>
        <!-- Cadre d'envoi (propriétaire, 19 novembre, reprise de la maquette « Le chiffré ») : à
             gauche, la zone de dépôt et « Choisir des fichiers » ; à droite, « Ou créez sur place » :
             Photo ou vidéo, Vocal, Salon. Chaque bouton mène à la page d'envoi avec son geste déjà
             choisi (Salon : bientôt, mis en avant là-bas). -->
        <div class={["ctas", "box", { over }]} data-ctas>
          <div class="bx-l">
            <p class="bx-t" aria-hidden="true">{t("hero.box.title")}</p>
            <button type="button" class="pick" data-pick onclick={() => onpick?.()}>
              <Upload size={20} strokeWidth={2.2} aria-hidden="true" />
              <span>{t("hero.pick")}</span>
            </button>
            <p class="bx-s num">{t("hero.box.limits", { n: MAX_ITEMS, size: formatBytes(CONTENT_MAX, getLang()) })}</p>
          </div>
          <div class="bx-r" role="group" aria-labelledby="hero-make">
            <p class="bx-h" id="hero-make">{t("hero.make")}</p>
            <div class="mk3">
              <button type="button" class="mk" data-make="media" onclick={() => onmake?.("media")}><Camera size={22} strokeWidth={1.9} aria-hidden="true" /><span>{t("nav.share.media.t")}</span></button>
              <button type="button" class="mk" data-make="vocal" onclick={() => onmake?.("vocal")}><Mic size={22} strokeWidth={1.9} aria-hidden="true" /><span>{t("nav.share.vocal.t")}</span></button>
              <button type="button" class="mk soon" data-make="room" aria-describedby="hero-room-soon" onclick={() => onmake?.("room")}
                ><MessagesSquare size={22} strokeWidth={1.9} aria-hidden="true" /><span>{t("nav.room")}</span><span class="pill">{t("foot.soon")}</span></button
              >
              <span id="hero-room-soon" class="sr-only">{t("tabs.soon.chat")}</span>
            </div>
          </div>
        </div>
        <ul class="meta" aria-label={t("home.facts.label")} data-meta>
          {#each meta as m, i (i)}<li><span class="ck" aria-hidden="true"><Check size={12} strokeWidth={2.6} /></span>{m}</li>{/each}
        </ul>
      {:else}
        <!-- Page d'envoi (retours du propriétaire du 12 novembre) : le titre reste visible, avec
             trois assurances courtes sous lui ; rien de plus haut que la zone de dépôt. -->
        <!-- Plus de bouton Salon ici (17 novembre) : il est avec les autres actions du composeur
             (rangée sur ordinateur, menu « + » sur téléphone). -->
      {/if}
    </div>
    {#if !compact}<div class="demo-slot"><SecureDemo /></div>{/if}
  </section>

  <!-- Plus de bande d'engagements (17 novembre) : la sécurité et la confidentialité sont dites
       dans leurs pages. -->

  <!-- « Vos partages actifs » (spec §33.1, UI §9.6.1) : lecture locale seulement, rien sans partage actif. -->
  {#if !compact}<div class="shares"><ActiveSharesStrip /></div>{/if}

  <!-- Le composeur (page d'envoi) seulement : plus de carte de dépôt « Glissez vos fichiers ici »
       sur l'accueil (18 novembre, doublon de « Choisir des fichiers » ; le dépôt sur toute la page
       reste possible). -->
  {#if children}
    <div class="compose" data-slot="compose">
      <Vessel empty={false} drop={over}>
        {@render children()}
      </Vessel>
    </div>
  {/if}

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
  /* Les deux actions (la tuile se suffit : plus de cadre autour, 16 novembre). */
  /* Cadre d'envoi (19 novembre) : zone de dépôt à gauche, gestes à droite. */
  .box {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    gap: var(--sp-4) var(--sp-5);
    align-items: center;
    width: 100%;
    max-width: 44rem;
    margin-top: var(--sp-3);
    padding: var(--sp-5);
    border-radius: var(--r-2xl);
    background: linear-gradient(180deg, rgb(255 255 255 / 0.045), rgb(255 255 255 / 0.015)), rgb(16 22 38 / 0.82);
    box-shadow:
      inset 0 0 0 1px rgb(150 175 255 / 0.18),
      0 24px 60px -30px rgb(51 102 255 / 0.55);
    transition: box-shadow var(--dur-fast) var(--ease-out);
  }
  .box.over {
    box-shadow:
      inset 0 0 0 2px var(--accent),
      0 24px 60px -30px rgb(95 227 181 / 0.6);
  }
  .bx-l,
  .bx-r {
    display: grid;
    gap: var(--sp-3);
    min-width: 0;
  }
  .bx-t {
    margin: 0;
    font-size: clamp(1.25rem, 1.05rem + 0.6vw, 1.5rem);
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .bx-s {
    margin: 0;
    color: var(--text-3);
    font-family: var(--font-mono);
    font-size: var(--fs-micro);
  }
  .bx-h {
    margin: 0;
    color: var(--text-2);
    font-size: var(--fs-small);
  }
  .pick {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    justify-self: start;
    min-height: 56px;
    padding: 0 var(--sp-5);
    border: 0;
    border-radius: var(--r-lg);
    background: var(--sig-blue);
    color: #fff;
    font: inherit;
    font-size: 1.0625rem;
    font-weight: 650;
    cursor: pointer;
    box-shadow: 0 12px 30px -12px rgb(51 102 255 / 0.8);
    transition: background-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
  }
  .pick:hover {
    background: var(--sig-blue-hover);
  }
  .pick:active {
    transform: scale(0.98);
  }
  .pick:focus-visible,
  .mk:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
  .mk3 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 5.75em), 1fr));
    gap: var(--sp-2);
  }
  .mk {
    position: relative;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 6px;
    min-height: 92px;
    padding: var(--sp-3) var(--sp-2);
    border: 0;
    border-radius: var(--r-lg);
    background: rgb(255 255 255 / 0.05);
    box-shadow: inset 0 0 0 1px rgb(150 175 255 / 0.14);
    color: var(--text);
    font: inherit;
    font-size: var(--fs-small);
    font-weight: 600;
    text-align: center;
    overflow-wrap: anywhere;
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
  }
  .mk :global(svg) {
    color: var(--accent);
  }
  .mk:hover {
    background: rgb(95 227 181 / 0.08);
    box-shadow: inset 0 0 0 1px rgb(95 227 181 / 0.4);
  }
  .mk.soon {
    color: var(--text-2);
  }
  .mk.soon :global(svg) {
    color: var(--text-3);
  }
  .pill {
    padding: 1px 7px;
    border-radius: var(--r-pill);
    background: rgb(95 227 181 / 0.12);
    color: var(--accent);
    font-size: 0.6875rem;
    font-weight: 600;
  }
  /* Téléphone : la zone de dépôt au-dessus, les trois gestes dessous ; bouton pleine largeur. */
  @media (max-width: 639px) {
    .box {
      grid-template-columns: minmax(0, 1fr);
      padding: var(--sp-4);
      text-align: center;
    }
    .pick {
      justify-self: stretch;
    }
    .mk {
      min-height: 84px;
    }
  }
  @media (max-width: 767px) {
    
    
    
    /* Le bloc « Que voulez-vous envoyer ? » ne reste que sur la page d'envoi. */
    .home:not(.compact) .compose {
      display: none;
    }
  }
  /* Tuile « Choisir des fichiers » (16 novembre) : verre sombre, contour en pointillé menthe (une
     zone de dépôt), pastille d'icône menthe, titre et « ou glissez-les ici », flèche. */
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
  
  @media (max-width: 599px) {
    .ctas{
      display: grid;
      width: 100%;
    }
    /* Le cadre centré hérite de justify-content: center (tablette) : sa colonne doit s'étirer. */
    .home:not(.compact) .ctas {
      grid-template-columns: minmax(0, 1fr);
      justify-content: stretch;
    }

    .pick{
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
  /* Une rangée sur ordinateur (titre à gauche, assurances à droite) ; les assurances passent
     sous le titre quand la place manque (téléphone). */
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
  /* Salon (bientôt) : à part des actions d'envoi, désactivé mais lisible. */
  
  
  
  
  
  

  
  
  
  

  /* « Commencer » (page d'envoi) : bouton contour ; le blanc plein reste au héros (refonte du 12 novembre). */
  
  
  
  

  

  /* Téléphone : « Ajouter » remplace « Commencer » et la rangée de tuiles (aucun doublon). */
  
  @media (max-width: 759px) {
    
    
    
    
    
    
    
    
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
  
  
  
  /* Reflet sous le pointeur (magnet). */
  
  
  
  
  
  /* Petits gestes propres à chaque tuile, au survol seulement : déclencheur, voyant, niveaux, curseur. */
  
  
  
  
  
  
  
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
  
  

  /* « puis plus rien. » (reprise de « La trame », 19 novembre) : lisible d'abord, puis chaque
     lettre, l'une après l'autre, se défait en trame de points (masque de points qui rapetissent),
     s'évapore et revient ; boucle de 12 s, lisible environ les deux tiers du temps. Mouvement
     réduit : lettres pleines, rien ne bouge. */
  @property --r {
    syntax: "<length>";
    inherits: false;
    initial-value: 4px;
  }
  .l {
    display: inline-block;
  }
  @media (prefers-reduced-motion: no-preference) {
    .l {
      -webkit-mask-image: radial-gradient(circle, #000 var(--r), transparent calc(var(--r) + 0.6px));
      mask-image: radial-gradient(circle, #000 var(--r), transparent calc(var(--r) + 0.6px));
      -webkit-mask-size: 5px 5px;
      mask-size: 5px 5px;
      animation: dissolve 12s var(--ease-in-out) infinite;
      animation-delay: calc(var(--k, 0) * 90ms);
    }
    .still .l {
      animation-play-state: paused;
    }
  }
  @keyframes dissolve {
    0%,
    50% {
      --r: 4px;
      opacity: 1;
      transform: none;
    }
    64% {
      --r: 1.2px;
      opacity: 1;
      transform: none;
    }
    74% {
      --r: 0.5px;
      opacity: 0;
      transform: translateY(-0.12em);
    }
    86% {
      --r: 0.5px;
      opacity: 0;
      transform: translateY(0.06em);
    }
    100% {
      --r: 4px;
      opacity: 1;
      transform: none;
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
    /* Premier écran (propriétaire, 18 novembre) : plus large, l'infographie plus grande, et le
       héros remplit l'écran avant « Comment ça marche ». */
    .home:not(.compact) .hero {
      grid-template-columns: minmax(0, 1fr) minmax(480px, 1.15fr);
      align-items: center;
      column-gap: clamp(48px, 5vw, 88px);
      min-height: calc(100svh - 76px - var(--banner-h, 0px));
      padding-block: var(--sp-5) var(--sp-7);
    }
    .home:not(.compact) .demo-slot {
      max-width: 760px;
      justify-self: end;
      width: 100%;
    }
    .home.compact .hero {
      grid-template-columns: minmax(0, 1fr);
      padding-block: 0;
    }
    .lede {
      font-size: 1.1875rem;
    }
    
    
    /* Carte vide : titre et « Commencer » sur une ligne, gestes dessous. */
    
    
    
  }

  @media (prefers-reduced-motion: reduce) {
    
    .pick,
    .pick :global(svg){
      transition: none;
    }
    
    .pick:active,
    .pick:hover{
      transform: none;
    }
  }
  @media (forced-colors: active) {
    /* Le navigateur pose un fond plein derrière chaque ligne : avec un interligne < 1, celui de la
       ligne suivante masquait les jambages (« passe », « lien, »). */
    h1 {
      line-height: 1.15;
    }
    .home:not(.compact) .hero::before{
      display: none;
    }
    
    .pick,
    .mk {
      border: 1px solid ButtonText;
      box-shadow: none;
    }
    /* Le cadre d'envoi est la zone de dépôt : pointillé (19 novembre). */
    .box {
      border: 1px dashed CanvasText;
      box-shadow: none;
    }
  }
</style>
