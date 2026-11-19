// État du salon pour les écrans (plan C-3, Task 6) : relie le client (client.ts), le fil
// (conversation.ts) et les étapes de l'interface (lien, mot de passe, explication, salon prêt,
// conversation, fin). Une seule session de salon par page, en mémoire seulement : rien n'est
// gardé dans le stockage du navigateur (hors l'historique local chiffré, sur demande : lien
// d'invitation et, pour le créateur, lien de gestion, jamais le mot de passe). Les secrets
// (K_lien, S_gestion, clés) sont effacés à `oublier` (fin, départ, exclusion, page quittée).
import { generatePassword, passwordKey } from "../engine/index";
import { loadSalonEngine, type ClesSalon, type Regle, type SalonEngine } from "./engine";
import * as api from "./api";
import { ClientSalon, type EvClient, type Fin } from "./client";
import { Conversation, type Bulle } from "./conversation";
import { preparer, oublier as oublierPreparation, type Duree } from "./creation";
import { lienSalon } from "./liens";
import { captcha as captchaDuServeur, ctx as transferCtx } from "../transfer/api";
import { CAPTCHA_MIN_MS } from "../transfer/client";
import { solvePow } from "../captcha/pow";
import { recordShare } from "../history/live.svelte";
import { creerSalon as creerAvecSession, profilPourSalon, CompteError } from "../account/session.svelte";

export type Etape = "vide" | "chargement" | "motdepasse" | "explication" | "pret" | "conversation" | "fin";
export type ErreurEntree = { code: "bad_password"; essais: number } | { code: "introuvable" | "complet" | "limite" | "reseau" | "serveur" | "indisponible"; retryS?: number };

/** Ce que les écrans lisent (réactif). `rev` change à chaque événement du fil. */
export const vue = $state({
  etape: "vide" as Etape,
  rev: 0,
  erreur: null as ErreurEntree | null,
  /** Échéance du salon (ms, horloge de l'appareil). */
  finMs: 0,
  places: 0,
  createur: false,
  /** Salon prêt (créateur) : lien d'invitation, mot de passe, lien de gestion (affichés, jamais gardés). */
  pret: null as { lien: string; mdp: string; gestion: string } | null,
  monPseudo: null as string | null,
  connexion: "connexion" as "connexion" | "ouvert" | "coupe",
  dansLeGroupe: false,
  /** Envoi retenu par le moteur depuis cet instant (exigence 23), ou null. */
  attenteDepuis: null as number | null,
  fin: null as Fin | null,
  membresPeuventDetruire: false,
});

type Session = {
  eng: SalonEngine;
  kLien: Uint8Array<ArrayBuffer>;
  cles?: ClesSalon;
  meta?: api.Meta;
  client?: ClientSalon;
  conv?: Conversation;
  sGestion?: Uint8Array<ArrayBuffer>;
  couleur?: number;
  stop: (() => void)[];
};
let s: Session | undefined;

const net = (): api.Net => api.netParDefaut();
const ouvrirWS = (url: string) => new WebSocket(url) as unknown as import("./client").WsLike;

/** Le fil courant (null avant l'entrée). */
export function conversation(): Conversation | null {
  return s?.conv ?? null;
}
export function client(): ClientSalon | null {
  return s?.client ?? null;
}
export function moteur(): SalonEngine | null {
  return s?.eng ?? null;
}

/** Oublie tout (secrets mis à zéro, WebSocket fermé). */
export function oublier(): void {
  if (!s) return;
  for (const f of s.stop) f();
  s.client?.fermer();
  if (!s.client) s.cles?.free();
  s.kLien.fill(0);
  s.sGestion?.fill(0);
  s = undefined;
  Object.assign(vue, { etape: "vide", erreur: null, pret: null, monPseudo: null, dansLeGroupe: false, attenteDepuis: null, createur: false });
}

