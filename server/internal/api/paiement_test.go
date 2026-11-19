package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"github.com/skoow/shhdrop/server/internal/paiement"
)

// prestTest : prestataire de test (le paquet paiement teste les vrais) ; garde l'en-tête reçu.
type prestTest struct {
	url     string
	abo     string
	errC    error
	errL    error
	evs     []paiement.Evenement
	vuH     http.Header
	vuCorps []byte
	vu      []paiement.Demande
}

func (p *prestTest) Moyen() paiement.Moyen { return paiement.Carte }
func (p *prestTest) Nom() string           { return "stripe" }
func (p *prestTest) Origines() []string    { return []string{"https://checkout.stripe.com/"} }
func (p *prestTest) Creer(_ context.Context, d paiement.Demande) (paiement.Session, error) {
	p.vu = append(p.vu, d)
	return paiement.Session{URL: p.url, Abonnement: p.abo}, p.errC
}
func (p *prestTest) Lire(_ context.Context, h http.Header, corps []byte) ([]paiement.Evenement, error) {
	p.vuH, p.vuCorps = h, corps
	return p.evs, p.errL
}
func (p *prestTest) Resilier(context.Context, string) error { return nil }

type envPaiement struct {
	*env
	p *prestTest
}

func newEnvPaiement(t *testing.T) envPaiement {
	t.Helper()
	e := newEnv(t, false, nil)
	db, err := paiement.OuvrirBase(filepath.Join(e.dir, "paiements.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	p := &prestTest{url: "https://checkout.stripe.com/c/pay/cs_test_1"}
	s, err := paiement.NewService(paiement.Config{DB: db, Now: e.clk.Now, Origine: "https://shhgone.test", Regime: paiement.OSS,
		Prestataires: []paiement.Prestataire{p}})
	if err != nil {
		t.Fatal(err)
	}
	e.h = newHandler(e.srv, htmlStatic(), Salons{Paiement: s})
	return envPaiement{e, p}
}

func passB64(n byte) string { return base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{n}, 32)) }

const corpsCommande = `{"offre":"plus","jours":30,"renouvelle":true,"moyen":"carte","pays":"FR","renonciation":true}`

func TestPaiementDesactive(t *testing.T) {
	e := newEnv(t, false, nil)
	for _, r := range []req{{method: "GET", path: "/api/paiement"}, {method: "POST", path: "/api/paiement/commande", body: []byte(corpsCommande)},
		{method: "POST", path: "/api/paiement/webhook/stripe", body: []byte(`{}`)}} {
		expect(t, e.do(r), 404, `{"error":"not_found"}`)
	}
}

func TestPaiementOffre(t *testing.T) {
	e := newEnvPaiement(t)
	w := e.do(req{method: "GET", path: "/api/paiement"})
	m := jsonOf(t, w)
	if w.Code != 200 || m["v"] != 1.0 || len(m["moyens"].([]any)) != 1 || m["moyens"].([]any)[0] != "carte" ||
		len(m["pays"].([]any)) != 27 || !strings.Contains(w.Body.String(), `"bientot":["appel_audio","appel_video"]`) {
		t.Fatal(w.Code, w.Body.String())
	}
}

