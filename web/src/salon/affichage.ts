// Type du Blob d'une pièce du salon montrée dans la page (audit du 20 novembre) : jamais le type
// annoncé par l'expéditeur tel quel. Une adresse blob: hérite de l'origine du site ; un
// « video/… » qui serait en fait text/html ou image/svg+xml, ouvert dans un onglet, s'y
// exécuterait. Mêmes tables que les partages (viewers/blobs.ts, TYPE_SUR).
import { safeBlobType } from "../viewers/blobs";
import type { PieceInfo } from "./conversation";

/** Images montrées dans le salon (jamais SVG, spec §39.5 et UI §12.4). */
export const IMAGES_SURES: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Type sûr du Blob affiché, ou null : rien n'est montré (seulement « Enregistrer »). */
export function typeAffichage(sorte: PieceInfo["sorte"], mime: string): string | null {
  const m = mime.split(";")[0]!.trim().toLowerCase();
  if (sorte === "image") return IMAGES_SURES.has(m) ? m : null;
  if (sorte === "vocal") return safeBlobType("audio", m);
  if (sorte === "video") return safeBlobType("video", m);
  return null;
}
