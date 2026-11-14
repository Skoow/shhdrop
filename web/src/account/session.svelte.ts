// Le compte sur cet appareil (conception compte §9, §10, §21.2 ; plan du compte, lot 9). Seul
// détenteur du jeton de session, de K_compte et de s_profil (règle de §37.3,
// source-rules.test.ts) ; les écrans n'importent que ce module, derrière __COMPTES__.
// - Le mot de passe ne quitte jamais l'appareil : seul A_auth (Argon2id puis HKDF, moteur Rust)
//   part ; KEK_mdp n'ouvre ou ne ferme que l'enveloppe de K_compte, ici.
// - Par défaut tout est en mémoire (un rechargement redemande le mot de passe) ; « Rester
//   connecté » : persist.ts (sa base IndexedDB, chiffrée, clé non extractible).
// - Deux coffres (vaults.ts) : profil (pseudo, photo, langue, réglages, pass ; séquestré : le
//   serveur peut le rouvrir) et privé (secrets : par le mot de passe seulement). L'écriture du
//   coffre privé après un événement de partage ou de salon est différée de 2 à 12 min, tirées au
//   hasard (§37.11 A-G2 : une écriture juste après l'événement les relierait en direct).
// - Pseudo : règle et p_canon du module du salon (src/salon/engine.ts), chargé seulement ici.
// - Déconnexion : le serveur oublie la session (au mieux : sans réseau, l'appareil efface quand
//   même) ; l'appareil efface la base de persist.ts, K_compte, s_profil et le clair des coffres.
import * as api from "./api";
import { netParDefaut, type Net, type Preuve } from "./api";
import { aleatoire32, clesDeKCompte, clesDuCompte, ouvrirEnveloppe, scellerEnveloppe, type ClesCompte } from "./keys";
import { creerCoffre, ouvrir, priveDeJson, priveEnJson, priveVide, profilDeJson, profilEnJson, sceller, type Coffre, type CoffrePrive, type Profil, type Sorte } from "./vaults";
import { nomAppareil, scellerEtiquette } from "./device";
import { effacer, idbDuNavigateur, lire, sauver } from "./persist";
import { deriverCompte, motDePasseValide, normaliserAdresse, type Adresse } from "../engine/index";
import { loadSalonEngine, type SalonEngine } from "../salon/engine";

export type { Profil, Reglages, CoffrePrive, EntreePrivee } from "./vaults";
export { REGLAGES_DEFAUT } from "./vaults";
export { CompteError, type Preuve } from "./api";

type Bytes = Uint8Array<ArrayBuffer>;
type PseudoMoteur = Pick<SalonEngine, "pseudoValide" | "cleUnicite" | "pseudoReserve">;

type Deps = {
  net: Net;
  idb: () => IDBFactory | null;
  agent: () => string;
  /** Lance `f` dans `ms` ; rend l'annulation. */
  planifier: (ms: number, f: () => void) => () => void;
  salon: () => Promise<PseudoMoteur>;
  /** A_auth et KEK_mdp (Argon2id du moteur) ; l'appelant efface les deux. */
  deriver: typeof deriverCompte;
};

const defaut = (): Deps => ({
  net: netParDefaut(),
  idb: idbDuNavigateur,
  agent: () => globalThis.navigator?.userAgent ?? "",
  planifier: (ms, f) => {
    const t = setTimeout(f, ms);
    return () => clearTimeout(t);
  },
  salon: loadSalonEngine,
  deriver: deriverCompte,
});
let deps: Deps = defaut();

/** Tests : remplace les accès au réseau, au stockage, à l'horloge et au moteur du salon. */
export function configurerCompte(d: Partial<Deps>): void {
  deps = { ...deps, ...d };
}

// --- État visible des écrans -----------------------------------------------------------------

class EtatCompte {
  /** absent : aucune session ; verrouille : session gardée, coffres en cours d'ouverture ; ouvert. */
  etat = $state<"absent" | "verrouille" | "ouvert">("absent");
  profil = $state.raw<Profil | undefined>(undefined);
  prive = $state.raw<CoffrePrive | undefined>(undefined);
  /** Coffre illisible (mauvaise clé, gen plus petit que le dernier vu) : bandeau de §12.4. */
  erreur = $state.raw<"coffre_illisible" | undefined>(undefined);
}
export const account = new EtatCompte();

// --- Secrets en mémoire ----------------------------------------------------------------------

