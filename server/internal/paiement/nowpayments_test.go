package paiement

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

const ipnSecret = "ipn-secret-test"

func nouveauNPTest(t *testing.T) (*NOWPayments, *fauxServeur) {
	f := nouveauFauxServeur(t)
	n := NouveauNOWPayments("np-cle", ipnSecret, true, clientTest(f.srv.Client()))
	n.base = f.srv.URL
	return n, f
}

func signeNP(texteTrie string) string {
	m := hmac.New(sha512.New, []byte(ipnSecret))
	m.Write([]byte(texteTrie))
	return hex.EncodeToString(m.Sum(nil))
}

func TestNOWPaymentsCreer(t *testing.T) {
	n, f := nouveauNPTest(t)
	f.rep = `{"id":"4522625843","token_id":"eX6DjQ","order_id":"` + cmdTest.String() + `","order_description":"Shhgone Plus, 30 jours","price_amount":"7","price_currency":"eur","pay_currency":null,"ipn_callback_url":"https://shhgone.test/api/paiement/webhook/nowpayments","invoice_url":"https://sandbox.nowpayments.io/payment/?iid=4522625843","success_url":"https://shhgone.test/offres/retour","cancel_url":"https://shhgone.test/offres/retour","created_at":"2026-11-19T15:00:00.000Z","updated_at":"2026-11-19T15:00:00.000Z"}`
	ses, err := n.Creer(context.Background(), Demande{Commande: cmdTest, Formule: Formule{Plus, JoursMois, false, Crypto},
		Retour: "https://shhgone.test/offres/retour", Webhook: "https://shhgone.test/api/paiement/webhook/nowpayments"})
	if err != nil || ses.URL != "https://sandbox.nowpayments.io/payment/?iid=4522625843" || !adressePermise(ses.URL, n.Origines()) {
		t.Fatal(ses, err)
	}
	if f.req.URL.Path != "/v1/invoice" || f.req.Header.Get("x-api-key") != "np-cle" || f.req.Header.Get("Content-Type") != "application/json" {
		t.Fatal(f.req.URL, f.req.Header)
	}
	want := `{"price_amount":7.00,"price_currency":"eur","order_id":"` + cmdTest.String() + `","order_description":"Shhgone Plus, 30 jours",` +
		`"ipn_callback_url":"https://shhgone.test/api/paiement/webhook/nowpayments","success_url":"https://shhgone.test/offres/retour",` +
		`"cancel_url":"https://shhgone.test/offres/retour","is_fixed_rate":true,"is_fee_paid_by_user":false}`
	if string(f.corps) != want {
		t.Fatalf("%s", f.corps)
	}
	if err := n.Resilier(context.Background(), "x"); err != ErrAucunAbonnement {
		t.Fatal(err)
	}
	f.statut = 401
	if _, err := n.Creer(context.Background(), Demande{Commande: cmdTest, Formule: Formule{Plus, JoursMois, false, Crypto}}); err != ErrPrestataire {
		t.Fatal(err)
	}
}

// ipn : corps tel qu'envoyé (ordre quelconque, espaces), et le même aux clés triées, écrit à la
// main (référence indépendante du code).
func ipn(statut string) (corps, trie string) {
	c := cmdTest.String()
	corps = `{"payment_id": 5077125051, "payment_status": "` + statut + `", "pay_address": "44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A",` +
		` "price_amount": 7, "price_currency": "eur", "pay_amount": 0.0436, "actually_paid": 0.0436, "pay_currency": "xmr",` +
		` "order_id": "` + c + `", "order_description": "Shhgone Plus, 30 jours", "purchase_id": "6084744717",` +
		` "created_at": "2026-11-19T15:00:00.000Z", "updated_at": "2026-11-19T15:20:00.000Z", "outcome_amount": 6.83, "outcome_currency": "eur",` +
		` "fee": {"currency": "xmr", "depositFee": 0.0001, "withdrawalFee": 0, "serviceFee": 0.0002}}`
	trie = `{"actually_paid":0.0436,"created_at":"2026-11-19T15:00:00.000Z","fee":{"currency":"xmr","depositFee":0.0001,"serviceFee":0.0002,"withdrawalFee":0},` +
		`"order_description":"Shhgone Plus, 30 jours","order_id":"` + c + `","outcome_amount":6.83,"outcome_currency":"eur",` +
		`"pay_address":"44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A","pay_amount":0.0436,` +
		`"pay_currency":"xmr","payment_id":5077125051,"payment_status":"` + statut + `","price_amount":7,"price_currency":"eur",` +
		`"purchase_id":"6084744717","updated_at":"2026-11-19T15:20:00.000Z"}`
	return
}

