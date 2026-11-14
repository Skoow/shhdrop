<script lang="ts">
  // Double authentification (conception compte §8.4, §21.2.4, §21.15.4 point 4 ; plan, lot 13 ;
  // monté seulement avec __COMPTES__). Interrupteur ; activation : QR et clé (TotpSetup), premier
  // code ; retrait : mot de passe et code de l'application. Le serveur exige une session
  // « récente » : sans elle (403 recent), le mot de passe est demandé ici, puis l'action reprend.
  // Demande de retrait en cours (récupération sans l'application, §21.2.4) : bandeau et
  // « Annuler la demande ».
  import { tick } from "svelte";
  import { adresseConnue, confirmerIdentite, totpActiver, totpAnnulerRetrait, totpCommencer, totpRetirer, type EtatServeur } from "../../../account/session.svelte";
  import { t } from "../../../i18n/i18n.svelte";
  import { announce } from "../../../ui/announce";
  import Banner from "../../../ui/Banner.svelte";
  import Button from "../../../ui/Button.svelte";
  import Switch from "../../../ui/Switch.svelte";
  import TotpSetup from "../../../ui/TotpSetup.svelte";
  import { codeDe, erreur, type Champ } from "../erreurs";
  import Identite from "../Identite.svelte";
  import Section from "./Section.svelte";

  type Props = { etat: EtatServeur | null; onchange: () => Promise<void> };
  let { etat, onchange }: Props = $props();
  /** identite : mot de passe demandé avant `suite` (activer, ou retirer). */
  let vue = $state<"repos" | "identite" | "activation">("repos");
  let suite = $state<"activer" | "retirer">("activer");
  let setup = $state.raw<{ secret: string; lien: string } | null>(null);
  let email = $state("");
  let mdp = $state("");
  let code = $state("");
  let errs = $state<Partial<Record<Champ, string>>>({});
  let global = $state("");
  let ok = $state("");
  let els: Partial<Record<Champ, HTMLInputElement | undefined>> = $state({});
  let demanderEmail = $state(false);

  function montrer(e: unknown) {
    const x = erreur(e, "parametres");
    if (x.champ) {
      errs = { [x.champ]: x.texte };
      void tick().then(() => els[x.champ!]?.focus());
    } else global = x.texte;
    announce(x.texte);
  }
  async function demanderIdentite(apres: "activer" | "retirer", recent: boolean) {
    suite = apres;
    demanderEmail = !adresseConnue();
    mdp = code = "";
    errs = {};
    global = recent ? t("account.identity.recent") : "";
    vue = "identite";
    await tick();
    (demanderEmail ? els.email : els.mdp)?.focus();
  }
  async function commencer() {
    try {
      setup = await totpCommencer();
      vue = "activation";
    } catch (e) {
      if (codeDe(e) === "recent") return demanderIdentite("activer", true);
      montrer(e);
    }
  }
  async function basculer(v: boolean) {
    ok = "";
    global = "";
    if (v) await commencer();
    else await demanderIdentite("retirer", false);
  }
  async function continuer() {
    errs = {};
    global = "";
    try {
      await confirmerIdentite(mdp, etat?.totp ? code : "", demanderEmail ? email : undefined);
    } catch (e) {
      return montrer(e);
    }
    mdp = code = "";
    if (suite === "activer") {
      vue = "repos";
      return commencer();
    }
    try {
      await totpRetirer();
    } catch (e) {
      return montrer(e);
    }
    vue = "repos";
    ok = t("account.totp.off");
    announce(ok);
    await onchange();
  }
  async function activer(c: string): Promise<string | null> {
    try {
      await totpActiver(c);
    } catch (e) {
      return erreur(e, "totp").texte;
    }
    setup = null;
    vue = "repos";
    ok = t("account.totp.on");
    announce(ok);
    await onchange();
    return null;
  }
  async function annulerRetrait() {
    try {
      await totpAnnulerRetrait();
    } catch (e) {
      return montrer(e);
    }
    announce(t("account.totp.cancelled"));
    await onchange();
  }
</script>

<Section id="sec-totp" titre={t("account.section.totp")}>
  {#if etat?.retraitTotpLe}
    <Banner kind="warn" action={{ label: t("account.totp.cancelPending"), onpress: annulerRetrait }}>{t("account.totp.pending")}</Banner>
  {/if}
  <Switch label={t("account.totp.switch")} hint={t("account.totp.hint")} checked={!!etat?.totp} disabled={etat === null || vue !== "repos"} onchange={basculer} />
  {#if ok}<p class="ok" role="status">{ok}</p>{/if}
  {#if vue === "identite"}
    <form class="form" novalidate onsubmit={(e) => e.preventDefault()}>
      {#if global}<p class={global === t("account.identity.recent") ? "note" : "err"} role="alert">{global}</p>{/if}
      <Identite {demanderEmail} totp={!!etat?.totp} bind:email bind:mdp bind:code bind:errs bind:els />
      <div class="actions">
        <Button type="submit" variant={suite === "retirer" ? "danger" : "primary"} onpress={continuer}>{suite === "retirer" ? t("account.totp.removeAsk") : t("account.identity.submit")}</Button>
        <Button variant="ghost" onpress={() => void (vue = "repos")}>{t("common.cancel")}</Button>
      </div>
    </form>
  {:else if vue === "activation" && setup}
    <div class="form">
      <TotpSetup secret={setup.secret} lien={setup.lien} onvalider={activer} />
      <div class="actions"><Button variant="ghost" onpress={() => {
            setup = null;
            vue = "repos";
          }}>{t("common.cancel")}</Button></div>
    </div>
  {:else if global}
    <p class="err" role="alert">{global}</p>
  {/if}
</Section>
