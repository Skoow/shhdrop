<script lang="ts">
  // Activation de la double authentification (conception compte §8.4, §21.15.4 point 4 ; plan du
  // compte, lot 13) : QR du lien d'ajout dessiné sur l'appareil (QrCode, aucune ressource tierce),
  // clé groupée par 4 avec « Copier la clé » (copie sans espaces), champ du premier code. Le lien ne
  // porte ni adresse ni pseudo (account/session.svelte.ts). Rien ne part avant « Activer ».
  import { t } from "../i18n/i18n.svelte";
  import { announce } from "./announce";
  import Button from "./Button.svelte";
  import { copyText } from "./clipboard";
  import CodeField from "./CodeField.svelte";
  import { Copy } from "./Icon";
  import QrCode from "./QrCode.svelte";

  type Props = {
    secret: string;
    lien: string;
    /** Premier code (6 chiffres) ; rend un message d'erreur, ou null si c'est fini. */
    onvalider: (code: string) => Promise<string | null>;
  };
  let { secret, lien, onvalider }: Props = $props();
  const groupes = $derived((secret.match(/.{1,4}/g) ?? []).join(" "));
  let code = $state("");
  let error = $state("");
  let el: HTMLInputElement | undefined = $state();

  async function copier() {
    if ((await copyText(secret)) === "copied") announce(t("account.totp.copied"));
  }
  async function activer() {
    error = "";
    if (code.length !== 6) {
      error = t("account.err.code6");
      el?.focus();
      return;
    }
    const e = await onvalider(code);
    if (e !== null) {
      error = e;
      el?.focus();
    }
  }
</script>

<div class="totp">
  <p class="note">{t("account.totp.scan")}</p>
  <div class="qr"><QrCode text={lien} label={t("account.totp.qr")} /></div>
  <div class="cle">
    <p class="l">{t("account.totp.key")}</p>
    <p class="v" translate="no">{groupes}</p>
    <Button variant="secondary" dense onpress={copier}>
      {#snippet icon()}<Copy size={18} strokeWidth={1.75} />{/snippet}
      {t("account.totp.copy")}
    </Button>
  </div>
  <form novalidate onsubmit={(e) => e.preventDefault()}>
    <CodeField label={t("account.totp.first")} {error} bind:value={code} bind:el onvalue={() => (error = "")} />
    <Button type="submit" onpress={activer}>{t("account.totp.activate")}</Button>
  </form>
</div>

<style>
  .totp {
    display: grid;
    gap: var(--sp-4);
    min-width: 0;
  }
  .note,
  .l {
    margin: 0;
    color: var(--text-2);
    font-size: var(--fs-small);
    line-height: var(--lh-small);
  }
  .l {
    font-weight: 600;
  }
  .qr {
    width: min(100%, 220px);
  }
  .cle {
    display: grid;
    gap: var(--sp-2);
    justify-items: start;
  }
  .v {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 1.0625rem;
    letter-spacing: 0.04em;
    word-spacing: 0.3em;
    overflow-wrap: anywhere;
  }
  form {
    display: grid;
    gap: var(--sp-3);
    justify-items: stretch;
  }
</style>
