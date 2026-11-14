// Résumé d'un partage ouvert pour l'historique de l'appareil (conception compte §21.7) : nombre
// d'éléments, taille totale, sorte dominante (icône de la ligne). Les noms nettoyés ne servent
// qu'à l'extension, jamais gardés ; aucun contenu.
import type { Opened } from "../index";
import { formatOf } from "../ui/formats";
import { extOf } from "./kinds";

export function summarizeOpened(o: Opened): { itemsCount: number; sizeBytes: number; format: string } {
  const items = o.manifest.items;
  const enc = new TextEncoder();
  let sizeBytes = 0;
  const counts = new Map<string, number>();
  items.forEach((e, i) => {
    sizeBytes += e.kind === "text" ? enc.encode(e.text ?? "").length : e.size;
    const f = formatOf({ kind: e.kind, ext: e.kind === "text" ? "" : extOf(o.safeName(i)), preview: o.previewKind(i) }).family;
    counts.set(f, (counts.get(f) ?? 0) + 1);
  });
  let format = "file";
  let best = 0;
  for (const [f, n] of counts) if (n > best) [format, best] = [f, n];
  return { itemsCount: items.length, sizeBytes, format };
}
