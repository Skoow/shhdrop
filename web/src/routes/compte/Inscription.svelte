<script lang="ts">
  // Inscription (/compte/inscription ; conception compte §10.1, §12.1, §21.3, §21.15.2 ; plan,
  // lot 10). Page montée seulement si __COMPTES__ (App.svelte) : sans le drapeau, la route n'existe
  // pas et ce module n'est pas dans le site.
  // 1. Adresse, mot de passe, pseudo, photo facultative, case des 15 ans : vérifiés sur l'appareil
  //    (verifierSaisie) avant tout envoi ; puis preuve anti-robot et inscription/debut, qui répond
  //    toujours de la même façon, que l'adresse ait un compte ou non.
  // 2. Code reçu : la disponibilité du pseudo n'est demandée qu'ici (pseudo/verifier exige
  //    l'étape) ; « Créer le compte » tire les clés et construit les deux coffres sur l'appareil
  //    (account/session.svelte.ts). L'état de l'adresse (déjà inscrite, bannie) n'est dit qu'après
  //    le code juste. Aucune étape de code de secours (décision 1 du propriétaire, §21.2).
  // Le mot de passe ne quitte pas l'appareil ; rien n'est écrit dans l'adresse de la page.
  import { tick } from "svelte";
  import { confirmer, inscrire, pseudoLibre, REGLAGES_DEFAUT, verifierSaisie } from "../../account/session.svelte";
  import { followLink, href, navigate, suite } from "../../app/router.svelte";
  import { getLang, t } from "../../i18n/i18n.svelte";
  import { announce } from "../../ui/announce";
  import AvatarPicker from "../../ui/AvatarPicker.svelte";
  import Banner from "../../ui/Banner.svelte";
  import Button from "../../ui/Button.svelte";
  import CodeField from "../../ui/CodeField.svelte";
  import PseudoField from "../../ui/PseudoField.svelte";
  import TextField from "../../ui/TextField.svelte";
  import Cadre from "./Cadre.svelte";
  import Case from "./Case.svelte";
  import { codeDe, erreur, jourLong, type Champ } from "./erreurs";
  import MotDePasse from "./MotDePasse.svelte";
  import { obtenirPreuve, preparerPreuve } from "./preuve";
  import Renvoi from "./Renvoi.svelte";
  import DemoCode from "./DemoCode.svelte";

  // Seul paramètre lu dans l'adresse : « ?suite=salon » (suite(), router.svelte.ts).
  const apres = suite(location.search);

  let etape = $state<"saisie" | "code" | "fini">("saisie");
  let email = $state("");
  let mdp = $state("");
  let pseudo = $state("");
  let photo = $state.raw<Uint8Array | null>(null);
  let age = $state(false);
  let code = $state("");
  let errs = $state<Partial<Record<Champ | "age", string>>>({});
  let bandeau = $state<{ kind: "info" | "warn" | "danger"; texte: string; liens?: boolean } | null>(null);
  let envoi = $state(false);
  const els: Partial<Record<Champ | "age", HTMLInputElement | undefined>> = $state({});
  const ORDRE: (Champ | "age")[] = ["email", "mdp", "pseudo", "age", "code"];

  async function focusErreur() {
    await tick();
    const k = ORDRE.find((c) => errs[c]);
    if (k) els[k]?.focus();
  }
  function montrer(e: unknown, moment: "inscription" | "code") {
    const x = erreur(e, moment);
    if (x.champ) {
      errs = { ...errs, [x.champ]: x.texte };
      void focusErreur();
    } else bandeau = { kind: "danger", texte: x.texte };
  }

  /** Règle du pseudo sur l'appareil ; disponibilité seulement quand l'étape existe. */
  async function verifierPseudo(p: string): Promise<string> {
    const r = await verifierSaisie({ pseudo: p });
    if (r.pseudo) return r.pseudo;
    if (etape !== "code") return "plus_tard";
    return (await pseudoLibre(p)) ? "libre" : "pris";
  }

  async function recevoir() {
    bandeau = null;
    const r = await verifierSaisie({ email, mdp, pseudo });
    const e: typeof errs = {};
    for (const [k, v] of Object.entries(r)) e[k as Champ] = erreur(new Error(v), "inscription").texte;
    if (!age) e.age = t("account.age.err");
    errs = e;
    if (Object.keys(e).length > 0) return focusErreur();
    try {
      await inscrire(email, getLang(), await obtenirPreuve());
    } catch (x) {
      return montrer(x, "inscription");
    }
    code = "";
    etape = "code";
    announce(t("account.code.sent"));
    await tick();
    els.code?.focus();
  }

  async function creer() {
    bandeau = null;
    errs = {};
    if (code.length !== 6) {
      errs = { code: t("account.err.code6") };
      return focusErreur();
    }
    envoi = true;
    try {
      await confirmer(code, mdp, { pseudo, photo, langue: getLang(), reglages: { ...REGLAGES_DEFAUT }, pass: null }, false);
    } catch (x) {
      const c = codeDe(x);
      if (c === "deja_inscrit") bandeau = { kind: "info", texte: t("account.state.deja"), liens: true };
      else if (c === "banni") bandeau = { kind: "warn", texte: t("account.state.banni", { date: jourLong((x as { jusqu?: string }).jusqu ?? "") }) };
      else if (c.startsWith("mdp_")) {
        etape = "saisie";
        montrer(x, "code");
      } else montrer(x, "code");
      if (bandeau) announce(bandeau.texte);
      return;
    } finally {
      envoi = false;
    }
    mdp = "";
    etape = "fini";
    announce(t("account.created"));
  }

  async function modifier() {
    bandeau = null;
    errs = {};
    etape = "saisie";
    await tick();
    els.email?.focus();
  }
  const versConnexion = apres === "salon" ? "/compte/connexion?suite=salon" : "/compte/connexion";
