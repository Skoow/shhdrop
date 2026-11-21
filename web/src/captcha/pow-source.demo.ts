// Démo GitHub Pages : son faux serveur n'exige aucune preuve de travail (preuve factice,
// demo/install.ts ; compte : routes/compte/preuve.ts) ; aucun script de Worker n'est livré.
export async function startPowWorker(): Promise<Worker> {
  throw new Error("pow_indisponible");
}
