<script lang="ts">
  // Accueil connecté (conception compte §21.7, §21.15.1) : une seule liste, façon messagerie, de ce
  // que l'appareil sait déjà (historique de l'appareil, fusionné avec le coffre privé à la
  // connexion) : salons, partages reçus (ceux qu'on a ouverts), envois. AUCUNE requête au
  // chargement (une salve relierait en direct les entrées d'une même connexion) : chaque entrée
  // n'est relue qu'à son ouverture ou sur « Actualiser », au plus une fois toutes les 5 min. Pas
  // de compteur de messages non lus : il faudrait rester connecté à chaque salon (R10).
  // Ce composant ne connaît pas le compte : routes/compte/Accueil.svelte lui donne le profil.
  import { tick, untrack } from "svelte";
  import { navigate } from "../../app/router.svelte";
  import { t, type Key } from "../../i18n/i18n.svelte";
  import { destroyFromHistory, forgetShare, loadHistory, refreshShare, shares } from "../../history/live.svelte";
  import { effectiveState, endOf, type HistoryEntry } from "../../history/store";
  import { formatBytes } from "../../i18n/format";
  import { getLang } from "../../i18n/i18n.svelte";
  import { announce } from "../../ui/announce";
  import Avatar from "../../ui/Avatar.svelte";
  import Banner from "../../ui/Banner.svelte";
  import Button from "../../ui/Button.svelte";
  import { MessagesSquare, Plus, Search, X } from "../../ui/Icon";
  import IconButton from "../../ui/IconButton.svelte";
  import InboxDetail from "../../ui/InboxDetail.svelte";
  import InboxRow from "../../ui/InboxRow.svelte";
  import NewSheet from "../../ui/NewSheet.svelte";
  import Segmented from "../../ui/Segmented.svelte";

  type Props = {
    profile: { pseudo: string; photo: Uint8Array | null } | null;
    /** Après « Mot de passe oublié » (§21.2.3) : bandeau d'information. */
    recovered?: boolean;
    /** Coffre privé illisible (§12.4) : bandeau d'erreur. */
    vaultError?: boolean;
    onprofile?: () => void;
  };
  let { profile, recovered = false, vaultError = false, onprofile }: Props = $props();
  const lang = $derived(getLang());

  let now = $state(Date.now());
  $effect(() => {
    untrack(() => void loadHistory(true)); // lecture locale seulement
    const id = setInterval(() => (now = Date.now()), 30_000);
    const back = () => {
      if (document.visibilityState === "visible") now = Date.now();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", back);
    };
  });

  type Filter = "all" | "rooms" | "received" | "sent";
  let filter = $state<Filter>("all");
  const filters = $derived([
    { value: "all" as const, label: t("home.inbox.filter.all") },
    { value: "rooms" as const, label: t("home.inbox.filter.rooms") },
    { value: "received" as const, label: t("home.inbox.filter.received") },
    { value: "sent" as const, label: t("home.inbox.filter.sent") },
  ]);
  const inFilter = (e: HistoryEntry, f: Filter) =>
    f === "all" || (f === "rooms" ? e.sorte === "salon_cree" || e.sorte === "salon_rejoint" : f === "received" ? e.sorte === "recu" : e.sorte === "envoi");

  /** Titre affiché d'une ligne (recherche locale : libellés et titres, aucune requête). */
  function titleOf(e: HistoryEntry): string {
    const items = t("hist.items", { n: e.itemsCount });
    if (e.sorte === "recu") return t("home.inbox.row.recu", { items, size: formatBytes(e.sizeBytes, lang) });
    if (e.sorte === "envoi") return t("home.inbox.row.envoi", { items });
    return t(`home.inbox.row.${e.sorte}` as Key, { label: e.label || t("home.inbox.room"), date: new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(e.createdAt) });
  }
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();

  /** Par activité : les entrées en cours, la plus récente d'abord ; puis les finies, fin la plus récente d'abord. */
  function byActivity(list: readonly HistoryEntry[], t0: number): HistoryEntry[] {
    const done = (e: HistoryEntry) => {
      const s = effectiveState(e, t0);
      return s === "gone" || s === "expired";
    };
    return [...list].sort((a, b) => Number(done(a)) - Number(done(b)) || (done(a) ? endOf(b, t0) - endOf(a, t0) : b.createdAt - a.createdAt));
  }

  let searching = $state(false);
  let query = $state("");
  const sorted = $derived(byActivity(shares.all, now));
  const shown = $derived(sorted.filter((e) => inFilter(e, filter) && (query.trim() === "" || fold(titleOf(e)).includes(fold(query.trim())))));

  // Annonce du changement de filtre (« 4 salons ») ; jamais au premier affichage.
  let lastFilter: Filter = "all";
  $effect(() => {
    const f = filter;
    if (f === lastFilter) return;
    lastFilter = f;
    const n = untrack(() => sorted.filter((e) => inFilter(e, f)).length);
    announce(t(`home.inbox.count.${f}` as Key, { n }));
  });

  let selectedId = $state<string | null>(null);
  const selected = $derived(selectedId === null ? null : (shares.all.find((e) => e.id === selectedId) ?? null));

  let searchBtn: HTMLButtonElement | undefined = $state();
  function openSearch() {
    searching = true;
  }
  function closeSearch() {
    searching = false;
    query = "";
    void tick().then(() => searchBtn?.focus());
  }

  async function remove(e: HistoryEntry) {
    if (selectedId === e.id) selectedId = null;
    await forgetShare(e.id);
    announce(t("home.inbox.removed"));
  }

  let newOpen = $state(false);

