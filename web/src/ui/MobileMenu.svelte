<script lang="ts">
  // Menu du téléphone (< 768 px ; retours du propriétaire du 15 novembre) : remplace la barre
  // d'onglets du bas sur le site. Motif disclosure (bouton aria-expanded qui montre une liste de
  // liens, pas un role="menu"), comme les menus de TopNav. Échap ferme et rend le focus au bouton ;
  // un clic ailleurs ou un changement d'écran le ferme. « Téléchargements » n'y figure qu'avec un
  // compte : sans compte, l'historique des téléchargements ne vit que dans ce navigateur et ne
  // permet de rien retélécharger (le lien n'est jamais gardé), il n'a pas sa place dans le menu.
  import { currentPath, followLink, href, router } from "../app/router.svelte";
  import { accountFlag } from "../app/account-flag.svelte";
  import { t } from "../i18n/i18n.svelte";
  import { Menu, X } from "./Icon";

  let { busy = false }: { busy?: boolean } = $props();

  let open = $state(false);
  let wrap: HTMLElement | undefined = $state();
  let button: HTMLButtonElement | undefined = $state();
  const uid = $props.id();

  type Link = { label: string; path: string; main?: boolean };
  const links = $derived<Link[]>([
    { label: t("nav.cta"), path: "/envoyer", main: true },
    accountFlag.connected ? { label: t("nav.home"), path: "/" } : { label: t("nav.shares"), path: "/envois" },
    ...(accountFlag.connected ? [{ label: t("foot.downloads"), path: "/telechargements" }] : []),
    { label: t("nav.offers"), path: "/offres" },
    // Sécurité, Confidentialité, Signaler, Code source : dans le pied de page de chaque écran,
    // pas répétés ici (décision du propriétaire du 16 novembre : Envoi, Mes partages, Offres).
  ]);
  const here = (p: string) => (currentPath() === href(p) && (p !== "/" || router.current.name === "home") ? "page" : undefined);

  function close(focusBack = false) {
    if (!open) return;
    open = false;
    if (focusBack) button?.focus();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close(true);
    }
  }
  // Clic ailleurs : ferme, sans voler le focus.
  $effect(() => {
    if (!open) return;
    const down = (e: Event) => {
      if (!wrap?.contains(e.target as Node)) open = false;
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  });
  // Changement d'écran ou envoi qui commence : menu fermé.
  $effect(() => {
    void router.current;
    void busy;
    open = false;
  });
</script>

<div class="mm" bind:this={wrap} onkeydown={onKey} role="presentation">
  <button
    bind:this={button}
    type="button"
    class="mm-b"
    aria-expanded={open}
    aria-controls="{uid}-menu"
    aria-label={open ? t("nav.menu.close") : t("nav.menu.open")}
    aria-disabled={busy ? "true" : undefined}
    aria-describedby={busy ? "foot-busy" : undefined}
    onclick={() => {
      if (!busy) open = !open;
    }}
    data-menu-button
  >
    {#if open}<X size={24} strokeWidth={2} aria-hidden="true" />{:else}<Menu size={24} strokeWidth={2} aria-hidden="true" />{/if}
  </button>
  <nav class="mm-p" id="{uid}-menu" aria-label={t("nav.label")} hidden={!open} data-menu>
    <ul>
      {#each links as l (l.label)}
        <li>
          {#if l.path}
            <a
              class={["mm-l", { main: l.main }]}
              href={href(l.path)}
              aria-current={here(l.path)}
              onclick={(e) => {
                close();
                followLink(e, l.path);
              }}>{l.label}</a
            >
          {/if}
        </li>
      {/each}
    </ul>
  </nav>
</div>

<style>
  .mm {
    display: none;
  }
  @media (max-width: 767px) {
    .mm {
      display: block;
      margin-inline-start: auto;
    }
  }
  .mm-b {
    display: inline-grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin-inline-end: -10px;
    border: 0;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }
  .mm-b[aria-disabled="true"] {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .mm-b:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  /* Panneau sous l'en-tête, pleine largeur, fond plein : rien ne transparaît dessous. */
  .mm-p {
    position: absolute;
    inset-inline: 0;
    inset-block-start: 100%;
    max-height: calc(100dvh - 120px);
    overflow-y: auto;
    padding: var(--sp-2) max(var(--sp-4), env(safe-area-inset-left)) var(--sp-4);
    background: var(--surface-1);
    border-block-end: 1px solid var(--line-strong);
    box-shadow: 0 24px 48px rgb(0 0 0 / 0.45);
  }
  .mm-p[hidden] {
    display: none;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li + li {
    border-block-start: 1px solid var(--hair);
  }
  .mm-l {
    display: flex;
    align-items: center;
    min-height: 52px;
    padding-inline: var(--sp-2);
    color: var(--text);
    font-size: var(--fs-body);
    font-weight: 560;
    text-decoration: none;
    border-radius: var(--r-sm);
  }
  .mm-l[aria-current="page"] {
    color: var(--accent);
  }
  .mm-l.main {
    justify-content: center;
    margin-block: var(--sp-2) var(--sp-3);
    border-radius: var(--r-pill);
    background: var(--text);
    color: var(--bg);
  }
  .mm-l:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  @media (forced-colors: active) {
    .mm-p {
      border: 1px solid CanvasText;
    }
    .mm-l.main {
      border: 1px solid CanvasText;
    }
  }
</style>
