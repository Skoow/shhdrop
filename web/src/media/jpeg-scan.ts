// Lecture des marqueurs JPEG, partagée par le nettoyage (jpeg.ts) et la vignette EXIF (exif.ts),
// à part pour que exif.ts ne dépende pas de jpeg.ts (qui dépend de lui).
import { Malformed, u16be, u8 } from "./bytes";

/** Fin des données compressées qui suivent un SOS : position du marqueur suivant. */
export function scanEnd(b: Uint8Array, o: number): number {
  for (let i = o; i < b.length - 1; i++) {
    if (b[i] !== 0xff) continue;
    let j = i + 1;
    while (j < b.length && b[j] === 0xff) j++;
    if (j >= b.length) break;
    const n = b[j]!;
    if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) {
      i = j;
      continue;
    }
    return j - 1;
  }
  throw new Malformed("jpeg_sans_fin");
}

/**
 * Vignette EXIF (audit du 20 novembre, W7) : le JPEG de `j` coupé juste après son premier EOI,
 * octets inchangés, ou null : pas de SOI, pas d'EOI, segment qui déborde, marqueur hors norme, ou
 * segment de métadonnées (APP1 à APP15, COM) à n'importe quelle place, avant ou après un SOS.
 * Ce qui suit l'EOI dans la longueur déclarée par l'IFD1 n'est jamais gardé.
 */
export function cleanThumbnail(j: Uint8Array): Uint8Array | null {
  try {
    if (u8(j, 0) !== 0xff || u8(j, 1) !== 0xd8) return null;
    let o = 2;
    for (;;) {
      if (u8(j, o) !== 0xff) return null;
      while (u8(j, o + 1) === 0xff) o++; // octets de remplissage
      const m = u8(j, o + 1);
      if (m === 0xd9) return j.subarray(0, o + 2);
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd8) || m === 0x00) return null;
      if ((m >= 0xe1 && m <= 0xef) || m === 0xfe) return null;
      const len = u16be(j, o + 2);
      const next = o + 2 + len;
      if (len < 2 || next > j.length) return null;
      o = m === 0xda ? scanEnd(j, next) : next;
    }
  } catch {
    return null;
  }
}
