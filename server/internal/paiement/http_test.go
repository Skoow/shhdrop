package paiement

import (
	"net/http"
	"testing"
)

// Client des prestataires : aucun proxy lu dans l'environnement, aucune redirection suivie, et
// une connexion par appel (les relais de sortie coupent chaque connexion après 60 s :
// deploy/compose.yaml, conception du paiement S1).
func TestNouveauClient(t *testing.T) {
	t.Setenv("HTTPS_PROXY", "http://127.0.0.1:1")
	c := NouveauClient().c
	tr, ok := c.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("transport %T", c.Transport)
	}
	if tr.Proxy != nil {
		t.Error("proxy lu dans l'environnement")
	}
	if !tr.DisableKeepAlives {
		t.Error("connexions gardées ouvertes : un relais pourrait couper un POST en cours")
	}
	if c.CheckRedirect == nil || c.CheckRedirect(nil, nil) != http.ErrUseLastResponse {
		t.Error("redirections suivies")
	}
	if c.Timeout != delaiAppel {
		t.Errorf("délai %v", c.Timeout)
	}
}