type Ouverte = {
  jeton: string;
  h: Bytes;
  kCompte: Bytes;
  sProfil: Bytes;
  cles: ClesCompte;
  persistante: boolean;
  profil: Coffre<Profil>;
  prive: Coffre<CoffrePrive>;
};
let ouverte: Ouverte | null = null;
let inscription: { h: Bytes; etape: string; adresse: Adresse } | null = null;
let totp: { etape: string; kek: Bytes; persistante: boolean } | null = null;
let oubliEnCours: { etape: string; adresse: Adresse; h?: Bytes; genPrive?: number } | null = null;
let attente: { patches: ((p: CoffrePrive) => CoffrePrive)[]; annuler: () => void } | null = null;

/** Efface tout ce que la page tient du compte (ce que fait aussi un rechargement). */
function oublierMemoire(): void {
  attente?.annuler();
  attente = null;
  if (ouverte) {
    ouverte.kCompte.fill(0);
    ouverte.sProfil.fill(0);
  }
  totp?.kek.fill(0);
  ouverte = inscription = totp = oubliEnCours = null;
  account.etat = "absent";
  account.profil = account.prive = account.erreur = undefined;
}
/** Tests : simule un rechargement de la page. */
export const _oublierMemoire = oublierMemoire;

const illisibles = new Set(["coffre_illisible", "coffre_recule", "coffre_version", "enveloppe_invalide"]);

/** Session échue (401) : l'appareil oublie tout ; coffre illisible : signalé à l'écran. */
async function garde<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof api.CompteError && e.status === 401) await oublierAppareil();
    else if (e instanceof Error && illisibles.has(e.message)) account.erreur = "coffre_illisible";
    throw e;
  }
}

async function oublierAppareil(): Promise<void> {
  oublierMemoire();
  const idb = deps.idb();
  if (idb) await effacer(idb).catch(() => undefined);
}

async function memoriser(o: Ouverte): Promise<void> {
  const idb = deps.idb();
  if (!o.persistante || !idb) return;
  await sauver(idb, { jeton: o.jeton, h: o.h, kCompte: o.kCompte, sProfil: o.sProfil, genProfil: o.profil.gen, genPrive: o.prive.gen }).catch(() => undefined);
}

function transport(jeton: string, sorte: Sorte) {
  return {
    lire: () => api.lireCoffre(deps.net, jeton, sorte),
    ecrire: (ifGen: number, blob: Bytes) => api.ecrireCoffre(deps.net, jeton, sorte, ifGen, blob),
  };
}

/** Ouvre la session : coffres déjà lus (profil, privé) ou à relire (`null`). */
async function ouvrirSession(s: {
  jeton: string;
  h: Bytes;
  kCompte: Bytes;
  sProfil: Bytes;
  persistante: boolean;
  profil: { blob: Uint8Array; gen: number } | { relire: number };
  prive: { blob: Uint8Array; gen: number } | { relire: number } | { valeur: CoffrePrive; gen: number };
}): Promise<void> {
  const cles = await clesDuCompte(s.kCompte, s.sProfil);
  const coffre = async <T>(sorte: Sorte, src: { blob: Uint8Array; gen: number } | { relire: number } | { valeur: T; gen: number }, versJson: (v: T) => Bytes, deJson: (b: Uint8Array) => T, vide: T) => {
    const gen = "relire" in src ? src.relire : src.gen;
    const valeur = "valeur" in src ? src.valeur : "blob" in src ? deJson(await ouvrir(sorte, cles[sorte], s.h, src.blob, src.gen)) : vide;
    const c = creerCoffre<T>({ sorte, cle: cles[sorte], h: s.h, transport: transport(s.jeton, sorte), versJson, deJson, valeur, gen });
    if ("relire" in src) await c.relire();
    return c;
  };
  const profil = await coffre<Profil>("profil", s.profil, profilEnJson, profilDeJson, undefined as unknown as Profil);
  const prive = await coffre<CoffrePrive>("prive", s.prive, priveEnJson, priveDeJson, priveVide());
  oublierMemoire();
  ouverte = { jeton: s.jeton, h: s.h, kCompte: s.kCompte, sProfil: s.sProfil, cles, persistante: s.persistante, profil, prive };
  account.profil = profil.valeur;
  account.prive = prive.valeur;
  account.etat = "ouvert";
  await memoriser(ouverte);
}