func TestPaiementCommandeEtEtat(t *testing.T) {
	e := newEnvPaiement(t)
	hp := map[string]string{"X-Shh-Pass": passB64(1)}
	w := e.do(req{method: "POST", path: "/api/paiement/commande", hdr: hp, body: []byte(corpsCommande)})
	if w.Code != 200 || w.Body.String() != `{"url":"https://checkout.stripe.com/c/pay/cs_test_1"}` {
		t.Fatal(w.Code, w.Body.String())
	}
	// Le pass ne part pas au prestataire, ni dans la réponse.
	if strings.Contains(w.Body.String(), passB64(1)) {
		t.Fatal("pass recopié")
	}
	w = e.do(req{method: "POST", path: "/api/paiement/etat", hdr: hp})
	if w.Code != 200 || w.Body.String() != `{"v":1,"etat":"attente","offre":"plus","fin":null,"renouvelle":false,"droits":[]}` {
		t.Fatal(w.Code, w.Body.String())
	}
	// Webhook confirmé : payée, fin dans 30 jours, droits.
	c := e.p.vu[0].Commande
	e.p.evs = []paiement.Evenement{{Sorte: paiement.Confirme, Commande: c, AvecCommande: true, Ref: "pi_1", Montant: 700, Devise: "eur"}}
	expect(t, e.do(req{method: "POST", path: "/api/paiement/webhook/stripe", body: []byte(`{"id":"evt"}`)}), 200, `{}`)
	w = e.do(req{method: "POST", path: "/api/paiement/etat", hdr: hp, body: []byte(`{}`)})
	if w.Code != 200 || w.Body.String() != `{"v":1,"etat":"payee","offre":"plus","fin":"2026-12-04","renouvelle":true,"droits":["partage_plus","premiere_ouverture","salon_plus","appel_audio"]}` {
		t.Fatal(w.Code, w.Body.String())
	}
	// Pass inconnu.
	w = e.do(req{method: "POST", path: "/api/paiement/etat", hdr: map[string]string{"X-Shh-Pass": passB64(9)}})
	if w.Body.String() != `{"v":1,"etat":"inconnue","offre":null,"fin":null,"renouvelle":false,"droits":[]}` {
		t.Fatal(w.Body.String())
	}
	// Même pass pour une seconde commande : conflit.
	expect(t, e.do(req{method: "POST", path: "/api/paiement/commande", hdr: hp, body: []byte(corpsCommande)}), 409, `{"error":"conflit"}`)
	// Résiliation : aucun abonnement connu (le faux n'en a pas posé).
	expect(t, e.do(req{method: "POST", path: "/api/paiement/resilier", hdr: hp}), 409, `{"error":"aucun_abonnement"}`)
}

func TestPaiementCommandeRefus(t *testing.T) {
	e := newEnvPaiement(t)
	bad := `{"error":"bad_request"}`
	cas := []req{
		{body: []byte(corpsCommande)}, // sans pass
		{hdr: map[string]string{"X-Shh-Pass": passB64(1)[:42]}, body: []byte(corpsCommande)},
		{hdr: map[string]string{"X-Shh-Pass": passB64(1)}, body: []byte(strings.Replace(corpsCommande, `"plus"`, `"max"`, 1))},
		{hdr: map[string]string{"X-Shh-Pass": passB64(1)}, body: []byte(strings.Replace(corpsCommande, `"carte"`, `"card"`, 1))},
		{hdr: map[string]string{"X-Shh-Pass": passB64(1)}, body: []byte(strings.Replace(corpsCommande, `"FR"`, `"GB"`, 1))},
		{hdr: map[string]string{"X-Shh-Pass": passB64(1)}, body: []byte(strings.Replace(corpsCommande, `"renonciation":true`, `"renonciation":false`, 1))},
		{hdr: map[string]string{"X-Shh-Pass": passB64(1)}, body: []byte(strings.Replace(corpsCommande, `"renouvelle":true`, `"renouvelle":false`, 1))},
		{hdr: map[string]string{"X-Shh-Pass": passB64(1)}, body: []byte(strings.Replace(corpsCommande, `"jours":30`, `"jours":31`, 1))},
		{hdr: map[string]string{"X-Shh-Pass": passB64(1)}, body: []byte(strings.Replace(corpsCommande, `}`, `,"email":"x@y.z"}`, 1))},
		{hdr: map[string]string{"X-Shh-Pass": passB64(1)}, body: []byte(strings.Replace(corpsCommande, `"moyen":"carte"`, `"moyen":"crypto","renouvelle":false`, 1))},
	}
	for i, r := range cas {
		r.method, r.path = "POST", "/api/paiement/commande"
		if w := e.do(r); w.Code != 400 || w.Body.String() != bad {
			t.Errorf("cas %d : %d %s", i, w.Code, w.Body.String())
		}
	}
	// Prestataire en panne ou adresse refusée : 502, rien de gardé.
	e.p.errC = errors.New("panne")
	expect(t, e.do(req{method: "POST", path: "/api/paiement/commande", hdr: map[string]string{"X-Shh-Pass": passB64(2)}, body: []byte(corpsCommande)}), 502, `{"error":"prestataire"}`)
	e.p.errC, e.p.url = nil, "https://evil.example/pay"
	expect(t, e.do(req{method: "POST", path: "/api/paiement/commande", hdr: map[string]string{"X-Shh-Pass": passB64(3)}, body: []byte(corpsCommande)}), 502, `{"error":"prestataire"}`)
}

