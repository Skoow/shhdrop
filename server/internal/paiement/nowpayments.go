package paiement

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"
)

// NOWPayments (crypto), conception §4.3 : facture hébergée (/v1/invoice), IPN signé par
// HMAC-SHA-512 du JSON aux clés triées récursivement.

// NOWPayments : prestataire crypto.
type NOWPayments struct {
	cle    string // clé d'API (x-api-key)
	secret []byte // secret IPN
	essai  bool
	base   string // https://api.nowpayments.io ou bac à sable (remplacée par les tests)
	http   *Client
}

// NouveauNOWPayments : valeurs déjà vérifiées par la configuration.
func NouveauNOWPayments(cle, secretIPN string, essai bool, c *Client) *NOWPayments {
	base := "https://api.nowpayments.io"
	if essai {
		base = "https://api-sandbox.nowpayments.io"
	}
	return &NOWPayments{cle: cle, secret: []byte(secretIPN), essai: essai, base: base, http: c}
}

func (*NOWPayments) Moyen() Moyen { return Crypto }
func (*NOWPayments) Nom() string  { return "nowpayments" }
func (n *NOWPayments) Origines() []string {
	if n.essai {
		return []string{"https://sandbox.nowpayments.io/"}
	}
	return []string{"https://nowpayments.io/"}
}

// Creer : facture hébergée, prix fixe en euros (le cours est figé pendant la durée de la facture).
func (n *NOWPayments) Creer(ctx context.Context, d Demande) (Session, error) {
	f := d.Formule
	corps, _ := json.Marshal(struct {
		PriceAmount      json.Number `json:"price_amount"`
		PriceCurrency    string      `json:"price_currency"`
		OrderID          string      `json:"order_id"`
		OrderDescription string      `json:"order_description"`
		IPNCallbackURL   string      `json:"ipn_callback_url"`
		SuccessURL       string      `json:"success_url"`
		CancelURL        string      `json:"cancel_url"`
		IsFixedRate      bool        `json:"is_fixed_rate"`
		IsFeePaidByUser  bool        `json:"is_fee_paid_by_user"`
	}{json.Number(euros(Prix(f.Offre, f.Jours))), "eur", d.Commande.String(), f.Description(), d.Webhook, d.Retour, d.Retour, true, false})
	r, err := n.http.faire(ctx, requete{methode: http.MethodPost, url: n.base + "/v1/invoice",
		entetes: [][2]string{{"x-api-key", n.cle}, {"Content-Type", "application/json"}}, corps: corps})
	if err != nil {
		return Session{}, err
	}
	var o struct {
		InvoiceURL string `json:"invoice_url"`
	}
	if (r.statut != http.StatusOK && r.statut != http.StatusCreated) || json.Unmarshal(r.corps, &o) != nil {
		return Session{}, ErrPrestataire
	}
	return Session{URL: o.InvoiceURL}, nil
}

// Resilier : aucun abonnement en crypto.
func (*NOWPayments) Resilier(context.Context, string) error { return ErrAucunAbonnement }

// verifier : x-nowpayments-sig = HMAC-SHA-512(secret, JSON trié), en hexadécimal ; comparé en
// temps constant. Deux écritures du JSON trié sont essayées (tableaux gardés, ou changés en
// objets à clés « 0 », « 1 »… comme le fait la fonction de tri de la documentation) : toutes
// deux sont signées par le même secret, aucune ne laisse passer un corps non signé.
func (n *NOWPayments) verifier(h http.Header, corps []byte) (map[string]any, error) {
	vals := h.Values("X-Nowpayments-Sig")
	if len(vals) != 1 {
		return nil, ErrSignature
	}
	sig, err := hex.DecodeString(strings.ToLower(vals[0]))
	if err != nil || len(sig) != sha512.Size {
		return nil, ErrSignature
	}
	dec := json.NewDecoder(bytes.NewReader(corps))
	dec.UseNumber()
	var v any
	if dec.Decode(&v) != nil {
		return nil, ErrSignature
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, ErrSignature
	}
	obj, ok := v.(map[string]any)
	if !ok {
		return nil, ErrSignature
	}
	bon := false
	for _, tableauxEnObjets := range []bool{false, true} {
		var b bytes.Buffer
		if err := jsonTrie(&b, v, tableauxEnObjets); err != nil {
			return nil, ErrSignature
		}
		m := hmac.New(sha512.New, n.secret)
		m.Write(b.Bytes())
		if hmac.Equal(m.Sum(nil), sig) {
			bon = true
		}
	}
	if !bon {
		return nil, ErrSignature
	}
	return obj, nil
}

