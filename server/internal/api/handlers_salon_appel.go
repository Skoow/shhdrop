package api

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1" //nolint:gosec // HMAC-SHA1 imposé par le protocole TURN (identifiants temporaires « REST »), pas un choix
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"strconv"
	"time"

	"github.com/skoow/shhdrop/server/internal/share"
)

// Appels audio et vidéo du salon (conception des appels, 20 novembre). Le serveur ne voit ni
// le son, ni l'image, ni la signalisation (messages du salon, chiffrés par MLS) : il donne
// seulement à un membre des identifiants temporaires du relais TURN, par où passe tout le
// média (jamais en direct entre participants : l'adresse IP de chacun resterait visible des
// autres, spec §39.3.1).
//
// Identifiants temporaires (mécanisme « REST » de TURN, vérifié par deploy/shhcheck/turn.go) : nom = « <échéance
// Unix>:<16 octets aléatoires en hex> », mot de passe = base64(HMAC-SHA1(secret partagé, nom)).
// Le nom ne porte ni salon, ni siège, ni compte : le relais ne peut relier une session à
// personne. Rien n'est écrit sur disque.

// Turn : relais des appels. Secret : secret partagé avec le relais (deploy/shhcheck/turn.go).
type Turn struct {
	URLs   []string
	Secret []byte
	// Now : horloge (tests) ; nil : time.Now.
	Now func() time.Time
}

func (t Turn) now() time.Time {
	if t.Now != nil {
		return t.Now()
	}
	return time.Now()
}

func (t Turn) actif() bool { return len(t.URLs) != 0 && len(t.Secret) != 0 }

// turnTTL : durée de vie des identifiants. Le relais les vérifie à chaque renouvellement de
// l'allocation : un appel de plus de 6 heures est coupé (le client en redemande en rappelant).
const turnTTL = 6 * time.Hour

// identifiantsTurn : nom et mot de passe temporaires valables jusqu'à exp.
func identifiantsTurn(secret []byte, exp time.Time, alea []byte) (nom, mdp string) {
	nom = strconv.FormatInt(exp.Unix(), 10) + ":" + hex.EncodeToString(alea)
	mac := hmac.New(sha1.New, secret)
	mac.Write([]byte(nom))
	return nom, base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

// appel : POST /api/salons/appel (X-Shh-Membre, corps {}) → {urls, username, credential,
// ttl_s}. En-tête absent ou mal formé, corps autre que {} : 400 ; jeton inconnu, salon échu :
// 404 ; jeton révoqué : 403 excluded ; plus de 20 demandes par heure pour ce membre : 429.
// Route absente (404 uniforme) sans relais configuré.
func (a salonAPI) appel(w http.ResponseWriter, r *http.Request) {
	var b struct{}
	if err := readJSON(w, r, &b); err != nil {
		failSalon(w, err)
		return
	}
	_, jeton, err := a.membre(r)
	if err != nil {
		failSalon(w, err)
		return
	}
	v := share.Verifier(jeton)
	if !a.lim.AllowAppel(v[:]) {
		writeLimit(w, time.Hour)
		return
	}
	var alea [16]byte
	if _, err := rand.Read(alea[:]); err != nil {
		failSalon(w, err)
		return
	}
	nom, mdp := identifiantsTurn(a.turn.Secret, a.turn.now().Add(turnTTL), alea[:])
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, struct {
		URLs       []string `json:"urls"`
		Username   string   `json:"username"`
		Credential string   `json:"credential"`
		TTL        int64    `json:"ttl_s"`
	}{a.turn.URLs, nom, mdp, int64(turnTTL / time.Second)})
}