func TestNOWPaymentsSignature(t *testing.T) {
	n, _ := nouveauNPTest(t)
	corps, trie := ipn("finished")
	sig := signeNP(trie)
	evs, err := n.Lire(context.Background(), entete("X-Nowpayments-Sig", sig), []byte(corps))
	if err != nil || len(evs) != 1 {
		t.Fatal(evs, err)
	}
	e := evs[0]
	if e.Sorte != Confirme || e.Ref != "5077125051" || e.Montant != 700 || e.Devise != "eur" || e.Commande != cmdTest {
		t.Fatalf("%+v", e)
	}
	// Majuscules dans l'hexadécimal acceptées (même valeur).
	if _, err := n.Lire(context.Background(), entete("X-Nowpayments-Sig", strings.ToUpper(sig)), []byte(corps)); err != nil {
		t.Fatal(err)
	}
	refus := map[string]struct{ sig, corps string }{
		"autre secret":    {hex.EncodeToString(hmac.New(sha512.New, []byte("x")).Sum(nil)), corps},
		"montant modifié": {sig, strings.Replace(corps, `"price_amount": 7`, `"price_amount": 70`, 1)},
		"statut modifié":  {sig, strings.Replace(corps, `finished`, `finishe`, 1)},
		"nombre réécrit":  {sig, strings.Replace(corps, `0.0436, "pay_currency"`, `4.36e-2, "pay_currency"`, 1)},
		"sans signature":  {"", corps},
		"hex court":       {sig[:64], corps},
		"pas un objet":    {sig, `[1]`},
		"deux valeurs":    {sig, corps + corps},
		"json cassé":      {sig, corps[:20]},
	}
	for nom, c := range refus {
		h := http.Header{}
		if c.sig != "" {
			h.Set("X-Nowpayments-Sig", c.sig)
		}
		if _, err := n.Lire(context.Background(), h, []byte(c.corps)); err != ErrSignature {
			t.Errorf("%s : %v", nom, err)
		}
	}
	h := http.Header{"X-Nowpayments-Sig": {sig, sig}}
	if _, err := n.Lire(context.Background(), h, []byte(corps)); err != ErrSignature {
		t.Error("en-tête double accepté")
	}
}

func TestNOWPaymentsStatuts(t *testing.T) {
	n, _ := nouveauNPTest(t)
	cas := map[string]Sorte{"failed": NonAbouti, "expired": NonAbouti, "refunded": Revoque,
		"waiting": 0, "confirming": 0, "confirmed": 0, "sending": 0, "partially_paid": 0}
	for st, sorte := range cas {
		corps, trie := ipn(st)
		evs, err := n.Lire(context.Background(), entete("X-Nowpayments-Sig", signeNP(trie)), []byte(corps))
		if err != nil {
			t.Fatal(st, err)
		}
		if sorte == 0 && len(evs) != 0 || sorte != 0 && (len(evs) != 1 || evs[0].Sorte != sorte) {
			t.Errorf("%s : %+v", st, evs)
		}
	}
	// IPN d'une autre boutique (order_id qui n'est pas une commande) : rien.
	corps := `{"order_id":"2","payment_id":1,"payment_status":"finished","price_amount":7,"price_currency":"eur"}`
	if evs, err := n.Lire(context.Background(), entete("X-Nowpayments-Sig", signeNP(corps)), []byte(corps)); err != nil || len(evs) != 0 {
		t.Fatal(evs, err)
	}
}

// TestJSONTrieCommeJavaScript : échappements et tableaux comme JSON.stringify, et la variante
// « tableaux en objets » de la fonction de tri de la documentation.
func TestJSONTrieCommeJavaScript(t *testing.T) {
	dec := json.NewDecoder(strings.NewReader(`{"b":"é\"\\/\n\t\b\f\u0001<>&","a":[2,{"z":1,"y":null}],"c":true}`))
	dec.UseNumber()
	var v any
	dec.Decode(&v)
	var b bytes.Buffer
	if err := jsonTrie(&b, v, false); err != nil {
		t.Fatal(err)
	}
	if want := `{"a":[2,{"y":null,"z":1}],"b":"é\"\\/\n\t\b\f\u0001<>&","c":true}`; b.String() != want {
		t.Fatalf("%s\n%s", b.String(), want)
	}
	b.Reset()
	jsonTrie(&b, v, true)
	if want := `{"a":{"0":2,"1":{"y":null,"z":1}},"b":"é\"\\/\n\t\b\f\u0001<>&","c":true}`; b.String() != want {
		t.Fatalf("%s", b.String())
	}
	// Variante « tableaux en objets » acceptée elle aussi (signature calculée ainsi).
	n, _ := nouveauNPTest(t)
	corps := `{"order_id":"` + cmdTest.String() + `","payment_id":9,"payment_status":"failed","list":[1,2]}`
	trie := `{"list":{"0":1,"1":2},"order_id":"` + cmdTest.String() + `","payment_id":9,"payment_status":"failed"}`
	if evs, err := n.Lire(context.Background(), entete("X-Nowpayments-Sig", signeNP(trie)), []byte(corps)); err != nil || len(evs) != 1 {
		t.Fatal(evs, err)
	}
}
