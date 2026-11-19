package paiement

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
)

// Pass : secret au porteur tiré par l'appareil (conception §5.2). Il n'est jamais gardé :
// seule son empreinte Q l'est.
type Pass [32]byte

// Empreinte Q = SHA-256(« shhdrop/v2/pass » ‖ 0x00 ‖ P) (DP-6 ; vecteurs :
// engine/vectors/paiement.json).
func (p Pass) Empreinte() [32]byte {
	h := sha256.New()
	h.Write([]byte("shhdrop/v2/pass"))
	h.Write([]byte{0})
	h.Write(p[:])
	var q [32]byte
	h.Sum(q[:0])
	return q
}

var b64 = base64.RawURLEncoding.Strict()

// ErrPass : pass mal formé (pas exactement 32 octets en base64url sans bourrage).
var ErrPass = errors.New("pass invalide")

// PassDe : en-tête X-Shh-Pass, 43 caractères base64url sans bourrage.
func PassDe(s string) (Pass, error) {
	var p Pass
	if len(s) != 43 {
		return p, ErrPass
	}
	b, err := b64.DecodeString(s)
	if err != nil || len(b) != 32 {
		return p, ErrPass
	}
	copy(p[:], b)
	clear(b)
	return p, nil
}

// Commande : identifiant aléatoire de 16 octets, seul lien donné au prestataire (DP-2), écrit
// en hexadécimal minuscule (32 caractères).
type Commande [16]byte

func nouvelleCommande() (Commande, error) {
	var c Commande
	_, err := rand.Read(c[:])
	return c, err
}

const hexa = "0123456789abcdef"

func (c Commande) String() string {
	b := make([]byte, 32)
	for i, x := range c {
		b[2*i], b[2*i+1] = hexa[x>>4], hexa[x&15]
	}
	return string(b)
}

// CommandeDe : 32 caractères hexadécimaux minuscules exactement.
func CommandeDe(s string) (Commande, bool) {
	var c Commande
	if len(s) != 32 {
		return c, false
	}
	for i := 0; i < 32; i++ {
		var v byte
		switch x := s[i]; {
		case x >= '0' && x <= '9':
			v = x - '0'
		case x >= 'a' && x <= 'f':
			v = x - 'a' + 10
		default:
			return c, false
		}
		if i%2 == 0 {
			c[i/2] = v << 4
		} else {
			c[i/2] |= v
		}
	}
	return c, true
}