</script>

<Cadre titre={etape === "fini" ? t("account.created") : t("account.signup.title")} sous={etape === "saisie" ? t("account.signup.sub") : undefined}>
  {#if bandeau}
    <Banner kind={bandeau.kind}>
      {bandeau.texte}
      {#if bandeau.liens}
        <span class="liens-b">
          <a class="lien" href={href("/compte/connexion")} onclick={(e) => followLink(e, "/compte/connexion")}>{t("account.login.title")}</a>
          <a class="lien" href={href("/compte/oubli")} onclick={(e) => followLink(e, "/compte/oubli")}>{t("account.forgot.title")}</a>
        </span>
      {/if}
    </Banner>
  {/if}

  {#if etape === "saisie"}
    <form novalidate onsubmit={(e) => e.preventDefault()} oninput={preparerPreuve}>
      <TextField label={t("account.email")} type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" hint={t("account.email.hint")} error={errs.email} bind:value={email} bind:el={els.email} oninput={() => (errs.email = undefined)} />
      <MotDePasse label={t("account.password")} autocomplete="new-password" hint={t("account.password.hint")} error={errs.mdp} bind:value={mdp} bind:el={els.mdp} oninput={() => (errs.mdp = undefined)} />
      <PseudoField bind:value={pseudo} verifier={verifierPseudo} error={errs.pseudo} bind:el={els.pseudo} onsaisie={() => (errs.pseudo = undefined)} />
      <AvatarPicker bind:photo initiale={pseudo.trim()} />
      <div class="age">
        <Case label={t("account.age")} bind:checked={age} error={errs.age} bind:el={els.age} />
        <a class="lien" href={href("/conditions")} target="_blank" rel="noopener noreferrer">{t("account.age.link")}</a>
      </div>
      <Button type="submit" onpress={recevoir}>{t("account.signup.send")}</Button>
    </form>
    <ul class="liens">
      <li><a href={href(versConnexion)} onclick={(e) => followLink(e, versConnexion)}>{t("account.signup.have")}</a></li>
    </ul>
  {:else if etape === "code"}
    <p class="note">{t("account.code.sent")}</p>
    <DemoCode />
    <form novalidate onsubmit={(e) => e.preventDefault()}>
      <PseudoField bind:value={pseudo} verifier={verifierPseudo} error={errs.pseudo} bind:el={els.pseudo} onsaisie={() => (errs.pseudo = undefined)} />
      <CodeField label={t("account.code")} error={errs.code} bind:value={code} bind:el={els.code} onvalue={() => (errs.code = undefined)} />
      <Button type="submit" onpress={creer}>{envoi ? t("account.verifying") : t("account.signup.create")}</Button>
    </form>
    <div class="actions">
      <Renvoi onerreur={(e) => montrer(e, "code")} />
      <Button variant="ghost" onpress={modifier}>{t("account.email.edit")}</Button>
    </div>
  {:else}
    <div class="actions">
      <Button onpress={() => navigate(apres === "salon" && __SALONS__ ? "/salon/nouveau" : "/")}>{t("account.continue")}</Button>
    </div>
  {/if}
</Cadre>

<style>
  .age {
    display: grid;
    gap: 0;
  }
  .age .lien {
    margin-left: calc(22px + var(--sp-3));
    font-size: var(--fs-small);
  }
  .liens-b {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--sp-4);
  }
</style>
