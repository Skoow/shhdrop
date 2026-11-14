<script lang="ts">
  // Pseudo du compte (conception compte §21.5, §21.15.2) : vérifié 400 ms après la dernière frappe
  // par `verifier` (règle du salon sur l'appareil, puis disponibilité par le serveur quand une
  // étape ou une session existe). Réponses : « libre » (Disponible, --accent, coche), « pris »
  // (Déjà pris, erreur reliée au champ), « plus_tard » (pas encore d'étape : rien n'est affirmé),
  // un code pseudo_* (message de §39.4) ou « erreur » (rien d'affiché). Une réponse d'une frappe
  // précédente est ignorée. `error` (venu de l'écran, ex. pseudo_pris à la fin) l'emporte.
  import { untrack } from "svelte";
  import { t } from "../i18n/i18n.svelte";
  import { Check } from "./Icon";

  type Props = {
    value?: string;
    verifier: (p: string) => Promise<string>;
    error?: string;
    /** État courant, pour l'écran (bouton d'envoi). */
    onstatut?: (s: string) => void;
    /** Chaque frappe (l'écran efface alors une erreur venue du serveur). */
    onsaisie?: () => void;
    el?: HTMLInputElement | undefined;
  };
  let { value = $bindable(""), verifier, error, onstatut, onsaisie, el = $bindable() }: Props = $props();
  const uid = $props.id();

  const MESSAGES: Record<string, Parameters<typeof t>[0]> = {
    pris: "account.pseudo.taken",
    pseudo_longueur: "account.err.pseudoLongueur",
    pseudo_caracteres: "account.err.pseudoCaracteres",
    pseudo_ecritures: "account.err.pseudoEcritures",
    pseudo_reserve: "account.err.pseudoReserve",
  };
  let statut = $state(""); // "", "verif", "libre", "plus_tard", ou une clé de MESSAGES
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(timer));

  const mine = $derived(MESSAGES[statut] ? t(MESSAGES[statut]!) : "");
  const shown = $derived(error ?? mine);
  const describedBy = $derived([`${uid}-hint`, shown ? `${uid}-err` : statut === "libre" || statut === "plus_tard" ? `${uid}-st` : ""].filter(Boolean).join(" "));

  function poser(s: string) {
    statut = s;
    onstatut?.(s);
  }
  function oninput(e: Event) {
    value = (e.currentTarget as HTMLInputElement).value;
    onsaisie?.();
    planifier();
  }
  // Champ monté déjà rempli (étape suivante d'un écran) : vérifié lui aussi.
  $effect(() => untrack(() => void (value.trim() !== "" && planifier())));
  function planifier() {
    const n = ++seq;
    clearTimeout(timer);
    if (value.trim() === "") return poser("");
    poser("verif");
    timer = setTimeout(async () => {
      let r: string;
      try {
        r = await verifier(value);
      } catch {
        r = "erreur";
      }
      if (n === seq) poser(r);
    }, 400);
  }
</script>

<div class="field">
  <label for={uid}>{t("account.pseudo")}</label>
  <input
    bind:this={el}
    {value}
    {oninput}
    id={uid}
    type="text"
    autocomplete="nickname"
    autocapitalize="off"
    spellcheck="false"
    class={["input", { invalid: !!shown }]}
    aria-invalid={shown ? "true" : undefined}
    aria-describedby={describedBy}
  />
  <p id="{uid}-hint" class="hint">{t("account.pseudo.hint")}</p>
  {#if shown}
    <p id="{uid}-err" class="err" role="alert">{shown}</p>
  {:else if statut === "libre"}
    <p id="{uid}-st" class="ok" data-pseudo-status><Check size={16} strokeWidth={2.2} aria-hidden="true" />{t("account.pseudo.free")}</p>
  {:else if statut === "plus_tard"}
    <p id="{uid}-st" class="hint" data-pseudo-status>{t("account.pseudo.later")}</p>
  {/if}
</div>

<style>
  .field {
    display: grid;
    gap: var(--sp-2);
  }
  label {
    font-size: var(--fs-small);
    line-height: var(--lh-small);
    font-weight: 600;
    color: var(--text-2);
  }
  .input {
    width: 100%;
    min-height: 48px;
    padding: 0 var(--sp-4);
    border: 1px solid var(--line-strong);
    border-radius: var(--r-md);
    background: var(--surface-1);
    color: var(--text);
    font: inherit;
    font-size: max(1rem, 16px);
  }
  .input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .input.invalid {
    border-color: var(--danger);
  }
  .hint,
  .err,
  .ok {
    margin: 0;
    font-size: var(--fs-small);
    line-height: var(--lh-small);
  }
  .hint {
    color: var(--text-3);
  }
  .err {
    color: var(--danger);
  }
  .ok {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--accent);
    font-weight: 600;
  }
</style>