// --- Invité : lien, mot de passe -----------------------------------------------------------------

/** Lien « #c… » lu : secondes restantes et paramètres du mot de passe (meta), sans rien révéler de plus. */
export async function ouvrirInvitation(kLien: Uint8Array<ArrayBuffer>): Promise<void> {
  oublier();
  vue.etape = "chargement";
  const eng = await loadSalonEngine().catch(() => null);
  if (!eng) {
    vue.erreur = { code: "reseau" };
    vue.etape = "vide";
    return;
  }
  s = { eng, kLien: kLien.slice(), stop: [] };
  const acces = eng.cleAcces(kLien);
  try {
    s.meta = await api.meta(net(), acces.k);
    vue.finMs = Date.now() + s.meta.expiresInS * 1000;
    vue.etape = "motdepasse";
  } catch (e) {
    vue.erreur = erreurEntree(e);
    vue.etape = "vide";
  } finally {
    acces.k.fill(0);
    acces.v.fill(0);
  }
}

function erreurEntree(e: unknown): ErreurEntree {
  if (e instanceof api.SalonError) {
    if (e.code === "bad_password") return { code: "bad_password", essais: e.attemptsLeft ?? 0 };
    if (e.code === "not_found") return { code: "introuvable" };
    if (e.code === "full") return { code: "complet" };
    if (e.code === "limit") return { code: "limite", retryS: e.retryS };
    return { code: e.status >= 500 ? "serveur" : "indisponible" };
  }
  return { code: "reseau" };
}

/** Mot de passe tapé : Argon2id, `rejoindre` (une place est prise), WebSocket ; puis la page d'explication. */
export async function deverrouiller(mdp: string): Promise<boolean> {
  const x = s;
  if (!x?.meta) return false;
  vue.erreur = null;
  let kMdp: Uint8Array | undefined;
  try {
    kMdp = await passwordKey(mdp.normalize("NFC"), x.meta.salt, { ops: x.meta.kdfOps, mem: x.meta.kdfMem });
    x.cles?.free();
    x.cles = x.eng.clesSalon(x.kLien, kMdp);
    const d = deps(x.eng);
    const entree = await ClientSalon.rejoindre(d, { kLien: x.kLien, cles: x.cles });
    demarrer(x, ClientSalon.ouvrir(d, { kLien: x.kLien, cles: x.cles }, entree), entree);
    vue.etape = "explication";
    return true;
  } catch (e) {
    vue.erreur = erreurEntree(e);
    if (vue.erreur.code === "introuvable") vue.etape = "vide";
    return false;
  } finally {
    kMdp?.fill(0);
  }
}

function deps(eng: SalonEngine) {
  return { net: net(), eng, ouvrirWS };
}

// --- Créateur -------------------------------------------------------------------------------------

export type ErreurCreation =
  | { code: "palier"; salons: number; places: number; heures: number }
  | { code: "banni"; jusqu: string }
  | { code: "compte_requis" | "limite" | "reseau" | "serveur" | "occupe" | "robot"; retryS?: number };

/**
 * Crée le salon (compte exigé, conception §10.4) : clés et mot de passe tirés ici, preuve
 * anti-robot, création avec la session, entrée comme créateur (siège 0, il fonde le groupe),
 * puis « Salon prêt ». `garder` : lien d'invitation et lien de gestion dans l'historique local
 * chiffré (puis le coffre du compte). Rend l'erreur, ou null.
 */
