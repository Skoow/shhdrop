// Zoom bloqué sur téléphone (décision du propriétaire du 18 novembre, risque d'accessibilité
// signalé : WCAG 1.4.4). La balise viewport (« maximum-scale=1, user-scalable=no ») suffit sur
// Android ; Safari sur iPhone l'ignore depuis iOS 10 : on y refuse ici le pincement (événements
// « gesture* », propres à WebKit) et le double-toucher (touch-action, base.css).

type Target = Pick<Document, "addEventListener">;

const stop = (e: Event) => e.preventDefault();

/** Refuse le pincement (WebKit) et le zoom au pincement à plusieurs doigts. */
export function blockZoom(doc: Target = document) {
  for (const t of ["gesturestart", "gesturechange", "gestureend"]) doc.addEventListener(t, stop, { passive: false });
  // Deux doigts ou plus : pincement, jamais un défilement de page.
  doc.addEventListener("touchmove", (e) => {
    if ((e as TouchEvent).touches.length > 1) e.preventDefault();
  }, { passive: false });
}
