package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

// Paiement : vente de Plus et Pro (conception du paiement §10). Désactivé par défaut : sans
// SHH_PAIEMENT=1, aucune route /api/paiement/*, aucun fichier lu, aucun appel sortant.
type Paiement struct {
	Essai bool   // SHH_PAIEMENT_ESSAI=1 : bacs à sable
	TVA   string // SHH_TVA : franchise, france ou oss
	// Stripe : SHH_STRIPE_CLE_FILE et SHH_STRIPE_WEBHOOK_FILE (les deux ou aucun), SHH_STRIPE_TAXE.
	StripeCleFile, StripeWebhookFile string
	StripeTaxe                       bool
	// PayPal : SHH_PAYPAL_CLIENT_ID, SHH_PAYPAL_SECRET_FILE, SHH_PAYPAL_WEBHOOK_ID, SHH_PAYPAL_PLANS
	// (tous ou aucun).
	PayPalClientID, PayPalSecretFile, PayPalWebhookID string
	PayPalPlans                                       [4]string // plus-mois, plus-an, pro-mois, pro-an
	// NOWPayments : SHH_NOWPAYMENTS_CLE_FILE et SHH_NOWPAYMENTS_IPN_FILE (les deux ou aucun).
	NOWPaymentsCleFile, NOWPaymentsIPNFile string
}

// AvecStripe, AvecPayPal, AvecNOWPayments : prestataire complètement configuré.
func (p Paiement) AvecStripe() bool      { return p.StripeCleFile != "" }
func (p Paiement) AvecPayPal() bool      { return p.PayPalClientID != "" }
func (p Paiement) AvecNOWPayments() bool { return p.NOWPaymentsCleFile != "" }

var nomsPlans = [4]string{"plus-mois", "plus-an", "pro-mois", "pro-an"}

// paiementFromEnv : comme comptesFromEnv, toute valeur posée est vérifiée même désactivé ; les
// règles de cohérence ne s'appliquent qu'avec SHH_PAIEMENT=1. Aucun fichier n'est lu ici.
func paiementFromEnv(c *Config) error {
	p := &c.Pay
	var err error
	if c.Paiement, err = bit("SHH_PAIEMENT"); err != nil {
		return err
	}
	if p.Essai, err = bit("SHH_PAIEMENT_ESSAI"); err != nil {
		return err
	}
	if p.StripeTaxe, err = bit("SHH_STRIPE_TAXE"); err != nil {
		return err
	}
	switch v := os.Getenv("SHH_TVA"); v {
	case "", "franchise", "france", "oss":
		p.TVA = v
	default:
		return fmt.Errorf("SHH_TVA invalide (franchise, france ou oss): %q", v)
	}
	for _, f := range []struct {
		nom string
		dst *string
	}{{"SHH_STRIPE_CLE_FILE", &p.StripeCleFile}, {"SHH_STRIPE_WEBHOOK_FILE", &p.StripeWebhookFile},
		{"SHH_PAYPAL_SECRET_FILE", &p.PayPalSecretFile}, {"SHH_NOWPAYMENTS_CLE_FILE", &p.NOWPaymentsCleFile},
		{"SHH_NOWPAYMENTS_IPN_FILE", &p.NOWPaymentsIPNFile}} {
		if *f.dst, err = secretFile(f.nom, c.DataDir); err != nil {
			return err
		}
	}
	if v := os.Getenv("SHH_PAYPAL_CLIENT_ID"); v != "" {
		if !jeton(v, 128) {
			return errors.New("SHH_PAYPAL_CLIENT_ID invalide ([A-Za-z0-9_-], 128 caractères au plus ; valeur non affichée)")
		}
		p.PayPalClientID = v
	}
	if v := os.Getenv("SHH_PAYPAL_WEBHOOK_ID"); v != "" {
		if !jeton(v, 64) {
			return fmt.Errorf("SHH_PAYPAL_WEBHOOK_ID invalide ([A-Za-z0-9_-], 64 caractères au plus): %q", v)
		}
		p.PayPalWebhookID = v
	}
	if v := os.Getenv("SHH_PAYPAL_PLANS"); v != "" {
		if p.PayPalPlans, err = plansDe(v); err != nil {
			return err
		}
	}
	// Prestataires à moitié configurés : refus, même paiement désactivé (erreur visible tout de suite).
	if (p.StripeCleFile == "") != (p.StripeWebhookFile == "") {
		return errors.New("Stripe : SHH_STRIPE_CLE_FILE et SHH_STRIPE_WEBHOOK_FILE vont ensemble")
	}
	if pp := []bool{p.PayPalClientID != "", p.PayPalSecretFile != "", p.PayPalWebhookID != "", p.PayPalPlans[0] != ""}; !(pp[0] == pp[1] && pp[1] == pp[2] && pp[2] == pp[3]) {
		return errors.New("PayPal : SHH_PAYPAL_CLIENT_ID, SHH_PAYPAL_SECRET_FILE, SHH_PAYPAL_WEBHOOK_ID et SHH_PAYPAL_PLANS vont ensemble")
	}
	if (p.NOWPaymentsCleFile == "") != (p.NOWPaymentsIPNFile == "") {
		return errors.New("NOWPayments : SHH_NOWPAYMENTS_CLE_FILE et SHH_NOWPAYMENTS_IPN_FILE vont ensemble")
	}
	if !c.Paiement {
		return nil
	}
	switch {
	case c.Origin == "":
		return errors.New("SHH_PAIEMENT=1 exige SHH_ORIGIN (adresses de retour et des webhooks)")
	case p.TVA == "":
		return errors.New("SHH_PAIEMENT=1 exige SHH_TVA (franchise, france ou oss : régime de TVA choisi par l'exploitant)")
	case !p.AvecStripe() && !p.AvecPayPal() && !p.AvecNOWPayments():
		return errors.New("SHH_PAIEMENT=1 exige au moins un prestataire complet (Stripe, PayPal ou NOWPayments)")
	}
	return nil
}

func bit(nom string) (bool, error) {
	switch v := os.Getenv(nom); v {
	case "", "0":
		return false, nil
	case "1":
		return true, nil
	default:
		return false, fmt.Errorf("%s invalide (0 ou 1): %q", nom, v)
	}
}

// jeton : [A-Za-z0-9_-], 1 à max caractères.
func jeton(s string, max int) bool {
	if s == "" || len(s) > max {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-') {
			return false
		}
	}
	return true
}

// plansDe : « plus-mois=P-…,plus-an=P-…,pro-mois=P-…,pro-an=P-… », les quatre exactement,
// chacun une fois, identifiants distincts.
func plansDe(v string) ([4]string, error) {
	var out [4]string
	errP := fmt.Errorf("SHH_PAYPAL_PLANS invalide (plus-mois=P-…,plus-an=P-…,pro-mois=P-…,pro-an=P-…, les quatre, "+
		"identifiants distincts): %q", v)
	parts := strings.Split(v, ",")
	if len(parts) != 4 {
		return out, errP
	}
	for _, part := range parts {
		k, id, ok := strings.Cut(part, "=")
		i := -1
		for j, n := range nomsPlans {
			if k == n {
				i = j
			}
		}
		if !ok || i < 0 || out[i] != "" || !strings.HasPrefix(id, "P-") || !jeton(id, 64) {
			return out, errP
		}
		for _, autre := range out {
			if autre == id {
				return out, errP
			}
		}
		out[i] = id
	}
	return out, nil
}