async function etiquette(cle: CryptoKey, h: Uint8Array): Promise<Bytes> {
  return scellerEtiquette(cle, h, nomAppareil(deps.agent()));
}

/** Pseudo affiché et p_canon ; réservé : Error("pseudo_reserve") ; règle du salon (§39.4). */
async function pseudoCanon(p: string): Promise<{ affiche: string; pCanon: string }> {
  const s = await deps.salon();
  const affiche = s.pseudoValide(p);
  const pCanon = s.cleUnicite(affiche);
  if (s.pseudoReserve(pCanon)) throw new Error("pseudo_reserve");
  return { affiche, pCanon };
}

// --- Inscription -----------------------------------------------------------------------------

/** Étape 1 : envoie le code (toujours la même réponse, que l'adresse ait un compte ou non). */
export async function inscrire(email: string, langue: string, preuve: Preuve): Promise<void> {
  const adresse = await normaliserAdresse(email);
  const r = await api.inscriptionDebut(deps.net, { email: adresse.exacte, langue, ...preuve });
  inscription = { h: r.h, etape: r.etape, adresse };
}

export async function renvoyerCode(): Promise<void> {
  if (inscription) return api.inscriptionRenvoyer(deps.net, inscription.etape, inscription.adresse.exacte);
  if (oubliEnCours) return api.oubliRenvoyer(deps.net, oubliEnCours.etape, oubliEnCours.adresse.exacte);
  throw new Error("aucune_etape");
}

/**
 * Étape 2 : code reçu. Tire K_compte et s_profil, construit les deux coffres (gen 1), calcule
 * p_canon, puis `inscription/fin`. Refus avant toute requête : mdp_court, mdp_long, mdp_adresse,
 * pseudo_* (règle du salon), pseudo_reserve. Erreur du serveur (code_faux, pseudo_pris,
 * deja_inscrit, banni…) : l'inscription reste en cours (nouvel essai possible).
 */
export async function confirmer(code: string, mdp: string, profil: Profil, persistante: boolean): Promise<void> {
  const ins = inscription;
  if (!ins) throw new Error("aucune_etape");
  await motDePasseValide(mdp, ins.adresse);
  const { affiche, pCanon } = await pseudoCanon(profil.pseudo);
  const p: Profil = { ...profil, pseudo: affiche };
  const { aAuth, kekMdp } = await deps.deriver(mdp, ins.adresse.canon);
  const kCompte = aleatoire32();
  const sProfil = aleatoire32();
  let garde_ = false;
  try {
    const cles = await clesDuCompte(kCompte, sProfil);
    const envMdp = await scellerEnveloppe(kekMdp, ins.h, kCompte);
    const blobProfil = await sceller("profil", cles.profil, ins.h, 1, profilEnJson(p));
    const blobPrive = await sceller("prive", cles.prive, ins.h, 1, priveEnJson(priveVide()));
    const r = await api.inscriptionFin(deps.net, { etape: ins.etape, code, aAuth, envMdp, sProfil, pCanon, blobProfil, blobPrive, persistante, etiquette: await etiquette(cles.etiquette, ins.h) });
    await ouvrirSession({ jeton: r.session, h: ins.h, kCompte, sProfil, persistante, profil: { blob: blobProfil, gen: 1 }, prive: { valeur: priveVide(), gen: 1 } });
    garde_ = true;
  } finally {
    aAuth.fill(0);
    kekMdp.fill(0);
    if (!garde_) {
      kCompte.fill(0);
      sProfil.fill(0);
    }
  }
}

// --- Connexion -------------------------------------------------------------------------------

async function apresOuverture(o: api.Ouverture, kek: Bytes, persistante: boolean): Promise<void> {
  const kCompte = await garde(() => ouvrirEnveloppe(kek, o.h, o.envMdp));
  try {
    await garde(() => ouvrirSession({ jeton: o.session, h: o.h, kCompte, sProfil: o.sProfil, persistante, profil: { blob: o.blobProfil, gen: o.genProfil }, prive: { blob: o.blobPrive, gen: o.genPrive } }));
  } catch (e) {
    kCompte.fill(0);
    o.sProfil.fill(0);
    throw e;
  }
}

/**
 * Connexion : « ouvert », ou « totp » (code de l'application à donner à validerTotp). Le nom
 * d'appareil n'est pas envoyé : K_compte (qui le chiffre) n'est connue qu'après la réponse.
 */
