<script lang="ts">
  // L'application chargée à l'adresse d'une page d'information (serveur qui ne connaît pas
  // encore les pages séparées) : on demande le fichier de la page (« /securite.html »). Déjà sur
  // ce fichier (il manque) : « page introuvable », jamais de boucle.
  import { onMount } from "svelte";
  import NotFound from "../routes/NotFound.svelte";

  const onFile = typeof location !== "undefined" && location.pathname.endsWith(".html");
  onMount(() => {
    if (!onFile) location.replace(location.pathname.replace(/\/$/, "") + ".html");
  });
</script>

{#if onFile}<NotFound />{/if}
