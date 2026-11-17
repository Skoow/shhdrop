<script module lang="ts">
  // UI §20.4 : l'entrée de la page (phrase, boutons) une seule fois par chargement. Le titre, lui,
  // s'affiche d'emblée dans son état final (17 novembre).
  let revealed = false;

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
  // Page d'envoi (`compact`) : trois assurances ; le Salon est avec les actions du composeur.
  import { untrack, type Snippet } from "svelte";
  import { dragDepth, dragHasFiles, filesFromDrop } from "../flows/intake";
  import { formatBytes } from "../i18n/format";
  import { t, getLang } from "../i18n/i18n.svelte";
  import { limitParams } from "../i18n/limit-params";
  import { CONTENT_MAX } from "../limits";
  import DropOverlay from "../ui/DropOverlay.svelte";
  import { ArrowRight, Check, ChevronRight, Plus, Upload } from "../ui/Icon";
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
    /** « Commencer » (carte de dépôt, téléphone) : mène à la page d'envoi « /envoyer » (Compose, retours DROP). */
    onadd?: () => void;
    /** « Choisir des fichiers » (héros) : ouvre directement le sélecteur de fichiers du composeur. */
    onpick?: () => void;
    /** « Créer sur place » (héros, 17 novembre) : page d'envoi, actions mises en avant. */
    oncreate?: () => void;
  };
  let { compact = false, children, onfiles, active = true, onadd, onpick, oncreate }: Props = $props();

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
  // « puis plus rien. » effacé vers la dernière lettre (proposition G du 16 novembre) : affiché
  // d'emblée dans cet état, sans entrée ni extinction animée (décision du propriétaire du
  // 17 novembre) ; chaque lettre plus pâle que la précédente, le point final invisible. La phrase
  // entière reste lue d'un bloc (copie sr-only, K8).

  /**
   * Seconde ligne du titre (après la dernière virgule, « puis », « then ») : opacité de chaque
   * lettre (`o`), de 0,55 pour la première à 0 pour la dernière.
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
      hl: hl(i),
      br: breath >= 0 && i === breath + 1,
      letters: hl(i)
        ? [...w].map((c) => {
            const k = seen++;
            return { c, o: total > 1 ? +(0.55 * (1 - k / (total - 1))).toFixed(3) : 0 };
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

<svelte:window
  ondragenter={dragenter}
  ondragover={dragover}
  ondragleave={dragleave}
  ondrop={drop}
  ondragend={close}
  onkeydown={(e) => e.key === "Escape" && over && close()}
/>

<div class={["home", { compact, reveal }]}>
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
          <span class="words" aria-hidden="true">
            {#each words as { w, hl, br, letters }, i (i)}{#if br}<br />{/if}<span class={["w", { hl }]}
                >{#if hl}{#each letters as { c, o }, j (j)}<span class="l" style:--o={o}>{c}</span>{/each}{:else}{w}{/if}</span
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
        <!-- Cadre des deux actions (retours du 15 novembre) : les deux boutons ressortent. -->
        <div class="ctas" data-ctas>
          <!-- Tuile (décisions du propriétaire du 16 novembre) : aussi une zone de dépôt, ce que disent
               le contour en pointillé et « ou glissez-les ici » ; elle s'allume quand on glisse des
               fichiers sur la page. Le nom accessible reste « Choisir des fichiers ». -->
          <button type="button" class={["pick", { over }]} data-pick onclick={() => onpick?.()}>
            <span class="pk-ic" aria-hidden="true"><Upload size={20} strokeWidth={2} /></span>
            <span class="pk-tx"><span class="pk-t">{t("hero.pick")}</span><span class="pk-s" aria-hidden="true">{t("hero.pick.sub")}</span></span>
            <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
          </button>
          <!-- Second bouton (17 novembre) : tout ce qui se crée dans Shhgone, au même endroit (note,
               vocal, photo ou vidéo, salon bientôt) ; mène à la page d'envoi, où ces actions
               s'allument un instant (téléphone : la feuille « Ajouter » s'ouvre). -->
          <button type="button" class="pick create" data-create onclick={() => oncreate?.()}>
            <span class="pk-ic" aria-hidden="true"><Plus size={20} strokeWidth={2.2} /></span>
            <span class="pk-tx"><span class="pk-t">{t("hero.create")}</span><span class="pk-s">{t("hero.create.sub")}</span></span>
            <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
          </button>
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
          <!-- Plus de tuiles Photo, Vocal, Note ici (17 novembre) : « Créer sur place », en haut. -->
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
  .ctas {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    margin-top: var(--sp-2);
  }
  @media (max-width: 767px) {
    
    
    
    /* Le bloc « Que voulez-vous envoyer ? » ne reste que sur la page d'envoi. */
    .home:not(.compact) .compose {
      display: none;
    }
  }
  /* Tuile « Choisir des fichiers » (16 novembre) : verre sombre, contour en pointillé menthe (une
     zone de dépôt), pastille d'icône menthe, titre et « ou glissez-les ici », flèche. */
  .pick {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    width: min(100%, 26rem);
    min-height: 72px;
    padding: 12px 16px 12px 12px;
    border: 1.5px dashed rgb(95 227 181 / 0.55);
    border-radius: 18px;
    background:
      linear-gradient(180deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.015)),
      rgb(16 22 38 / 0.85);
    box-shadow: 0 18px 40px -22px rgb(51 102 255 / 0.6);
    color: var(--text);
    font: inherit;
    text-align: start;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition:
      transform 360ms var(--ease-settle),
      border-color var(--dur-base) var(--ease-out),
      box-shadow var(--dur-base) var(--ease-out);
  }  /* « Créer sur place » n'est pas une zone de dépôt : bordure pleine (le pointillé reste au dépôt). */
  .pick.create {
    border-style: solid;
  }

  /* Des fichiers glissés sur la page : la tuile s'allume (le dépôt marche partout sur la page). */
  .pick.over {
    border-style: solid;
    border-color: var(--accent);
    box-shadow:
      0 0 0 4px rgb(95 227 181 / 0.18),
      0 18px 40px -22px rgb(95 227 181 / 0.6);
  }
  .pk-ic {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border-radius: 14px;
    background: rgb(95 227 181 / 0.14);
    box-shadow: inset 0 0 0 1px rgb(95 227 181 / 0.3);
    color: var(--accent);
  }
  .pk-tx {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .pk-t {
    font-size: 1.0625rem;
    font-weight: 650;
  }
  .pk-s {
    color: var(--text-3);
    font-size: 0.75rem;
  }
  .pick > :global(svg) {
    color: var(--text-2);
    transition: transform 420ms var(--ease-settle);
  }
  @media (hover: hover) {
    .pick:hover {
      transform: translateY(-2px);
      border-color: var(--accent);
      box-shadow:
        0 22px 46px -22px rgb(51 102 255 / 0.8),
        0 0 0 4px rgb(95 227 181 / 0.12);
    }
    .pick:hover > :global(svg) {
      transform: translateX(3px);
    }
  }
  .pick:active {
    transform: scale(0.98);
    transition-duration: var(--dur-press);
  }
  .pick:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
  /* Secondaire : contour, désactivé (bientôt) mais lisible. */
  
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

  

  /* Téléphone : « Ajouter » remplace « Commencer » et la rangée de tuiles (aucun doublon). */
  .add-big {
    display: none;
  }
  @media (max-width: 759px) {
    .browse{
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
  /* « puis plus rien. » effacé vers la dernière lettre, d'emblée (17 novembre). */
  .l {
    display: inline-block;
    opacity: var(--o, 1);
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
    
    /* Carte vide : titre et « Commencer » sur une ligne, gestes dessous. */
    .home:not(.compact) .empty {
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      column-gap: var(--sp-4);
    }
    
    .home:not(.compact) .proof {
      grid-column: 1 / -1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    
    .pick,
    .pick :global(svg),
    .browse,
    .browse :global(svg) {
      transition: none;
    }
    
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
    .home:not(.compact) .hero::before{
      display: none;
    }
    
    .pick,
    .browse,
    .add-big {
      border: 1px solid ButtonText;
      box-shadow: none;
    }
    .pick:not(.create) {
      border-style: dashed;
    }
  }
</style>