export async function seConnecter(email: string, mdp: string, persistante: boolean, preuve?: Preuve): Promise<"ouvert" | "totp"> {
  const adresse = await normaliserAdresse(email);
  const { aAuth, kekMdp } = await deps.deriver(mdp, adresse.canon);
  let gardeKek = false;
  try {
    const r = await api.connexion(deps.net, { email: adresse.exacte, aAuth, persistante, etiquette: null, preuve });
    if ("totp" in r) {
      totp?.kek.fill(0);
      totp = { etape: r.totp, kek: kekMdp, persistante };
      gardeKek = true;
      return "totp";
    }
    await apresOuverture(r, kekMdp, persistante);
    return "ouvert";
  } finally {
    aAuth.fill(0);
    if (!gardeKek) kekMdp.fill(0);
  }
}

export async function validerTotp(code: string): Promise<void> {
  const t = totp;
  if (!t) throw new Error("aucune_etape");
  const r = await api.connexionTotp(deps.net, t.etape, code); // erreur : l'étape reste (5 essais)
  totp = null;
  try {
    await apresOuverture(r, t.kek, t.persistante);
  } finally {
    t.kek.fill(0);
  }
}

// --- Mot de passe oublié (§21.2.3) -------------------------------------------------------------

export const oubli = {
  /** Adresse EXACTE du compte ; toujours la même réponse. */
  async debut(email: string, langue: string, preuve: Preuve): Promise<void> {
    const adresse = await normaliserAdresse(email);
    const r = await api.oubliDebut(deps.net, { email: adresse.exacte, langue, ...preuve });
    oubliEnCours = { etape: r.etape, adresse };
  },
  /** « ok » : passer au nouveau mot de passe ; `{ attenteJusqu }` : retrait de la double authentification demandé. */
  async verifier(code: string, codeTotp: string, totpPerdu: boolean): Promise<"ok" | { attenteJusqu: string }> {
    const o = oubliEnCours;
    if (!o) throw new Error("aucune_etape");
    const r = await api.oubliVerifier(deps.net, { etape: o.etape, code, totp: codeTotp, totpPerdu });
    if ("attenteJusqu" in r) return r;
    o.h = r.h;
    o.genPrive = r.genPrive;
    return "ok";
  },
  /**
   * Nouveau mot de passe : nouveau K_compte, nouveau coffre privé vide (gen qui continue) ; le
   * profil est rendu par le séquestre. Toutes les autres sessions sont fermées par le serveur.
   */
  async fin(mdp: string, persistante: boolean): Promise<void> {
    const o = oubliEnCours;
    if (!o?.h || o.genPrive === undefined) throw new Error("aucune_etape");
    await motDePasseValide(mdp, o.adresse);
    const { aAuth, kekMdp } = await deps.deriver(mdp, o.adresse.canon);
    const kCompte = aleatoire32();
    let garde_ = false;
    try {
      const k = await clesDeKCompte(kCompte);
      const envMdp = await scellerEnveloppe(kekMdp, o.h, kCompte);
      const gen = o.genPrive + 1;
      const blobPrive = await sceller("prive", k.prive, o.h, gen, priveEnJson(priveVide()));
      const r = await api.oubliFin(deps.net, { etape: o.etape, aAuth, envMdp, blobPrive, persistante, etiquette: await etiquette(k.etiquette, o.h) });
      if (r.genPrive !== gen || r.h.some((x, i) => x !== o.h![i])) throw new Error("reponse_invalide");
      await garde(() => ouvrirSession({ jeton: r.session, h: r.h, kCompte, sProfil: r.sProfil, persistante, profil: { blob: r.blobProfil, gen: r.genProfil }, prive: { valeur: priveVide(), gen } }));
      garde_ = true;
    } finally {
      aAuth.fill(0);
      kekMdp.fill(0);
      if (!garde_) kCompte.fill(0);
    }
  },
};

// --- Pseudo ----------------------------------------------------------------------------------

/** Pseudo libre parmi les comptes ? Réservé : false, sans requête. Règle non tenue : erreur pseudo_*. */
export async function pseudoLibre(p: string): Promise<boolean> {
  let canon: string;
  try {
    canon = (await pseudoCanon(p)).pCanon;
  } catch (e) {
    if (e instanceof Error && e.message === "pseudo_reserve") return false;
    throw e;
  }
  if (ouverte) {
    const jeton = ouverte.jeton;
    return garde(() => api.pseudoVerifier(deps.net, { jeton }, canon));
  }
  if (inscription) return api.pseudoVerifier(deps.net, { etape: inscription.etape }, canon);
  throw new Error("aucune_session");
}

