// Photo de profil (conception compte §21.15.3, salon v3 §7.2) : ré-encodée SUR L'APPAREIL en
// 256 × 256, carré pris au centre, JPEG de 64 Kio au plus (PHOTO_MAX du coffre de profil,
// account/vaults.ts). Le canevas ne recopie que les pixels : ni EXIF, ni position, ni appareil.
// Aucune lecture des pixels par la page : décodage, dessin, encodage par le navigateur.
export const AVATAR_PX = 256;
export const AVATAR_MAX = 65536;
const QUALITES = [0.86, 0.78, 0.7, 0.6, 0.5, 0.4];

type Image = { width: number; height: number; close(): void };
type Carre = { sx: number; sy: number; s: number };
type Toile = { dessiner(img: Image, c: Carre): void; encoder(type: string, qualite: number): Promise<Uint8Array> };
export type AvatarDeps = { decoder: (b: Blob) => Promise<Image>; toile: (w: number, h: number) => Toile };

/** Plus grand carré centré dans w × h. */
export function carreCentre(w: number, h: number): Carre {
  const s = Math.min(w, h);
  return { sx: Math.floor((w - s) / 2), sy: Math.floor((h - s) / 2), s };
}

const navigateur: AvatarDeps = {
  decoder: (b) => createImageBitmap(b),
  toile: (w, h) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("photo_illisible");
    return {
      dessiner: (img, c) => {
        ctx.fillStyle = "#000"; // transparence (PNG) : fond noir plutôt qu'un fond indéfini
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img as unknown as CanvasImageSource, c.sx, c.sy, c.s, c.s, 0, 0, w, h);
      },
      encoder: (type, q) =>
        new Promise((resolve, reject) =>
          canvas.toBlob((b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new Error("photo_illisible"))), type, q),
        ),
    };
  },
};

/** Fichier choisi → JPEG 256 × 256 ≤ 64 Kio ; sinon Error("photo_illisible"). */
export async function reencoder(f: Blob, deps: AvatarDeps = navigateur): Promise<Uint8Array> {
  let img: Image;
  try {
    img = await deps.decoder(f);
  } catch {
    throw new Error("photo_illisible");
  }
  try {
    if (!(img.width > 0 && img.height > 0)) throw new Error("photo_illisible");
    const t = deps.toile(AVATAR_PX, AVATAR_PX);
    t.dessiner(img, carreCentre(img.width, img.height));
    for (const q of QUALITES) {
      const out = await t.encoder("image/jpeg", q);
      if (out.length > 0 && out.length <= AVATAR_MAX) return out;
    }
    throw new Error("photo_illisible");
  } catch {
    throw new Error("photo_illisible");
  } finally {
    img.close();
  }
}