export async function creer(o: { ttlHours: Duree; maxMembers: number; membersCanDestroy: boolean; garder: boolean; onEtape?: (e: "cles" | "robot" | "envoi") => void }): Promise<ErreurCreation | null> {
  oublier();
  const eng = await loadSalonEngine().catch(() => null);
  if (!eng) return { code: "reseau" };
  const mdp = generatePassword();
  o.onEtape?.("cles");
  let p: Awaited<ReturnType<typeof preparer>> | undefined;
  try {
    p = await preparer(eng, mdp, o);
    o.onEtape?.("robot");
    const origin = location.origin;
    const cap = await captchaDuServeur(transferCtx(origin));
    const preuve = await solvePow(cap.challenge, { fallbackOrigin: cap.fallbackOrigin, mode: "pow" });
    // Le serveur refuse une création moins de 3 s après le défi (même règle que les partages).
    // (receivedAt : horloge monotone de la page, comme la validité du défi, transfer/api.ts).
    await new Promise((r) => setTimeout(r, Math.max(0, cap.receivedAt + CAPTCHA_MIN_MS - performance.now())));
    o.onEtape?.("envoi");
    if (preuve.kind !== "pow") return { code: "robot" };
    const r = await creerAvecSession(p.entetes, { ...p.corps, altcha: preuve.payload, hp: "", shown_at: cap.shownAt });
    const lien = lienSalon(origin, "c", p.kLien, import.meta.env.BASE_URL);
    const gestion = lienSalon(origin, "s", p.sGestion, import.meta.env.BASE_URL);
    if (o.garder)
      await recordShare({ sorte: "salon_cree", manage: gestion, link: lien, label: "", createdAt: Date.now(), sizeBytes: 0, itemsCount: 0, expiresAt: Date.now() + r.expiresInS * 1000, maxOpens: 0 });
    s = { eng, kLien: p.kLien, cles: p.cles, sGestion: p.sGestion, stop: [] };
    const d = deps(eng);
    const entree = await ClientSalon.rejoindre(d, { kLien: p.kLien, cles: p.cles, sGestion: p.sGestion });
    demarrer(s, ClientSalon.ouvrir(d, { kLien: p.kLien, cles: p.cles, sGestion: p.sGestion, creerGroupe: true }, entree), entree);
    vue.pret = { lien, mdp, gestion };
    vue.etape = "pret";
    return null;
  } catch (e) {
    if (p && !s) oublierPreparation(p);
    if (e instanceof CompteError) {
      if (e.code === "palier" && e.palier) return { code: "palier", ...e.palier };
      if (e.code === "banni") return { code: "banni", jusqu: e.jusqu ?? "" };
      if (e.code === "compte_requis" || e.code === "aucune_session") return { code: "compte_requis" };
      if (e.code === "limit") return { code: "limite", retryS: e.retryAfterS };
      if (e.code === "busy") return { code: "occupe", retryS: e.retryAfterS };
      if (e.code === "bad_request") return { code: "robot" };
      return { code: e.status >= 500 ? "serveur" : "reseau" };
    }
    if (e instanceof Error && e.message === "aucune_session") return { code: "compte_requis" };
    return { code: "reseau" };
  }
}

/** Salon prêt → page d'explication et pseudonyme (le créateur ne retape pas le mot de passe). */
export function versExplication(): void {
  if (vue.etape === "pret") vue.etape = "explication";
}

/** Pseudonyme proposé (compte : réglage « Proposer mon pseudo et ma photo »). */
export function pseudoPropose(): string {
  return (__COMPTES__ && profilPourSalon()?.pseudo) || "";
}

// --- Conversation -------------------------------------------------------------------------------

function demarrer(x: Session, c: ClientSalon, e: api.Entree): void {
  x.client = c;
  x.conv = new Conversation(c.siege, (p) => x.eng.cleUnicite(p));
  x.conv.surChangement(() => vue.rev++);
  vue.finMs = Date.now() + e.expiresInS * 1000;
  vue.places = e.maxMembers;
  vue.createur = c.createur;
  vue.membresPeuventDetruire = e.membersCanDestroy;
  vue.fin = null;
  x.stop.push(c.ecouter((ev) => surEvenement(x, ev)));
}