/** Change le pseudo (une fois par 24 h, serveur), puis l'écrit dans le coffre de profil. */
export async function changerPseudo(p: string): Promise<void> {
  const o = ouverteOuErreur();
  const { affiche, pCanon } = await pseudoCanon(p);
  await garde(() => api.changerPseudo(deps.net, o.jeton, pCanon));
  await ecrireProfil({ pseudo: affiche });
}

// --- Coffres ---------------------------------------------------------------------------------

function ouverteOuErreur(): Ouverte {
  if (!ouverte) throw new Error("aucune_session");
  return ouverte;
}

export async function ecrireProfil(patch: Partial<Profil>): Promise<void> {
  const o = ouverteOuErreur();
  account.profil = await garde(() => o.profil.ecrire((v) => ({ ...v, ...patch })));
  await memoriser(o);
}

/** Délai d'une écriture différée : 2 à 12 min, tiré par crypto.getRandomValues. */
function delai(): number {
  const r = crypto.getRandomValues(new Uint32Array(1))[0]!;
  return 120_000 + Math.floor((r / 2 ** 32) * 600_001);
}

/**
 * Modifie le coffre privé. `differe` (événement de partage ou de salon) : la modification attend
 * 2 à 12 min ; celles qui arrivent entre-temps partent avec elle (le délai n'est pas relancé). Une
 * écriture immédiate emporte aussi celles qui attendaient. Déconnexion avant l'échéance :
 * modifications abandonnées (elles restent dans l'historique de l'appareil, fusionné à la
 * connexion suivante, lot 11).
 */
export async function ecrirePrive(patch: (p: CoffrePrive) => CoffrePrive, opts: { differe: boolean }): Promise<void> {
  const o = ouverteOuErreur();
  if (opts.differe) {
    attente ??= { patches: [], annuler: deps.planifier(delai(), () => void vider().catch(() => undefined)) };
    attente.patches.push(patch);
    return;
  }
  const avant = prendreAttente();
  await ecrireTout(o, [...avant, patch]);
}

function prendreAttente(): ((p: CoffrePrive) => CoffrePrive)[] {
  const a = attente;
  attente = null;
  a?.annuler();
  return a?.patches ?? [];
}

async function vider(): Promise<void> {
  const o = ouverte;
  const ps = prendreAttente();
  if (o && ps.length > 0) await ecrireTout(o, ps);
}

async function ecrireTout(o: Ouverte, ps: ((p: CoffrePrive) => CoffrePrive)[]): Promise<void> {
  const v = await garde(() => o.prive.ecrire((p) => ps.reduce((acc, f) => f(acc), p)));
  if (ouverte === o) account.prive = v;
  await memoriser(o);
}

// --- Rechargement, déconnexion ----------------------------------------------------------------

/** Au démarrage : rouvre une session gardée (« Rester connecté ») ; sinon rien. Session échue : oubliée. */
export async function restaurer(): Promise<void> {
  const idb = deps.idb();
  if (!idb || ouverte) return;
  const s = await lire(idb);
  if (!s) return;
  account.etat = "verrouille";
  try {
    await ouvrirSession({ jeton: s.jeton, h: s.h as Bytes, kCompte: s.kCompte as Bytes, sProfil: s.sProfil as Bytes, persistante: true, profil: { relire: s.genProfil }, prive: { relire: s.genPrive } });
  } catch (e) {
    s.kCompte.fill(0);
    s.sProfil.fill(0);
    // Session échue ou fermée ailleurs : cas attendu, l'appareil l'oublie sans erreur.
    if (e instanceof api.CompteError && e.status === 401) return oublierAppareil();
    if (e instanceof Error && illisibles.has(e.message)) account.erreur = "coffre_illisible";
    account.etat = "absent"; // réseau : la session gardée reste, un prochain restaurer() réessaie
    throw e;
  }
}

/** Déconnexion : l'appareil oublie tout, même si le serveur ne répond pas. */
export async function seDeconnecter(): Promise<void> {
  const jeton = ouverte?.jeton;
  await oublierAppareil();
  if (jeton !== undefined) await api.deconnexion(deps.net, jeton).catch(() => undefined);
}
