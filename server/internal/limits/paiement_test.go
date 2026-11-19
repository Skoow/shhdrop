package limits

import (
	"fmt"
	"testing"
	"time"
)

// TestAllowCommandeHeure : commandes de paiement, 10 par heure par connexion, 30 par /48
// (conception du paiement §8), fenêtre fixe UTC.
func TestAllowCommandeHeure(t *testing.T) {
	if CommandesPer64 != 10 || CommandesPer48 != 30 {
		t.Fatal(CommandesPer64, CommandesPer48)
	}
	now := time.Date(2026, 11, 19, 10, 0, 0, 0, time.UTC)
	l := newLim(&now)
	for i := 0; i < 10; i++ {
		if !l.AllowCommande(ip(fmt.Sprintf("2001:db8:7:1::%x", i+1))) {
			t.Fatalf("commande %d refusée", i+1)
		}
	}
	if l.AllowCommande(ip("2001:db8:7:1::ff")) {
		t.Fatal("11e commande de l'heure acceptée")
	}
	for p := 2; p <= 3; p++ {
		for i := 0; i < 10; i++ {
			if !l.AllowCommande(ip(fmt.Sprintf("2001:db8:7:%x::1", p))) {
				t.Fatalf("/64 n° %d, commande %d refusée", p, i+1)
			}
		}
	}
	if l.AllowCommande(ip("2001:db8:7:ff::1")) {
		t.Fatal("/48 plein mais commande acceptée")
	}
	if !l.AllowJoin(ip("2001:db8:7:1::1")) {
		t.Fatal("les commandes ne doivent pas prendre les entrées de salon")
	}
	now = time.Date(2026, 11, 19, 11, 0, 0, 0, time.UTC)
	if !l.AllowCommande(ip("2001:db8:7:1::1")) {
		t.Fatal("pas remis à zéro à l'heure suivante")
	}
}
