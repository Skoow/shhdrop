// Empreinte SHA-256 de chaque fichier du composeur (décision du propriétaire du 16 novembre) :
// affichée en petit sur sa ligne, pour comparer avec le fichier reçu. Calculée sur cet appareil
// seulement (moteur, par tranches), un fichier à la fois, jamais envoyée au serveur. Un fichier
// nettoyé est un autre Blob : son empreinte est recalculée (elle diffère de l'original).
// Cache faible (WeakMap) : un fichier retiré de la liste n'est jamais retenu en mémoire.
import { fileSha256 } from "../index";

const cache = new WeakMap<Blob, string>();
const failed = new WeakSet<Blob>();
const waiting = new WeakSet<Blob>();
const queue: Blob[] = [];
let version = $state(0);
let running = false;

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (let b = queue.shift(); b !== undefined; b = queue.shift()) {
      try {
        cache.set(b, await fileSha256(b));
      } catch {
        failed.add(b);
      }
      version++;
    }
  } finally {
    running = false;
  }
}

/** Empreinte en hexadécimal, « erreur », ou null (en cours) ; lance le calcul au besoin. */
export function digestOf(data: Blob | Uint8Array): string | "erreur" | null {
  void version;
  if (!(data instanceof Blob)) return null;
  const hex = cache.get(data);
  if (hex !== undefined) return hex;
  if (failed.has(data)) return "erreur";
  if (!waiting.has(data)) {
    waiting.add(data);
    queue.push(data);
    queueMicrotask(() => void pump());
  }
  return null;
}