function surEvenement(x: Session, ev: EvClient): void {
  const c = x.client!;
  const conv = x.conv!;
  switch (ev.k) {
    case "liste":
      conv.liste(
        ev.annonces.map((a) => a.siege),
        ev.createur,
      );
      for (const a of ev.annonces) if (a.derniereMin > 0) conv.presenceDe(a.siege, { enLigne: false, derniereMin: a.derniereMin });
      break;
    case "arrivee":
    case "reprise":
      conv.arrivee(ev.siege);
      break;
    case "depart":
      conv.depart(ev.siege);
      break;
    case "exclusion":
      if (ev.siege !== undefined) conv.depart(ev.siege, true);
      break;
    case "presence":
      conv.presenceDe(ev.siege, { enLigne: ev.enLigne, derniereMin: ev.derniereMin });
      break;
    case "membres":
      conv.groupe(ev);
      vue.dansLeGroupe = c.dansLeGroupe();
      // Les nouveaux venus ne lisent rien d'avant leur arrivée : chacun leur redit son profil.
      if (vue.monPseudo && ev.ajoutes.some((s2) => s2 !== c.siege)) envoyerProfil(x);
      break;
    case "groupe":
      vue.dansLeGroupe = ev.dansLeGroupe;
      break;
    case "message": {
      const r = conv.message(ev.seq, ev.siege, ev.epoque, ev.enveloppe);
      if (r) c.accuser("recu", [r.recu]);
      // Notre pseudonyme pris par un siège arrivé avant : retour au champ (exigence 11).
      if (conv.pseudoRefuse && vue.etape === "conversation") {
        vue.monPseudo = null;
        vue.etape = "explication";
      }
      break;
    }
    case "efface":
      conv.efface(ev.cible);
      break;
    case "chiffre":
      conv.chiffre(ev.local, ev.id);
      break;
    case "accepte": {
      conv.accepte(ev.local, ev.seq);
      const p = profilsEnVol.get(ev.local);
      if (p) {
        profilsEnVol.delete(ev.local);
        conv.monProfil(p.pseudo, p.couleur, ev.seq);
      }
      break;
    }
    case "echec":
      conv.echec(ev.local, ev.code);
      break;
    case "attente":
      vue.attenteDepuis = ev.depuisMs;
      break;
    case "connexion":
      vue.connexion = ev.etat;
      break;
    case "reglages":
      vue.finMs = Date.now() + ev.secondes * 1000;
      vue.places = ev.places;
      break;
    case "nouvelleEntree":
      conv.moi = ev.siege;
      if (vue.monPseudo) envoyerProfil(x);
      break;
    case "fin":
      vue.fin = ev.raison;
      vue.etape = "fin";
      // Secrets effacés tout de suite ; ce qui est à l'écran reste jusqu'à ce que la personne parte
      // (sauf exclusion : tout disparaît, spec §39.13.1b).
      x.client = undefined;
      x.kLien.fill(0);
      x.sGestion?.fill(0);
      if (ev.raison === "exclu") {
        x.conv = new Conversation(0, () => "");
      }
      break;
  }
  vue.rev++;
}

function envoyerProfil(x: Session): void {
  if (!x.client || !x.conv || !vue.monPseudo) return;
  x.couleur ??= x.conv.couleurLibre();
  const pseudo = vue.monPseudo;
  const couleur = x.couleur;
  x.client.envoyer({ k: "profil", pseudo, couleur, avatar: null }, 0, undefined, (local) => {
    profilsEnVol.set(local, { pseudo, couleur });
    x.conv!.monProfil(pseudo, couleur);
  });
}
/** Nos messages `profil` en attente de leur rang (numéro local → contenu). */
const profilsEnVol = new Map<number, { pseudo: string; couleur: number }>();

