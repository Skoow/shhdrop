<script lang="ts">
  // Page d'information (Sécurité, Confidentialité, Conditions, Mentions légales, Signaler un
  // abus ; retours UI5) : lecture d'abord, colonne de texte étroite, titres ancrés par id (sans
  // « # » dans l'adresse : le « # » est réservé aux clés). Bandeau « En cours de rédaction »
  // pour les pages juridiques que le propriétaire doit compléter.
  // Signature des pages annexes (propriétaire, 18 novembre) : un « document » centré dans un
  // cadre aux coins menthe (les équerres de l'infographie de l'accueil), en-tête avec une
  // étiquette mono, sommaire (boutons qui font défiler, jamais de « # »), sections numérotées,
  // puces en petits blocs, détails techniques façon terminal.
  import { getLang, t } from "../i18n/i18n.svelte";
  import { infoPage, type InfoName } from "./pages/content";

  let { name }: { name: InfoName } = $props();
  const page = $derived(infoPage(name, getLang()));
  const num = (i: number) => String(i + 1).padStart(2, "0");
  function go(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }
</script>

<article class="info" data-info={name} aria-labelledby="info-title">
  <div class="frame">
  <div class="doc">
    <header class="hd">
      <p class="eyebrow" aria-hidden="true"><span class="dotm"></span>shhgone · {page.title.toLowerCase()}</p>
      <h1 id="info-title" class="title" tabindex="-1" data-large-title>{page.title}</h1>
      <p class="lede">{page.lede}</p>
      {#if page.draft}<p class="draft" role="note" data-draft>{t("info.draft")}</p>{/if}
    </header>
    {#if page.blocks.length > 2}
      <nav class="toc" aria-label={t("info.toc")}>
        <p class="toc-h">{t("info.toc")}</p>
        <ol>
          {#each page.blocks as b, i (i)}
            <li><button type="button" onclick={() => go(b.id ?? `info-b-${i}`)}><span class="tn num">{num(i)}</span>{b.h}</button></li>
          {/each}
        </ol>
      </nav>
    {/if}
    {#each page.blocks as b, i (i)}
      <section class="blk" id={b.id ?? `info-b-${i}`} aria-labelledby="info-h-{i}">
        <h2 id="info-h-{i}" tabindex="-1"><span class="hn num" aria-hidden="true">{num(i)}</span>{b.h}</h2>
        {#each b.p ?? [] as para, j (j)}<p>{para}</p>{/each}
        {#if b.list}
          <ul>{#each b.list as li, j (j)}<li>{li}</li>{/each}</ul>
        {/if}
      </section>
    {/each}
    {#if page.tech}
      <!-- Détails techniques (retours UI6) : repliés, en bas ; le corps reste sans jargon. -->
      <details class="tech" id="details-techniques" data-tech>
        <summary><span class="tp" aria-hidden="true">$</span>{page.tech.h}</summary>
        <div class="tech-in">
          {#each page.tech.p ?? [] as para, j (j)}<p>{para}</p>{/each}
          {#if page.tech.list}<ul>{#each page.tech.list as li, j (j)}<li>{li}</li>{/each}</ul>{/if}
          <ul class="links">
            {#each page.tech.links as l (l.url)}<li><a href={l.url} target="_blank" rel="noopener noreferrer">{l.label}<span class="sr-only"> {t("foot.external")}</span></a></li>{/each}
          </ul>
        </div>
      </details>
    {/if}
  </div>
  </div>
</article>

<style>
  .info {
    display: grid;
    justify-items: center;
    padding-block: var(--sp-5) var(--sp-7);
  }
  /* Le document dans un cadre aux coins menthe (signature du site, comme l'infographie de
     l'accueil) : les équerres autour, la carte de lecture dedans. */
  .frame {
    --k: rgb(95 227 181 / 0.6);
    width: 100%;
    max-width: 784px;
    padding: 12px;
    background:
      linear-gradient(var(--k), var(--k)) 0 0 / 18px 2px no-repeat,
      linear-gradient(var(--k), var(--k)) 0 0 / 2px 18px no-repeat,
      linear-gradient(var(--k), var(--k)) 100% 0 / 18px 2px no-repeat,
      linear-gradient(var(--k), var(--k)) 100% 0 / 2px 18px no-repeat,
      linear-gradient(var(--k), var(--k)) 0 100% / 18px 2px no-repeat,
      linear-gradient(var(--k), var(--k)) 0 100% / 2px 18px no-repeat,
      linear-gradient(var(--k), var(--k)) 100% 100% / 18px 2px no-repeat,
      linear-gradient(var(--k), var(--k)) 100% 100% / 2px 18px no-repeat;
  }
  .doc {
    display: grid;
    gap: var(--sp-6);
    width: 100%;
    padding: clamp(var(--sp-5), 5vw, var(--sp-7)) clamp(var(--sp-4), 6vw, 64px);
    border: 1px solid var(--hair-2);
    border-radius: var(--r-2xl);
    background:
      radial-gradient(120% 50% at 50% 0%, rgb(92 128 255 / 0.07), transparent 70%),
      var(--surface-1);
    box-shadow: 0 30px 80px -40px rgb(0 0 0 / 0.7);
  }
  @media (max-width: 599px) {
    .info {
      padding-block: var(--sp-3) var(--sp-6);
    }
    .frame {
      padding: 6px;
    }
    .doc {
      border-radius: var(--r-xl);
    }
  }
  .hd {
    display: grid;
    gap: var(--sp-3);
    padding-block-end: var(--sp-5);
    border-block-end: 1px solid var(--hair);
  }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: var(--fs-micro);
    letter-spacing: 0.08em;
  }
  .dotm {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    background: var(--accent);
    box-shadow: 0 0 10px rgb(95 227 181 / 0.6);
  }
  .title {
    margin: 0;
    font-size: var(--fs-screen);
    line-height: 1.08;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }
  .title:focus {
    outline: none;
  }
  .lede {
    margin: 0;
    max-width: 58ch;
    color: var(--text-2);
    font-size: 1.125rem;
    line-height: 1.55;
  }
  .draft {
    justify-self: start;
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-md);
    background: var(--warn-tint);
    color: var(--warn);
    font-size: var(--fs-small);
    font-weight: 600;
  }
  /* Sommaire : boutons (le « # » est réservé aux clés), numérotés comme les sections. */
  .toc {
    display: grid;
    gap: var(--sp-2);
    padding: var(--sp-4);
    border-radius: var(--r-lg);
    background: rgb(255 255 255 / 0.025);
    box-shadow: inset 0 0 0 1px var(--hair);
  }
  .toc-h {
    margin: 0;
    color: var(--text-3);
    font-size: var(--fs-micro);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .toc ol {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
    gap: 2px var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .toc button {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    width: 100%;
    min-height: 40px;
    padding: var(--sp-2) 0;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: var(--fs-small);
    text-align: start;
    cursor: pointer;
  }
  .toc button:hover {
    color: var(--accent);
  }
  .toc button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .tn {
    flex: none;
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: var(--fs-micro);
  }
  .blk {
    display: grid;
    gap: var(--sp-3);
    scroll-margin-top: 96px;
  }
  h2 {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    margin: 0;
    font-size: var(--fs-h3);
    line-height: 1.25;
    text-wrap: balance;
  }
  h2:focus {
    outline: none;
  }
  .hn {
    flex: none;
    min-width: 2.2em;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgb(95 227 181 / 0.1);
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
  }
  p,
  li {
    margin: 0;
    color: var(--text-2);
    line-height: 1.7;
  }
  .blk > p,
  .blk > ul {
    max-width: 64ch;
  }
  /* Puces : petits blocs menthe, comme les paquets chiffrés de l'infographie. */
  ul {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .blk li,
  .tech-in > ul:not(.links) li {
    position: relative;
    padding-inline-start: 1.3em;
  }
  .blk li::before,
  .tech-in > ul:not(.links) li::before {
    content: "";
    position: absolute;
    inset-inline-start: 0.15em;
    inset-block-start: 0.68em;
    width: 6px;
    height: 6px;
    border-radius: 1.5px;
    background: var(--accent);
    opacity: 0.8;
  }
  /* Détails techniques : un terminal replié. */
  .tech {
    border: 1px solid rgb(95 227 181 / 0.18);
    border-radius: var(--r-lg);
    background:
      repeating-linear-gradient(180deg, rgb(255 255 255 / 0.02) 0 1px, transparent 1px 3px),
      rgb(3 9 8 / 0.6);
  }
  .tech summary {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 48px;
    padding: var(--sp-2) var(--sp-4);
    color: #9ff5d3;
    font-family: var(--font-mono);
    font-size: var(--fs-small);
    font-weight: 600;
    cursor: pointer;
    border-radius: var(--r-lg);
  }
  .tp {
    color: var(--blue, #5596f8);
  }
  .tech summary:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .tech-in {
    display: grid;
    gap: var(--sp-3);
    padding: 0 var(--sp-4) var(--sp-4);
  }
  .tech li {
    font-size: var(--fs-small);
  }
  .links {
    list-style: none;
    padding: 0;
  }
  .links a {
    display: inline-flex;
    align-items: center;
    min-block-size: 44px;
    color: var(--accent);
    font-size: var(--fs-small);
    font-weight: 560;
  }
  @media (forced-colors: active) {
    .doc {
      border: 1px solid CanvasText;
    }
  }
</style>
