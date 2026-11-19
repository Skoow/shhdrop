<script lang="ts">
  // Participants (spec §39.5, v3 §14.1) : couleur, pseudonyme (jamais la couleur seule), « vous »,
  // créateur, en ligne ou dernière connexion (heure de cet appareil, à la minute), puis « Quitter
  // le salon ». Codes de vérification, exclusion et réglages : plan C-5.
  import { t, getLang } from "../../i18n/i18n.svelte";
  import { formatClock } from "../../i18n/format";
  import * as S from "../../salon/salon.svelte";
  import InlineConfirm from "../../ui/InlineConfirm.svelte";

  const vue = S.vue;
  const conv = S.conversation()!;
  const lang = $derived(getLang());
  // Lignes recalculées à chaque changement du fil (conversation.ts n'est pas réactif lui-même).
  const lignes = $derived.by(() => {
    void vue.rev;
    void lang;
    return [...conv.presents].sort((a, b) => a - b).map((s) => ({ s, nom: nom(s), couleur: conv.couleur(s), enLigne: conv.presence.get(s)?.enLigne === true, vu: vu(s), avatar: conv.avatars.get(s) ? (S.masques.has(s) ? null : (S.pieces.urls[`avatar:${s}`] ?? null)) : null, aAvatar: !!conv.avatars.get(s) }));
  });

  // Avatars annoncés : relus du serveur et déchiffrés une fois (pièce de 64 Ko au plus, JPEG).
  $effect(() => {
    void vue.rev;
    for (const s of conv.presents) if (conv.avatars.get(s)) void S.avatarDe(s);
  });

  function nom(s: number): string {
    const n = conv.nom(s);
    return n.pseudo ?? t("salon.room.participant", { n: n.numero });
  }
  function vu(s: number): string {
    const p = conv.presence.get(s);
    if (p?.enLigne) return t("salon.room.seen.online");
    if (!p || p.derniereMin === 0) return t("salon.room.seen.offline");
    const ms = p.derniereMin * 60_000;
    const d = new Date(ms);
    const auj = new Date();
    const hier = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate() - 1);
    const heure = formatClock(ms, lang);
    if (d.toDateString() === auj.toDateString()) return t("salon.room.seen.today", { heure });
    if (d.toDateString() === hier.toDateString()) return t("salon.room.seen.yesterday", { heure });
    const date = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(d);
    return t("salon.room.seen.date", { date, heure });
  }
</script>

<ul class="membres">
  {#each lignes as l (l.s)}
    <li class={`c${l.couleur}`}>
      <span class="pastille" aria-hidden="true">{#if l.avatar}<img src={l.avatar} alt="" />{:else}{[...l.nom][0]?.toLocaleUpperCase() ?? ""}{/if}{#if l.enLigne}<span class="point"></span>{/if}</span>
      <span class="qui">
        <span class="nom"><bdi>{l.nom}</bdi>{#if l.s === conv.moi}{" "}({t("salon.room.you")}){/if}{#if l.s === conv.createurSiege}{" · "}{t("salon.room.creator")}{/if}</span>
        <span class="vu">{l.vu}</span>
        {#if l.aAvatar && l.s !== conv.moi}<button type="button" class="masquer" aria-pressed={S.masques.has(l.s)} onclick={() => (S.masques.has(l.s) ? S.masques.delete(l.s) : S.masques.add(l.s))}>{t("salon.avatar.masquer")}</button>{/if}
      </span>
    </li>
  {/each}
</ul>
<div class="quitter">
  <InlineConfirm label={t("salon.room.quit")} message={t("salon.room.quit.confirm")} confirmLabel={t("salon.room.quit")} kind="danger" triggerVariant="secondary" onconfirm={S.quitter} />
</div>

<style>
  .membres {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--sp-3);
    --p0: #5fe3b5;
    --p1: #7cc4ff;
    --p2: #b79cff;
    --p3: #ff8fc7;
    --p4: #ff9a7a;
    --p5: #f2c46d;
    --p6: #d8e86a;
    --p7: #4fd8e0;
    --p8: #e0a8f0;
    --p9: #d9c3a0;
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }
  .c0 { --pc: var(--p0); }
  .c1 { --pc: var(--p1); }
  .c2 { --pc: var(--p2); }
  .c3 { --pc: var(--p3); }
  .c4 { --pc: var(--p4); }
  .c5 { --pc: var(--p5); }
  .c6 { --pc: var(--p6); }
  .c7 { --pc: var(--p7); }
  .c8 { --pc: var(--p8); }
  .c9 { --pc: var(--p9); }
  .pastille {
    position: relative;
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--pc);
    color: var(--on-fmt);
    font-weight: 700;
  }
  .pastille img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }
  .masquer {
    justify-self: start;
    min-height: 32px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-2);
    font: inherit;
    font-size: 0.8125rem;
    text-decoration: underline;
    cursor: pointer;
  }
  .masquer[aria-pressed="true"] {
    color: var(--accent);
  }
  .point {
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--bg);
  }
  .qui {
    display: grid;
    min-width: 0;
  }
  .nom {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .vu {
    color: var(--text-2);
    font-size: 0.8125rem;
  }
  .quitter {
    margin-top: var(--sp-5);
  }
</style>