</script>

<section class={["inbox", selected && "has-sel"]} aria-labelledby="inbox-title">
  <div class="col">
    <header class="hd">
      {#if searching}
        <div class="search">
          <input
            {@attach (el: HTMLInputElement) => el.focus()}
            bind:value={query}
            type="search"
            class="q"
            aria-label={t("home.inbox.search.label")}
            placeholder={t("home.inbox.search.label")}
            autocomplete="off"
            onkeydown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                closeSearch();
              }
            }}
          />
          <IconButton label={t("home.inbox.search.close")} onpress={closeSearch}><X size={20} /></IconButton>
        </div>
        <h1 id="inbox-title" class="sr-only">{t("home.inbox.title")}</h1>
      {:else}
        <button type="button" class="me" aria-label={t("home.inbox.profile")} onclick={() => (onprofile ? onprofile() : navigate("/compte/profil"))}>
          <Avatar photo={profile?.photo ?? null} name={profile?.pseudo ?? ""} />
        </button>
        <h1 id="inbox-title" class="title">{t("home.inbox.title")}</h1>
        <IconButton label={t("home.inbox.search")} onpress={openSearch} bind:el={searchBtn}><Search size={22} /></IconButton>
      {/if}
    </header>

    <div class="filters"><Segmented label={t("home.inbox.filter")} options={filters} bind:value={filter} /></div>

    {#if recovered}<Banner kind="info">{t("home.inbox.recovered")}</Banner>{/if}
    {#if vaultError}<Banner kind="danger">{t("account.err.coffre")}</Banner>{/if}

    {#if shares.status === "unavailable"}
      <div class="empty" data-history-unavailable>
        <h2 class="et">{t("hist.unavailable.title")}</h2>
        <p class="sub">{t("hist.unavailable.body")}</p>
      </div>
    {:else if shares.status !== "ready"}
      <ul class="list" role="list" aria-busy="true" aria-label={t("home.inbox.loading")}>
        {#each [0, 1, 2, 3, 4, 5] as k (k)}<li class="skel" aria-hidden="true"><span></span><span></span></li>{/each}
      </ul>
    {:else if shares.all.length === 0}
      <div class="empty" data-inbox-empty>
        <span class="art" aria-hidden="true"><MessagesSquare size={44} strokeWidth={1.4} /></span>
        <h2 class="et">{t("home.inbox.empty.title")}</h2>
        <p class="sub">{t("home.inbox.empty.body")}</p>
        <div class="acts">
          <Button variant="primary" onpress={() => navigate("/envoyer")}>{t("home.inbox.empty.send")}</Button>
          <Button variant="secondary" aria-disabled="true" onpress={() => announce(t("home.inbox.new.room.d"))}>{t("home.inbox.new.room")}</Button>
        </div>
      </div>
    {:else if shown.length === 0}
      <p class="sub none">{t("hist.empty.filter")}</p>
    {:else}
      <ul class="list" role="list">
        {#each shown as e, i (e.id)}
          <InboxRow entry={e} {now} index={i} selected={selectedId === e.id} onopen={() => (selectedId = e.id)} onremove={() => void remove(e)} />
        {/each}
      </ul>
    {/if}
  </div>

  <div class="pane">
    {#if selected}
      {#key selected.id}
        <InboxDetail
          entry={selected}
          {now}
          info={shares.info[selected.id]}
          onback={() => (selectedId = null)}
          onrefresh={async () => void (await refreshShare(selected.id))}
          ondestroy={() => destroyFromHistory(selected.id)}
          onremove={() => void remove(selected)}
        />
      {/key}
    {:else if shares.all.length > 0}
      <div class="pick">
        <span class="art"><MessagesSquare size={40} strokeWidth={1.4} /></span>
        <p class="sub">{t("home.inbox.pick")}</p>
      </div>
    {/if}
  </div>

  <span class="fab">
    <Button variant="primary" onpress={() => void (newOpen = true)}>
      {#snippet icon()}<Plus size={22} strokeWidth={2} />{/snippet}
      {t("home.inbox.new")}
    </Button>
  </span>
  <NewSheet bind:open={newOpen} />
</section>

<style>
  .inbox {
    width: min(100%, 1120px);
    margin-inline: auto;
    padding: 0 0 calc(var(--sp-8) + 56px);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5);
  }
  .col {
    display: grid;
    align-content: start;
    gap: var(--sp-3);
    min-width: 0;
  }
  .hd {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-height: 56px;
    padding: var(--sp-2) 0;
    background: var(--glass);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
  }
  .me {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
  }
  .me:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .title {
    flex: 1 1 auto;
    margin: 0;
    font-size: var(--fs-h2);
    line-height: 1.15;
  }
  .search {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .q {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 44px;
    padding: 0 var(--sp-3);
    border: 1px solid var(--line-strong);
    border-radius: var(--r-md, 12px);
    background: var(--surface-1);
    color: var(--text);
    font: inherit;
  }
  .q:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .filters {
    overflow-x: auto;
    scrollbar-width: none;
  }
  .filters :global(.seg) {
    width: max-content;
    min-width: 100%;
  }
  .list {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .skel {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    height: 72px;
    padding: 0 var(--sp-3);
  }
  .skel span:first-child {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--surface-1);
  }
  .skel span:last-child {
    flex: 1;
    height: 14px;
    border-radius: 7px;
    background: var(--surface-1);
  }
  .empty {
    display: grid;
    justify-items: start;
    gap: var(--sp-3);
    padding: var(--sp-6) 0;
    max-width: 62ch;
  }
  .art {
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: var(--surface-1);
    color: var(--info);
  }
  .et {
    margin: 0;
    font-size: var(--fs-h2);
  }
  .sub {
    margin: 0;
    color: var(--text-2);
    max-width: 62ch;
  }
  .none {
    padding: var(--sp-4) var(--sp-3);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
  .pane {
    display: none;
    min-width: 0;
  }
  .pick {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: var(--sp-3);
    min-height: 320px;
    border: 1px dashed var(--hair-2);
    border-radius: var(--r-xl);
    text-align: center;
  }
  .fab {
    position: fixed;
    right: max(var(--sp-4), env(safe-area-inset-right));
    bottom: calc(var(--tabbar-h, 64px) + var(--sp-4) + env(safe-area-inset-bottom));
    z-index: 5;
  }
  .fab :global(.btn) {
    min-height: 56px;
    border-radius: 28px;
    box-shadow: var(--e-3, 0 8px 24px rgb(0 0 0 / 0.4));
  }
  /* Téléphone : le détail remplace la liste. */
  @media (max-width: 959px) {
    .has-sel .col {
      display: none;
    }
    .has-sel .pane {
      display: block;
    }
    .has-sel .fab {
      display: none;
    }
  }
  /* Ordinateur : deux colonnes, liste de 360 px à gauche, détail à droite. */
  @media (min-width: 960px) {
    .inbox {
      grid-template-columns: 360px minmax(0, 1fr);
      padding: var(--sp-6) var(--sp-4) var(--sp-8);
      gap: var(--sp-6);
    }
    .pane {
      display: block;
      position: sticky;
      top: var(--sp-6);
      align-self: start;
    }
    .fab {
      bottom: var(--sp-6);
    }
  }
</style>
