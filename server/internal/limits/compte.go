package limits

import (
	"net/netip"
	"strconv"
)

// Limites du compte (conception du compte §8.8, §21.5, §21.11 ; plan lot 3). Mêmes règles que
// les quotas des partages : mémoire seulement, clés HMAC-SHA-256 sous le secret du jour (une
// adresse IP, une empreinte d'adresse e_canon ou un h n'y est jamais en clair, et la même
// valeur change de clé chaque jour), compteurs du jour vidés à minuit UTC, de l'heure à l'heure
// UTC (fenêtres fixes). Un refus n'est compté nulle part.
const (
	// Inscriptions (inscription/debut) par jour.
	InscriptionsPer64 = 3
	InscriptionsPer48 = 10
	// E-mails par jour : par connexion, par /48 (ajout du lot 3 : sans lui, un /48 découpé en
	// /64 multipliait par 65 536 les envois, comme pour SegmentsPer48Min), puis, pour chaque
	// motif (inscription, récupération, changement d'adresse) compté à part, par (adresse, bloc
	// /48) et par adresse (e_canon). Audit du 20 novembre (S4) : un seul compteur de 3 par
	// adresse, commun à tout, laissait un tiers empêcher la récupération d'un compte en
	// demandant 3 inscriptions ; il faut maintenant 3 blocs /48 (ou 3 adresses IPv4) distincts
	// pour fermer un motif à une adresse, et les deux autres motifs restent ouverts. Une victime
	// reçoit au plus 3 × 9 = 27 codes par jour.
	CourrielsPer64            = 10
	CourrielsPer48            = 30
	CourrielsParAdresseEtBloc = 3
	CourrielsParAdresse       = 9
	// Échecs de connexion par heure, par connexion et par /48 (puis 429).
	EchecsConnexionPer64 = 20
	EchecsConnexionPer48 = 60
	// EchecsAvantPreuve : à partir de 5 échecs dans l'heure sur un compte, sa connexion exige une
	// preuve ALTCHA ; jamais de verrouillage (§8.8).
	EchecsAvantPreuve = 5
	// EchecsTOTPParHeure : échecs de code TOTP par heure et par compte, puis 429.
	EchecsTOTPParHeure = 10
	// EcrituresCoffreParHeure : écritures des deux coffres ensemble, par heure et par compte.
	EcrituresCoffreParHeure = 60
	// PseudoVerifierParHeure : vérifications de pseudo par heure, par étape ou par compte.
	PseudoVerifierParHeure = 30
	// AppelsParHeure : demandes d'identifiants du relais des appels, par heure et par membre.
	AppelsParHeure = 20
	// BannissementsParHeure : garde-fou global contre un jeton d'administration volé (§21.11).
	BannissementsParHeure = 20
)

// cleLocked : clé pseudonymisée du jour d'un identifiant de compte (e_canon, h ou étape),
// séparée par sorte et par longueur.
func (l *Limiter) cleLocked(sorte string, id []byte) string {
	return mac(l.secret, sorte+"|"+strconv.Itoa(len(id))+"|"+string(id))
}

// allowUnLocked : un de plus sous k si m[k] < max.
func allowUnLocked(m map[string]int, k string, max int) bool {
	if m[k] >= max {
		return false
	}
	m[k]++
	return true
}

// AllowInscription : inscription/debut, 3 par jour par connexion et 10 par /48, comptée à
// l'appel.
func (l *Limiter) AllowInscription(ip netip.Addr) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.rotateLocked(l.now())
	return l.allowPairLocked(ip, l.insc64, l.insc48, InscriptionsPer64, InscriptionsPer48)
}

// Motif d'un e-mail du compte : chacun a ses propres compteurs par adresse (audit S4).
type Motif uint8

const (
	MotifInscription  Motif = iota + 1 // inscription/debut et ses renvois
	MotifRecuperation                  // oubli/debut et ses renvois
	MotifAdresse                       // changement d'adresse et ses renvois
)