func TestPaiementCommandesLimitees(t *testing.T) {
	e := newEnvPaiement(t)
	for i := 0; i < 10; i++ {
		w := e.do(req{method: "POST", path: "/api/paiement/commande", hdr: map[string]string{"X-Shh-Pass": passB64(byte(10 + i))}, body: []byte(corpsCommande)})
		if w.Code != 200 {
			t.Fatal(i, w.Code, w.Body.String())
		}
	}
	w := e.do(req{method: "POST", path: "/api/paiement/commande", hdr: map[string]string{"X-Shh-Pass": passB64(99)}, body: []byte(corpsCommande)})
	if w.Code != 429 || w.Header().Get("Retry-After") == "" {
		t.Fatal(w.Code, w.Body.String())
	}
}

func TestPaiementWebhook(t *testing.T) {
	e := newEnvPaiement(t)
	corps := []byte(`{"id":"evt_1","object":"event"}`)
	hdr := map[string]string{"Stripe-Signature": "t=1,v1=ab", "Cookie": "x=1", "X-Shh-Pass": passB64(1), "Authorization": "Bearer y",
		"Paypal-Transmission-Id": "tid", "X-Nowpayments-Sig": "sig"}
	expect(t, e.do(req{method: "POST", path: "/api/paiement/webhook/stripe", hdr: hdr, body: corps}), 200, `{}`)
	// Seuls les en-têtes de signature arrivent au prestataire ; le corps, brut.
	if len(e.p.vuH) != 3 || e.p.vuH.Get("Stripe-Signature") != "t=1,v1=ab" || e.p.vuH.Get("Paypal-Transmission-Id") != "tid" ||
		e.p.vuH.Get("X-Nowpayments-Sig") != "sig" || !bytes.Equal(e.p.vuCorps, corps) {
		t.Fatal(e.p.vuH, string(e.p.vuCorps))
	}
	e.p.errL = paiement.ErrSignature
	expect(t, e.do(req{method: "POST", path: "/api/paiement/webhook/stripe", body: corps}), 400, `{"error":"bad_request"}`)
	e.p.errL = paiement.ErrPasEncore
	expect(t, e.do(req{method: "POST", path: "/api/paiement/webhook/stripe", body: corps}), 500, `{"error":"internal"}`)
	e.p.errL = paiement.ErrOccupe
	if w := e.do(req{method: "POST", path: "/api/paiement/webhook/stripe", body: corps}); w.Code != 503 {
		t.Fatal(w.Code)
	}
	e.p.errL = nil
	// Prestataire non configuré ou inconnu : 404 ; corps trop grand : 400 ; GET : 404 uniforme.
	expect(t, e.do(req{method: "POST", path: "/api/paiement/webhook/paypal", body: corps}), 404, `{"error":"not_found"}`)
	expect(t, e.do(req{method: "POST", path: "/api/paiement/webhook/inconnu", body: corps}), 404, `{"error":"not_found"}`)
	expect(t, e.do(req{method: "POST", path: "/api/paiement/webhook/stripe", body: bytes.Repeat([]byte("a"), 256<<10+1)}), 400, `{"error":"bad_request"}`)
	if w := e.do(req{method: "GET", path: "/api/paiement/webhook/stripe"}); w.Code != 404 {
		t.Fatal(w.Code)
	}
}