var errJSON = errors.New("JSON non pris en charge")

// jsonTrie : écriture de JSON.stringify (JavaScript) d'une valeur aux clés triées
// récursivement : sans espace, nombres tels que reçus, chaînes échappées comme JavaScript.
func jsonTrie(b *bytes.Buffer, v any, tableauxEnObjets bool) error {
	switch x := v.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		b.WriteString(strconv.FormatBool(x))
	case json.Number:
		b.WriteString(string(x))
	case string:
		chaineJS(b, x)
	case []any:
		if tableauxEnObjets {
			m := make(map[string]any, len(x))
			for i, e := range x {
				m[strconv.Itoa(i)] = e
			}
			return jsonTrie(b, m, true)
		}
		b.WriteByte('[')
		for i, e := range x {
			if i > 0 {
				b.WriteByte(',')
			}
			if err := jsonTrie(b, e, false); err != nil {
				return err
			}
		}
		b.WriteByte(']')
	case map[string]any:
		cles := make([]string, 0, len(x))
		for k := range x {
			cles = append(cles, k)
		}
		// Ordre de Array.prototype.sort : unités UTF-16 ; identique à l'ordre des octets pour
		// des clés ASCII (les seules des IPN) ; une clé non ASCII est refusée (échec fermé).
		for _, k := range cles {
			for i := 0; i < len(k); i++ {
				if k[i] >= 0x80 {
					return errJSON
				}
			}
		}
		slices.Sort(cles)
		b.WriteByte('{')
		for i, k := range cles {
			if i > 0 {
				b.WriteByte(',')
			}
			chaineJS(b, k)
			b.WriteByte(':')
			if err := jsonTrie(b, x[k], tableauxEnObjets); err != nil {
				return err
			}
		}
		b.WriteByte('}')
	default:
		return errJSON
	}
	return nil
}

// chaineJS : chaîne comme JSON.stringify : \" \\ \b \f \n \r \t, autres contrôles en \u00xx,
// le reste tel quel (UTF-8).
func chaineJS(b *bytes.Buffer, s string) {
	const hx = "0123456789abcdef"
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				b.WriteString(`\u00`)
				b.WriteByte(hx[r>>4])
				b.WriteByte(hx[r&15])
			} else {
				var e [4]byte
				b.Write(e[:utf8.EncodeRune(e[:], r)])
			}
		}
	}
	b.WriteByte('"')
}

func texte(m map[string]any, k string) string {
	switch x := m[k].(type) {
	case string:
		return x
	case json.Number:
		return string(x)
	}
	return ""
}

// Lire : IPN vérifié, puis traduit (conception §4.3).
func (n *NOWPayments) Lire(_ context.Context, h http.Header, corps []byte) ([]Evenement, error) {
	m, err := n.verifier(h, corps)
	if err != nil {
		return nil, err
	}
	ev := Evenement{Ref: texte(m, "payment_id")}
	avecCommande(&ev, texte(m, "order_id"))
	if !ev.AvecCommande {
		return nil, nil
	}
	switch texte(m, "payment_status") {
	case "finished":
		if ev.Ref == "" {
			return nil, ErrSignature
		}
		ev.Sorte, ev.Montant, ev.Devise = Confirme, centimes(texte(m, "price_amount")), texte(m, "price_currency")
	case "failed", "expired":
		ev.Sorte = NonAbouti
	case "refunded":
		ev.Sorte = Revoque
	default:
		// waiting, confirming, confirmed, sending, partially_paid : en attente, rien n'est
		// crédité (un paiement partiel se règle à la main, conception §4.3).
		return nil, nil
	}
	return []Evenement{ev}, nil
}
