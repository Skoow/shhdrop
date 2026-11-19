package config

import (
	"maps"
	"strings"
	"testing"
)

const plansOK = "plus-mois=P-1PM,plus-an=P-1PA,pro-mois=P-1RM,pro-an=P-1RA"

// paiementOK : les trois prestataires, configuration complète et valide.
func paiementOK() map[string]string {
	return map[string]string{
		"SHH_DATA_DIR": "/d", "SHH_ORIGIN": "https://shhgone.com", "SHH_PAIEMENT": "1", "SHH_TVA": "oss",
		"SHH_STRIPE_CLE_FILE": "/run/secrets/stripe_cle", "SHH_STRIPE_WEBHOOK_FILE": "/run/secrets/stripe_webhook",
		"SHH_PAYPAL_CLIENT_ID": "AbC-123_x", "SHH_PAYPAL_SECRET_FILE": "/run/secrets/paypal", "SHH_PAYPAL_WEBHOOK_ID": "8PT597110X687430LKGECATA",
		"SHH_PAYPAL_PLANS":         plansOK,
		"SHH_NOWPAYMENTS_CLE_FILE": "/run/secrets/np_cle", "SHH_NOWPAYMENTS_IPN_FILE": "/run/secrets/np_ipn",
	}
}

func sans(kv map[string]string, ks ...string) map[string]string {
	m := maps.Clone(kv)
	for _, k := range ks {
		delete(m, k)
	}
	return m
}

func TestPaiementDefautDesactive(t *testing.T) {
	env(t, map[string]string{"SHH_DATA_DIR": "/d"})
	c, err := FromEnv()
	if err != nil || c.Paiement || c.Pay != (Paiement{}) {
		t.Fatalf("%v %+v %v", c.Paiement, c.Pay, err)
	}
}

func TestPaiementValide(t *testing.T) {
	env(t, paiementOK())
	c, err := FromEnv()
	if err != nil {
		t.Fatal(err)
	}
	p := c.Pay
	if !c.Paiement || p.Essai || p.TVA != "oss" || !p.AvecStripe() || !p.AvecPayPal() || !p.AvecNOWPayments() ||
		p.PayPalPlans != [4]string{"P-1PM", "P-1PA", "P-1RM", "P-1RA"} || p.StripeWebhookFile != "/run/secrets/stripe_webhook" {
		t.Fatalf("%+v", p)
	}
	// Un seul prestataire suffit ; essai et Stripe Tax.
	for _, kv := range []map[string]string{
		sans(paiementOK(), "SHH_PAYPAL_CLIENT_ID", "SHH_PAYPAL_SECRET_FILE", "SHH_PAYPAL_WEBHOOK_ID", "SHH_PAYPAL_PLANS", "SHH_NOWPAYMENTS_CLE_FILE", "SHH_NOWPAYMENTS_IPN_FILE"),
		sans(paiementOK(), "SHH_STRIPE_CLE_FILE", "SHH_STRIPE_WEBHOOK_FILE", "SHH_PAYPAL_CLIENT_ID", "SHH_PAYPAL_SECRET_FILE", "SHH_PAYPAL_WEBHOOK_ID", "SHH_PAYPAL_PLANS"),
		avec(avec(paiementOK(), "SHH_PAIEMENT_ESSAI", "1"), "SHH_STRIPE_TAXE", "1"),
		avec(paiementOK(), "SHH_PAYPAL_PLANS", "pro-an=P-4,pro-mois=P-3,plus-an=P-2,plus-mois=P-1"),
	} {
		env(t, kv)
		if _, err := FromEnv(); err != nil {
			t.Errorf("%v : %v", kv, err)
		}
	}
}

func TestPaiementRefus(t *testing.T) {
	cas := map[string]map[string]string{
		"sans origine":            sans(paiementOK(), "SHH_ORIGIN"),
		"sans TVA":                sans(paiementOK(), "SHH_TVA"),
		"TVA inconnue":            avec(paiementOK(), "SHH_TVA", "OSS"),
		"aucun prestataire":       {"SHH_DATA_DIR": "/d", "SHH_ORIGIN": "https://shhgone.com", "SHH_PAIEMENT": "1", "SHH_TVA": "france"},
		"Stripe à moitié":         sans(paiementOK(), "SHH_STRIPE_WEBHOOK_FILE"),
		"PayPal sans plans":       sans(paiementOK(), "SHH_PAYPAL_PLANS"),
		"PayPal sans secret":      sans(paiementOK(), "SHH_PAYPAL_SECRET_FILE"),
		"NOWPayments à moitié":    sans(paiementOK(), "SHH_NOWPAYMENTS_IPN_FILE"),
		"secret dans les données": avec(paiementOK(), "SHH_STRIPE_CLE_FILE", "/d/stripe"),
		"secret relatif":          avec(paiementOK(), "SHH_NOWPAYMENTS_CLE_FILE", "np_cle"),
		"SHH_PAIEMENT=oui":        avec(paiementOK(), "SHH_PAIEMENT", "oui"),
		"essai=2":                 avec(paiementOK(), "SHH_PAIEMENT_ESSAI", "2"),
		"taxe=true":               avec(paiementOK(), "SHH_STRIPE_TAXE", "true"),
		"client id avec espace":   avec(paiementOK(), "SHH_PAYPAL_CLIENT_ID", "a b"),
		"webhook id trop long":    avec(paiementOK(), "SHH_PAYPAL_WEBHOOK_ID", strings.Repeat("A", 65)),
		"trois plans":             avec(paiementOK(), "SHH_PAYPAL_PLANS", "plus-mois=P-1,plus-an=P-2,pro-mois=P-3"),
		"plan en double":          avec(paiementOK(), "SHH_PAYPAL_PLANS", "plus-mois=P-1,plus-mois=P-2,pro-mois=P-3,pro-an=P-4"),
		"même identifiant":        avec(paiementOK(), "SHH_PAYPAL_PLANS", "plus-mois=P-1,plus-an=P-1,pro-mois=P-3,pro-an=P-4"),
		"plan sans P-":            avec(paiementOK(), "SHH_PAYPAL_PLANS", "plus-mois=X-1,plus-an=P-2,pro-mois=P-3,pro-an=P-4"),
		"plan inconnu":            avec(paiementOK(), "SHH_PAYPAL_PLANS", "plus-jour=P-1,plus-an=P-2,pro-mois=P-3,pro-an=P-4"),
	}
	for nom, kv := range cas {
		env(t, kv)
		if _, err := FromEnv(); err == nil {
			t.Errorf("%s accepté", nom)
		}
	}
	// Prestataire à moitié configuré : refusé même paiement désactivé.
	env(t, sans(avec(paiementOK(), "SHH_PAIEMENT", "0"), "SHH_STRIPE_WEBHOOK_FILE"))
	if _, err := FromEnv(); err == nil {
		t.Error("Stripe à moitié accepté, paiement désactivé")
	}
	// Désactivé mais complet : accepté, rien d'actif.
	env(t, avec(paiementOK(), "SHH_PAIEMENT", "0"))
	if c, err := FromEnv(); err != nil || c.Paiement {
		t.Error(c.Paiement, err)
	}
	// Le secret n'apparaît jamais dans un message : seuls des chemins sont lus ici.
	env(t, avec(paiementOK(), "SHH_PAYPAL_CLIENT_ID", "secret valeur"))
	if _, err := FromEnv(); err == nil || strings.Contains(err.Error(), "secret valeur") {
		t.Error("valeur affichée", err)
	}
}
