package api

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/skoow/shhdrop/server/internal/limits"
)

// ---- Appels du salon : identifiants temporaires du relais (conception des appels) ----

var secretTurn = []byte("0123456789abcdef0123456789abcdef")

// appelEnv : salon actif avec un relais configuré, horloge fixe pour les identifiants.
func appelEnv(t *testing.T) (*env, keys, string) {
	t.Helper()
	e, m := salonEnv(t)
	e.h = newHandler(e.srv, htmlStatic(), Salons{Origin: "https://shhdrop.app", M: m, Turn: Turn{
		URLs: []string{"turn:turn.example:3478?transport=udp", "turns:turn.example:5349?transport=tcp"}, Secret: secretTurn,
		Now: func() time.Time { return time.Unix(1_700_000_000, 0) }}})
	k := newKeys()
	e.creerSalon(t, k, 3)
	w := e.rejoindre(k, false)
	expect(t, w, 200, "")
	r := jsonOf(t, w)
	if r["calls"] != true {
		t.Fatalf("calls : %v", r["calls"])
	}
	return e, k, r["member_token"].(string)
}

func (e *env) appel(hdr map[string]string, body string) *httpResp {
	w := e.do(req{method: "POST", path: "/api/salons/appel", hdr: hdr, body: []byte(body)})
	return &httpResp{w.Code, w.Body.String()}
}

// Sans relais configuré : la route n'existe pas (404 uniforme), même pour un membre.
func TestAppelSansRelais(t *testing.T) {
	e, _ := salonEnv(t)
	k := newKeys()
	e.creerSalon(t, k, 3)
	tok := jsonOf(t, e.rejoindre(k, false))["member_token"].(string)
	if r := e.appel(map[string]string{"X-Shh-Membre": tok}, `{}`); r.code != 404 || strings.TrimSpace(r.body) != notFound {
		t.Fatalf("sans relais : %d %q", r.code, r.body)
	}
}

// Un membre reçoit des identifiants que coturn accepte (HMAC-SHA1 du nom sous le secret
// partagé), sans rien qui le désigne ; tout autre appelant est refusé.
func TestAppelIdentifiants(t *testing.T) {
	e, _, tok := appelEnv(t)
	w := e.do(req{method: "POST", path: "/api/salons/appel", hdr: map[string]string{"X-Shh-Membre": tok}, body: []byte(`{}`)})
	expect(t, w, 200, "")
	if cc := w.Header().Get("Cache-Control"); cc != "no-store" {
		t.Fatalf("Cache-Control : %q", cc)
	}
	r := jsonOf(t, w)
	if got := clesDe(r); !reflect.DeepEqual(got, []string{"credential", "ttl_s", "urls", "username"}) {
		t.Fatalf("clés : %v", got)
	}
	nom := r["username"].(string)
	// Échéance (horloge + 6 h) et 16 octets aléatoires : ni salon, ni siège, ni jeton.
	if !regexp.MustCompile(`^1700021600:[0-9a-f]{32}$`).MatchString(nom) {
		t.Fatalf("username : %q", nom)
	}
	mac := hmac.New(sha1.New, secretTurn)
	mac.Write([]byte(nom))
	if r["credential"] != base64.StdEncoding.EncodeToString(mac.Sum(nil)) {
		t.Fatalf("credential : %v", r["credential"])
	}
	if r["ttl_s"] != 21600.0 || !reflect.DeepEqual(r["urls"], []any{"turn:turn.example:3478?transport=udp", "turns:turn.example:5349?transport=tcp"}) {
		t.Fatalf("réponse : %v", r)
	}
	if strings.Contains(w.Body.String(), tok) {
		t.Fatal("le jeton de membre est dans la réponse")
	}
	// Deux demandes : deux noms différents (aléa).
	if r2 := jsonOf(t, e.do(req{method: "POST", path: "/api/salons/appel", hdr: map[string]string{"X-Shh-Membre": tok}, body: []byte(`{}`)})); r2["username"] == nom {
		t.Fatal("même nom deux fois")
	}

	// Refus : sans en-tête, en-tête mal formé, corps autre que {}, jeton inconnu.
	for nomCas, c := range map[string]struct {
		hdr  map[string]string
		body string
		code int
		want string
	}{
		"sans en-tête": {nil, `{}`, 400, badRequest},
		"mal formé":    {map[string]string{"X-Shh-Membre": "abc"}, `{}`, 400, badRequest},
		"corps":        {map[string]string{"X-Shh-Membre": tok}, `{"x":1}`, 400, badRequest},
		"inconnu":      {map[string]string{"X-Shh-Membre": enc.EncodeToString(rnd(32))}, `{}`, 404, notFound},
	} {
		if r := e.appel(c.hdr, c.body); r.code != c.code || strings.TrimSpace(r.body) != c.want {
			t.Fatalf("%s : %d %q", nomCas, r.code, r.body)
		}
	}
}

// 20 demandes par heure et par membre, puis 429 ; un autre membre n'est pas touché.
func TestAppelLimite(t *testing.T) {
	e, k, tok := appelEnv(t)
	h := map[string]string{"X-Shh-Membre": tok}
	for i := 0; i < limits.AppelsParHeure; i++ {
		if r := e.appel(h, `{}`); r.code != 200 {
			t.Fatalf("demande %d : %d %q", i, r.code, r.body)
		}
	}
	if r := e.appel(h, `{}`); r.code != 429 {
		t.Fatalf("au-delà : %d %q", r.code, r.body)
	}
	autre := jsonOf(t, e.rejoindre(k, false))["member_token"].(string)
	if r := e.appel(map[string]string{"X-Shh-Membre": autre}, `{}`); r.code != 200 {
		t.Fatalf("autre membre : %d %q", r.code, r.body)
	}
}