// AllowCourriel : un e-mail pour le motif m vers l'adresse d'empreinte canon (e_canon) demandé
// depuis ip : 10 par jour par connexion et 30 par /48 (tous motifs), puis, pour ce motif, 3 par
// (adresse, /48) et 9 par adresse. Compté seulement s'il est permis. Ne dépend que des demandes
// déjà faites, jamais de l'existence d'un compte (aucune énumération). L'attente de 60 s entre
// deux envois d'une même étape est celle de l'étape (lot 4).
func (l *Limiter) AllowCourriel(ip netip.Addr, canon [32]byte, m Motif) bool {
	if m < MotifInscription || m > MotifAdresse {
		return false
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.rotateLocked(l.now())
	k64, k48 := l.keyLocked(ip)
	sorte := "courriel" + strconv.Itoa(int(m))
	ka := l.cleLocked(sorte, canon[:])
	kab := l.cleLocked(sorte+"|"+k48, canon[:])
	if l.mail64[k64] >= CourrielsPer64 || l.mail48[k48] >= CourrielsPer48 ||
		l.mailAdr48[kab] >= CourrielsParAdresseEtBloc || l.mailAdr[ka] >= CourrielsParAdresse {
		return false
	}
	l.mail64[k64]++
	l.mail48[k48]++
	l.mailAdr48[kab]++
	l.mailAdr[ka]++
	return true
}

// AllowEchecConnexion : la connexion ip (et son /48) n'a pas encore 20 (60) échecs de
// connexion dans l'heure. Ne compte rien : NoterEchecConnexion compte les échecs.
func (l *Limiter) AllowEchecConnexion(ip netip.Addr) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.rotateLocked(l.now())
	k64, k48 := l.keyLocked(ip)
	return l.echec64[k64] < EchecsConnexionPer64 && l.echec48[k48] < EchecsConnexionPer48
}

// NoterEchecConnexion : un échec de connexion depuis ip vers l'adresse d'empreinte canon
// (compte existant ou non : la même chose, pour ne rien dire de l'adresse).
func (l *Limiter) NoterEchecConnexion(ip netip.Addr, canon [32]byte) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.rotateLocked(l.now())
	k64, k48 := l.keyLocked(ip)
	l.echec64[k64]++
	l.echec48[k48]++
	l.echecCpt[l.cleLocked("connexion", canon[:])]++
}

// PreuveRequise : l'adresse d'empreinte canon a au moins 5 échecs de connexion dans l'heure ;
// sa connexion exige alors une preuve ALTCHA.
func (l *Limiter) PreuveRequise(canon [32]byte) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.rotateLocked(l.now())
	return l.echecCpt[l.cleLocked("connexion", canon[:])] >= EchecsAvantPreuve
}

// AllowTOTP : le compte h a moins de 10 échecs de code TOTP dans l'heure. Ne compte rien.
func (l *Limiter) AllowTOTP(h [16]byte) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.rotateLocked(l.now())
	return l.totpCpt[l.cleLocked("totp", h[:])] < EchecsTOTPParHeure
}

// NoterEchecTOTP : un code TOTP faux pour le compte h.
func (l *Limiter) NoterEchecTOTP(h [16]byte) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.rotateLocked(l.now())
	l.totpCpt[l.cleLocked("totp", h[:])]++
}

// AllowEcritureCoffre : une écriture d'un des deux coffres du compte h (60 par heure pour les
// deux ensemble), comptée à l'appel.
func (l *Limiter) AllowEcritureCoffre(h [16]byte) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.rotateLocked(l.now())
	return allowUnLocked(l.coffreCpt, l.cleLocked("coffre", h[:]), EcrituresCoffreParHeure)
}

// AllowPseudoVerifier : une vérification de pseudo pour id (h du compte, 16 octets, ou
// empreinte de l'étape d'inscription, 32 octets), 30 par heure, comptée à l'appel.
func (l *Limiter) AllowPseudoVerifier(id []byte) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.rotateLocked(l.now())
	return allowUnLocked(l.pseudoCpt, l.cleLocked("pseudo", id), PseudoVerifierParHeure)
}

// AllowAppel : une demande d'identifiants du relais des appels pour le membre id (empreinte de
// son jeton), 20 par heure, comptée à l'appel. Même table que les vérifications de pseudo : les
// clés sont séparées par sorte (cleLocked).
func (l *Limiter) AllowAppel(id []byte) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.rotateLocked(l.now())
	return allowUnLocked(l.pseudoCpt, l.cleLocked("appel", id), AppelsParHeure)
}

// AllowBannir : un bannissement, 20 par heure au plus pour tout le serveur, compté à l'appel.
func (l *Limiter) AllowBannir() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.rotateLocked(l.now())
	if l.bannirHeure >= BannissementsParHeure {
		return false
	}
	l.bannirHeure++
	return true
}
