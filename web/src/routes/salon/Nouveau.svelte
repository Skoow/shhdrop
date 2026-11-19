<script lang="ts">
  // Création d'un salon (« /salon/nouveau », spec §39.6 ; plan C-3) : durée, places, bascule
  // « Les participants peuvent détruire le salon », « Garder dans mon historique ». Compte exigé
  // (D42-26, conception compte §10.4) : sans session, l'écran mène à la connexion
  // (« ?suite=salon »). Le mot de passe est tiré sur l'appareil (forme générée seulement).
  // Seulement avec __COMPTES__ (et __SALONS__) : le module de compte n'est importé que là.
  import { t, getLang } from "../../i18n/i18n.svelte";
  import { followLink, href, navigate } from "../../app/router.svelte";
  import { account, etatCompte } from "../../account/session.svelte";
  import { creer, type ErreurCreation } from "../../salon/salon.svelte";
  import { DUREES, PLACES_MAX, PLACES_MIN, type Duree } from "../../salon/creation";
  import Cadre from "../compte/Cadre.svelte";
  import Segmented from "../../ui/Segmented.svelte";
  import Stepper from "../../ui/Stepper.svelte";
  import Switch from "../../ui/Switch.svelte";
  import Button from "../../ui/Button.svelte";
  import Banner from "../../ui/Banner.svelte";
  import { formatDayTime } from "../../i18n/format";

  const connecte = $derived(__COMPTES__ && account.etat === "ouvert");
  let duree = $state<Duree>(24);
  let ouvert = $state(true);
  let places = $state(2);
  // Limites du palier du compte (conception compte §11) : places et durée au plus ; 10 et 24 h sans réponse.
  let maxPlaces = $state(PLACES_MAX);
  let maxHeures = $state(24);
  $effect(() => {
    if (!connecte) return;
    void etatCompte()
      .then((e) => {
        maxPlaces = Math.max(PLACES_MIN, Math.min(PLACES_MAX, e.limites.places));
        maxHeures = e.limites.heures;
        places = Math.min(places, maxPlaces);
      })
      .catch(() => undefined);
  });
  let detruire = $state(false);
  let garder = $state(true);
  let etape = $state<"cles" | "robot" | "envoi" | null>(null);
  let erreur = $state<ErreurCreation | null>(null);

  const durees = $derived(DUREES.filter((d) => d <= maxHeures).map((d) => ({ value: d, label: t("salon.new.hours", { n: d }) })));
  const choixPlaces = $derived([
    { value: "ouvert", label: t("salon.new.places.open", { n: maxPlaces }) },
    { value: "fixe", label: t("salon.new.places") },
  ]);
  let mode = $state<"ouvert" | "fixe">("ouvert");
  $effect(() => {
    ouvert = mode === "ouvert";
  });

  async function lancer(): Promise<void> {
    erreur = null;
    const e = await creer({ ttlHours: duree, maxMembers: ouvert ? maxPlaces : places, membersCanDestroy: detruire, garder, onEtape: (x) => (etape = x) });
    etape = null;
    if (e) {
      erreur = e;
      return;
    }
    navigate("/salon");
  }

  function texteErreur(e: ErreurCreation): string {
    switch (e.code) {
      case "palier":
        return t("salon.new.err.palier", { salons: e.salons, places: e.places, heures: e.heures });
      case "banni":
        return t("salon.new.err.banni", { date: e.jusqu ? formatDayTime(Date.parse(e.jusqu), getLang()) : "" });
      case "compte_requis":
        return t("salon.new.err.compte");
      default:
        return t(`salon.new.err.${e.code}`);
    }
  }
</script>

<Cadre titre={t("salon.new.title")} sous={t("salon.new.sub")}>
  {#if !connecte}
    <p class="note">{t("salon.new.login")}</p>
    <ul class="liens">
      <li><a href={href("/compte/connexion?suite=salon")} onclick={(e) => followLink(e, "/compte/connexion?suite=salon")}>{t("account.login.title")}</a></li>
      <li><a href={href("/compte/inscription?suite=salon")} onclick={(e) => followLink(e, "/compte/inscription?suite=salon")}>{t("account.signup.title")}</a></li>
    </ul>
  {:else}
    <div class="form">
      <Segmented label={t("salon.new.duration")} options={durees} bind:value={duree} />
      <Segmented label={t("salon.new.places")} options={choixPlaces} bind:value={mode} />
      {#if !ouvert}
        <div class="places">
          <Stepper label={t("salon.new.places")} bind:value={places} min={PLACES_MIN} max={maxPlaces} />
          <span class="val" aria-live="polite">{t("salon.new.places.value", { n: places })}</span>
        </div>
      {/if}
      <Switch label={t("salon.new.destroy")} checked={detruire} onchange={(v) => (detruire = v)} />
      <Switch label={t("salon.new.keep")} hint={t("salon.manage.warn")} checked={garder} onchange={(v) => (garder = v)} />
      <p class="note">{t("salon.new.password")}</p>
      {#if erreur}
        <Banner kind="danger">{texteErreur(erreur)}</Banner>
      {/if}
      <div class="actions">
        <Button onpress={lancer} busy={etape !== null}>{etape ? t(`salon.new.step.${etape}`) : t("salon.new.create")}</Button>
      </div>
    </div>
  {/if}
</Cadre>

<style>
  .form {
    display: grid;
    gap: var(--sp-5);
  }
  .places {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
  }
  .val {
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }
</style>