/** Erreur du pseudonyme (règles du moteur, unicité dans le salon), ou null s'il est valable. */
export function verifierPseudo(p: string): { code: "longueur" | "caracteres" | "ecritures" | "pris" | "invalide" } | { ok: string } {
  const x = s;
  if (!x) return { code: "invalide" };
  let net2: string;
  try {
    net2 = x.eng.pseudoValide(p);
  } catch (e) {
    const m = (e as Error).message;
    return { code: m === "pseudo_longueur" ? "longueur" : m === "pseudo_caracteres" ? "caracteres" : m === "pseudo_ecritures" ? "ecritures" : "invalide" };
  }
  if (x.conv?.pseudoPris(net2)) return { code: "pris" };
  return { ok: net2 };
}

/** « Entrer dans le salon » : pseudonyme annoncé (chiffré) aux membres, puis la conversation. */
export function entrer(pseudo: string): boolean {
  const x = s;
  const v = verifierPseudo(pseudo);
  if (!x || !("ok" in v)) return false;
  vue.monPseudo = v.ok;
  if (x.conv) x.conv.pseudoRefuse = false;
  envoyerProfil(x);
  vue.etape = "conversation";
  return true;
}

/** Règle d'effacement des nouveaux messages (C-5 : réglable par tout participant ; 5 min par défaut). */
export function regleCourante(): Regle {
  return 2;
}

/** Texte nettoyé par le moteur (exigence 4) ; erreur du moteur sinon (`texte_invalide`, `texte_trop_long`). */
export function nettoyer(x: string): string {
  if (!s) throw new Error("texte_invalide");
  return s.eng.nettoyerTexte(x);
}

export function envoyerTexte(texte: string, cite: string | null): void {
  const x = s;
  if (!x?.client || !x.conv) return;
  const t = x.eng.nettoyerTexte(texte);
  const regle = regleCourante();
  const message = cite ? { k: "reponse" as const, cible: hexOctets(cite), x: t } : { k: "texte" as const, x: t };
  x.client.envoyer(message, regle, undefined, (local) => x.conv!.envoye(local, { sorte: cite ? "reponse" : "texte", texte: t, cite }, regle));
}

export function modifier(b: Bulle, texte: string): void {
  const x = s;
  if (!x?.client || !x.conv || !b.id || !b.moi) return;
  const t = x.eng.nettoyerTexte(texte);
  x.client.envoyer({ k: "modif", cible: hexOctets(b.id), x: t }, b.regle);
  x.conv.modifierLocal(b.id, t);
}

export function retirer(b: Bulle): void {
  const x = s;
  if (!x?.client || !x.conv || !b.id || !b.moi || b.seq === null) return;
  x.client.retirerPourTous(b.seq, hexOctets(b.id), b.regle);
  x.conv.retirerLocal(b.id);
}

export function reagir(b: Bulle, emoji: string): void {
  const x = s;
  if (!x?.client || !x.conv || !b.id || b.retire) return;
  x.client.envoyer({ k: "reaction", cible: hexOctets(b.id), emoji }, b.regle);
  x.conv.reagirLocal(b.id, emoji);
}

/** Message affiché 1 s, page visible : accusé « vu » (chiffré) et, règles 1 à 3, lecture au serveur. */
export function vu(b: Bulle): void {
  const x = s;
  if (!x?.client || b.moi || !b.id) return;
  x.client.accuser("vu", [hexOctets(b.id)]);
  if (b.regle !== 0 && b.seq !== null) x.client.lu(b.seq);
}

let dernierEcrit = 0;
/** « En train d'écrire » : au plus toutes les 4 s pendant la frappe (plan C-3, point 8). */
export function ecrit(): void {
  const t = Date.now();
  if (t - dernierEcrit < 4_000) return;
  dernierEcrit = t;
  s?.client?.ecrit();
}

/** « Quitter le salon » : `0x03`, secrets effacés. */
export function quitter(): void {
  s?.client?.quitter();
}

/** Reconnexion tout de suite (onglet revenu, réseau revenu). */
export function reveiller(): void {
  s?.client?.reveiller();
}

const hexOctets = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

