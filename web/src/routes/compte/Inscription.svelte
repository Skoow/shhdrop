<script lang="ts">
  // Inscription (/compte/inscription ; conception compte §10.1, §12.1, §21.3, §21.15.2 ; plan,
  // lot 10). Page montée seulement si __COMPTES__ (App.svelte) : sans le drapeau, la route n'existe
  // pas et ce module n'est pas dans le site.
  // Simplifiée le 20 novembre (propriétaire) : plus de pseudo, de photo ni de case à cocher.
  // 1. Adresse, mot de passe et sa confirmation, vérifiés sur l'appareil (verifierSaisie) avant
  //    tout envoi ; « Créer » : preuve anti-robot et inscription/debut, qui répond toujours de la
  //    même façon, que l'adresse ait un compte ou non. Sous le bouton, la phrase des 15 ans et des
  //    conditions (l'acceptation est faite par la création, datée par elle).
  // 2. Code reçu : « Valider » tire les clés et construit les deux coffres sur l'appareil
  //    (account/session.svelte.ts), avec un pseudo provisoire tiré au hasard (le serveur exige un
  //    pseudo unique) : à changer ensuite dans le profil ; s'il est déjà pris, un autre est tiré.
  //    L'état de l'adresse (déjà inscrite, bannie) n'est dit qu'après le code juste. Aucune étape
  //    de code de secours (décision 1 du propriétaire, §21.2).
  // Le mot de passe ne quitte pas l'appareil ; rien n'est écrit dans l'adresse de la page.
  import { tick } from "svelte";
  import { confirmer, inscrire, REGLAGES_DEFAUT, verifierSaisie } from "../../account/session.svelte";
  import { followLink, href, navigate, suite } from "../../app/router.svelte";
  import { getLang, t } from "../../i18n/i18n.svelte";
  import { announce } from "../../ui/announce";
  import Banner from "../../ui/Banner.svelte";
  import Button from "../../ui/Button.svelte";
  import CodeField from "../../ui/CodeField.svelte";
  import TextField from "../../ui/TextField.svelte";
  import Cadre from "./Cadre.svelte";
  import { codeDe, erreur, jourLong, type Champ } from "./erreurs";
  import MotDePasse from "./MotDePasse.svelte";
  import { obtenirPreuve, preparerPreuve } from "./preuve";
  import Renvoi from "./Renvoi.svelte";
  import ReglesMdp from "./ReglesMdp.svelte";
  import { estJetable, mdpFort, suggestion } from "./verifs";
  import DemoCode from "./DemoCode.svelte";

  // Seul paramètre lu dans l'adresse : « ?suite=salon » (suite(), router.svelte.ts).
  const apres = suite(location.search);

  let etape = $state<"saisie" | "code" | "fini">("saisie");
  let email = $state("");
  let mdp = $state("");
  let mdp2 = $state("");
  let pseudo = $state("");
  let code = $state("");
  let errs = $state<Partial<Record<Champ | "mdp2", string>>>({});
  let bandeau = $state<{ kind: "info" | "warn" | "danger"; texte: string; liens?: boolean } | null>(null);
  let envoi = $state(false);
  const els: Partial<Record<Champ | "mdp2", HTMLInputElement | undefined>> = $state({});
  const ORDRE: (Champ | "mdp2")[] = ["email", "mdp", "mdp2", "code"];

  // Adresse vérifiée pendant la frappe (20 novembre) : format (moteur), domaine jetable (liste du
  // serveur, sur l'appareil), faute de frappe probable dans un domaine courant (correction
  // proposée). 500 ms après la dernière touche ; rien n'est envoyé.
  let proposee = $state<string | null>(null);
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  async function verifierAdresse(v: string) {
    proposee = null;
    if (!/@[^@]*\.[^@.]{2,}$/.test(v.trim())) return;
    const r = await verifierSaisie({ email: v });
    if (v !== email) return; // une frappe plus récente prend la main
    if (r.email) {
      errs = { ...errs, email: erreur(new Error(r.email), "inscription").texte };
      return;
    }
    // Faute de frappe d'abord : « gmial.com » est aussi dans la liste des jetables, la correction
    // vaut mieux qu'un refus.
    proposee = suggestion(v);
    if (proposee) return;
    if (await estJetable(v)) {
      if (v === email) errs = { ...errs, email: t("account.err.jetable") };
    }
  }
  function adresseTapee() {
    errs.email = undefined;
    proposee = null;
    clearTimeout(minuterie);
    const v = email;
    minuterie = setTimeout(() => void verifierAdresse(v), 500);
  }
  $effect(() => () => clearTimeout(minuterie));

  /** Pseudo provisoire (« Membre » et 6 chiffres tirés au hasard), à changer dans le profil. */
  function pseudoProvisoire(): string {
    const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
    return `${t("account.pseudo.temp")}${String(n).padStart(6, "0")}`;
  }

  async function focusErreur() {
    await tick();
    const k = ORDRE.find((c) => errs[c]);
    if (k) els[k]?.focus();
  }
  function montrer(e: unknown, moment: "inscription" | "code") {
    const x = erreur(e, moment);
    if (x.champ && x.champ !== "pseudo" && x.champ !== "photo") {
      errs = { ...errs, [x.champ]: x.texte };
      void focusErreur();
    } else bandeau = { kind: "danger", texte: x.texte };
  }

  async function recevoir() {
    bandeau = null;
    const r = await verifierSaisie({ email, mdp });
    const e: typeof errs = {};
    for (const [k, v] of Object.entries(r)) e[k as Champ] = erreur(new Error(v), "inscription").texte;
    if (!e.email && (await estJetable(email))) e.email = t("account.err.jetable");
    if (!e.mdp && !mdpFort(mdp, email)) e.mdp = t("account.mdp.faible");
    if (!e.mdp && mdp2 !== mdp) e.mdp2 = t("account.password2.err");
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
      // Pseudo provisoire ; déjà pris (rare) : un autre, deux fois au plus (l'étape reste valable).
      for (let essai = 0; ; essai++) {
        pseudo = pseudoProvisoire();
        try {
          await confirmer(code, mdp, { pseudo, photo: null, langue: getLang(), reglages: { ...REGLAGES_DEFAUT }, pass: null }, false);
          break;
        } catch (x) {
          if (codeDe(x) !== "pseudo_pris" || essai >= 2) throw x;
        }
      }
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
    mdp2 = "";
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
      <TextField label={t("account.email")} type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" error={errs.email} bind:value={email} bind:el={els.email} oninput={adresseTapee} />
      {#if proposee}
        <p class="propose" data-propose>
          {t("account.email.propose")}
          <button type="button" class="lien-b" onclick={() => ((email = proposee!), (proposee = null))}>{proposee}</button>&#8239;?
        </p>
      {/if}
      <MotDePasse label={t("account.password")} autocomplete="new-password" error={errs.mdp} bind:value={mdp} bind:el={els.mdp} oninput={() => (errs.mdp = undefined)} />
      <ReglesMdp {mdp} adresse={email} />
      <MotDePasse label={t("account.password2")} autocomplete="new-password" error={errs.mdp2} bind:value={mdp2} bind:el={els.mdp2} oninput={() => (errs.mdp2 = undefined)} />
      <Button type="submit" onpress={recevoir}>{t("account.signup.go")}</Button>
      <!-- Plus de case (20 novembre) : la création vaut acceptation, dite ici avec le lien. -->
      <p class="legal" data-legal>
        {t("account.signup.legal.a")}<a class="lien-t" href={href("/conditions")} target="_blank" rel="noopener noreferrer">{t("account.signup.legal.link")}</a>{t("account.signup.legal.b")}
      </p>
    </form>
    <ul class="liens">
      <li><a href={href(versConnexion)} onclick={(e) => followLink(e, versConnexion)}>{t("account.signup.have")}</a></li>
    </ul>
  {:else if etape === "code"}
    <p class="note">{t("account.code.sent")}</p>
    <DemoCode />
    <form novalidate onsubmit={(e) => e.preventDefault()}>
      <CodeField label={t("account.code")} error={errs.code} bind:value={code} bind:el={els.code} onvalue={() => (errs.code = undefined)} />
      <Button type="submit" onpress={creer}>{envoi ? t("account.verifying") : t("account.signup.create")}</Button>
    </form>
    <div class="actions">
      <Renvoi onerreur={(e) => montrer(e, "code")} />
      <Button variant="ghost" onpress={modifier}>{t("account.email.edit")}</Button>
    </div>
  {:else}
    <p class="note" data-pseudo-temp>
      {t("account.created.pseudo", { pseudo })}
      <a class="lien-t" href={href("/compte/profil")} onclick={(e) => followLink(e, "/compte/profil")}>{t("account.created.pseudo.link")}</a>
    </p>
    <div class="actions">
      <Button onpress={() => navigate(apres === "salon" && __SALONS__ ? "/salon/nouveau" : "/")}>{t("account.continue")}</Button>
    </div>
  {/if}
</Cadre>

<style>
  .propose {
    margin: calc(-1 * var(--sp-3)) 0 0;
    color: var(--text-2);
    font-size: var(--fs-small);
  }
  .lien-b {
    padding: 0;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }
  .lien-b:hover {
    color: var(--accent);
  }
  .lien-b:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .legal {
    margin: calc(-1 * var(--sp-2)) 0 0;
    color: var(--text-2);
    font-size: var(--fs-small);
    line-height: 1.5;
    text-align: center;
    text-wrap: pretty;
  }
  .liens-b {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--sp-4);
  }
</style>
