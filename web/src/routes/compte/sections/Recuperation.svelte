<script lang="ts">
  // Récupération (conception compte §21.2.1, §21.15.4 point 9 ; plan, lot 13 ; monté seulement avec
  // __COMPTES__) : texte seul, ce qui est gardé et perdu après un mot de passe oublié, et l'attente
  // de 7 jours d'après une récupération (R4).
  import type { EtatServeur } from "../../../account/session.svelte";
  import { t } from "../../../i18n/i18n.svelte";
  import { jourLong } from "../erreurs";
  import Section from "./Section.svelte";

  type Props = { etat: EtatServeur | null };
  let { etat }: Props = $props();
</script>

<Section id="sec-recovery" titre={t("account.section.recovery")}>
  <p class="note">{t("account.recovery.body")}</p>
  <p class="note">{t("account.recovery.mail")}</p>
  {#if etat?.recupJusqu}<p class="raison">{t("account.forgot.recup", { date: jourLong(etat.recupJusqu) })}</p>{/if}
</Section>
