<script lang="ts">
  // « Renvoyer le code » (conception compte §12.1) : actif 60 s après l'envoi ; le compte à rebours
  // s'affiche sur le bouton et n'est lu qu'une fois par la région vivante (à l'envoi). Le serveur
  // garde sa propre règle (1 par minute, 3 par jour et par adresse) : ses refus passent à l'écran.
  import { untrack } from "svelte";
  import { renvoyerCode } from "../../account/session.svelte"; // monté seulement si __COMPTES__ (App.svelte)
  import { t } from "../../i18n/i18n.svelte";
  import { announce } from "../../ui/announce";
  import Button from "../../ui/Button.svelte";

  type Props = { onerreur: (e: unknown) => void };
  let { onerreur }: Props = $props();
  const ATTENTE_S = 60;
  let fin = $state(0);
  let reste = $state(ATTENTE_S);

  function demarrer() {
    fin = Date.now() + ATTENTE_S * 1000;
    reste = ATTENTE_S;
  }
  $effect(() =>
    untrack(() => {
      demarrer();
      announce(t("account.code.resendWait"));
    }),
  );
  $effect(() => {
    void fin;
    const id = setInterval(() => {
      reste = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
      if (reste === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  });

  async function renvoyer() {
    try {
      await renvoyerCode();
      demarrer();
      announce(t("account.code.resent"));
    } catch (e) {
      onerreur(e);
    }
  }
</script>

<Button variant="ghost" disabled={reste > 0} onpress={renvoyer}>{reste > 0 ? t("account.code.resendIn", { s: reste }) : t("account.code.resend")}</Button>
