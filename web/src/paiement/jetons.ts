// Portefeuille de jetons anonymes de cet appareil (conception du paiement §7, §11) : une formule
// payante est disponible quand un pass payé (état « payee » chez le serveur) est gardé ici ; un
// partage payant dépense un jeton, obtenu en aveugle (moteur Rust, Privacy Pass) : le serveur
// signe sans voir le jeton, puis l'accepte sans savoir de quel pass il vient.
//
// Règles :
// - jetons demandés par petits lots (JETONS_PAR_LOT), à la demande, et gardés chiffrés à côté du
//   pass (pass.ts) ; un jeton n'est valable que le jour de sa clé et le lendemain (S9) : les plus
//   vieux sont jetés ;
// - l'état secret de chaque demande (nonce, facteur d'aveuglement) ne quitte jamais cette
//   fonction et est mis à zéro ;
// - aucun réseau ici (source-rules.test.ts) : tout passe par api.ts.
import { b64u } from "../engine/pure";
import { jetonFinaliser, jetonPreparer } from "./moteur";
import { emettre, lireCles, lireEtat, netParDefaut, type Net, type OffrePayante } from "./api";
import { garderJeton, lireJetons, lirePasses, retirerJeton } from "./pass";

/** Jetons demandés par requête (au plus 5 côté serveur). */
export const JETONS_PAR_LOT = 3;

const jour = (d: Date) => d.toISOString().slice(0, 10);
/** Un jeton de la clé du jour `j` est encore accepté aujourd'hui (son jour ou le lendemain). */
export function jetonValable(j: string, maintenant: Date = new Date()): boolean {
  const veille = new Date(maintenant.getTime() - 86_400_000);
  return j === jour(maintenant) || j === jour(veille);
}

/**
 * Formules payantes utilisables sur cet appareil : pass gardés que le serveur dit payés et non
 * échus. Aucune requête sans pass gardé.
 */
export async function formulesDisponibles(idb: IDBFactory, n: Net = netParDefaut(), maintenant: Date = new Date()): Promise<OffrePayante[]> {
  const out = new Set<OffrePayante>();
  for (const g of await lirePasses(idb)) {
    const e = await lireEtat(g.pass, n);
    if (e?.etat === "payee" && e.offre !== null && e.fin !== null && e.fin > jour(maintenant)) out.add(e.offre);
  }
  return (["plus", "pro"] as const).filter((x) => out.has(x));
}

/**
 * Un jeton de la formule `offre` (base64url, 472 caractères), retiré du portefeuille : d'abord un
 * jeton gardé encore valable, sinon un nouveau lot obtenu avec un pass payé de cette formule.
 * Erreur « aucun_jeton » si aucun n'est disponible (pas de pass, réserve épuisée, révoqué).
 */
export async function prendreJeton(idb: IDBFactory, offre: OffrePayante, n: Net = netParDefaut(), maintenant: Date = new Date()): Promise<string> {
  for (const j of await lireJetons(idb)) {
    if (!jetonValable(j.jour, maintenant)) {
      await retirerJeton(idb, j.id).catch(() => undefined);
      continue;
    }
    if (j.offre === offre) {
      await retirerJeton(idb, j.id);
      return j.jeton;
    }
  }
  const cles = await lireCles(n);
  const cle = cles?.cles.find((c) => c.offre === offre && c.jour === jour(maintenant));
  if (!cles || !cle) throw new Error("aucun_jeton");
  for (const g of await lirePasses(idb)) {
    if (g.offre !== offre || g.enAttente) continue;
    const demandes = [];
    for (let i = 0; i < JETONS_PAR_LOT; i++) demandes.push(await jetonPreparer(cle.spki, cles.emetteur));
    try {
      const rep = await emettre(
        g.pass,
        demandes.map((d) => d.requete),
        n,
      );
      if (rep === "aucun" || rep === null || rep.offre !== offre) continue;
      const jetons: string[] = [];
      for (let i = 0; i < demandes.length; i++) jetons.push(b64u(await jetonFinaliser(cle.spki, cles.emetteur, demandes[i]!.etat, rep.reponses[i]!)));
      for (const j of jetons.slice(1)) await garderJeton(idb, { jeton: j, offre, jour: cle.jour });
      return jetons[0]!;
    } finally {
      for (const d of demandes) d.etat.fill(0);
    }
  }
  throw new Error("aucun_jeton");
}
