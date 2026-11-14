<script lang="ts">
  // Avatar rond (conception compte §21.15.1, §21.15.3) : la photo du profil (octets du coffre,
  // adresse blob: locale libérée au changement) ou l'initiale du pseudo sur --surface-3. Décoratif :
  // le nom accessible est porté par le bouton qui l'entoure.
  type Props = { photo: Uint8Array | null; name: string; size?: number };
  let { photo, name, size = 36 }: Props = $props();
  const url = $derived(photo ? URL.createObjectURL(new Blob([photo as Uint8Array<ArrayBuffer>], { type: "image/jpeg" })) : null);
  $effect(() => {
    const u = url;
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  });
  const initial = $derived([...name.trim()][0]?.toLocaleUpperCase() ?? "");
</script>

<span class="av" style:--av="{size}px" aria-hidden="true">
  {#if url}<img src={url} alt="" width={size} height={size} />{:else}{initial}{/if}
</span>

<style>
  .av {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: var(--av);
    height: var(--av);
    overflow: hidden;
    border-radius: 50%;
    background: var(--surface-3);
    color: var(--text);
    font-weight: 600;
    font-size: calc(var(--av) * 0.44);
    line-height: 1;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
