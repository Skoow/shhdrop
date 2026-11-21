// Production : domaines jetables dans assets/jetables-EMPREINTE.js (un tableau JSON, extension .js
// pour le cache immuable et la compression du serveur), lus par fetch avec `integrity` (empreinte
// SHA-384 inscrite dans ce script par le greffon shh-jetables) : le navigateur refuse des octets
// différents. Lu seulement quand la page d'inscription vérifie une adresse. Pas d'import()
// dynamique (§28.3). Aucune donnée de la personne dans la requête : l'adresse reste ici.
import { integrity, src } from "virtual:shh-jetables";

export async function lireJetables(): Promise<readonly string[]> {
  const res = await fetch(src, { integrity, credentials: "omit", redirect: "error" });
  if (!res.ok) throw new Error("reseau");
  const v = JSON.parse(await res.text()) as unknown;
  if (!Array.isArray(v) || !v.every((d) => typeof d === "string")) throw new Error("liste_invalide");
  return v as string[];
}
