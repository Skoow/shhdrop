package share

import (
	"database/sql"
	"errors"
	"sync"
)

// Signalement d'un partage (décision du propriétaire, 20 novembre) : un signalement n'efface
// plus le partage à lui seul. Chaque ouverture vaut une voix, prouvée par son octroi signé
// (grant.go) et par K_preuve (le mot de passe) ; le partage est effacé pour tous, sans grâce
// (flux coupés, spec §41.8), quand les voix atteignent la moitié des ouvertures permises
// (max_opens), arrondie au-dessus : 1 sur 1, 1 sur 2, 2 sur 3, 3 sur 5, 5 sur 10, 10 sur 20.
// Une personne seule ne peut donc plus effacer un partage destiné à plusieurs.
//
// Les voix vivent en mémoire seulement : ni adresse, ni catégorie, ni identité ; seulement
// le numéro d'ouverture, oublié à l'échéance du partage ou quand il est effacé. Un
// redémarrage les efface, comme les octrois (leur clé est tirée au démarrage).

// ErrStillOpen : destruction par un destinataire alors que d'autres ouvertures restent
// possibles (409 still_open) ; seul le dernier destinataire, ou l'expéditeur, peut détruire.
var ErrStillOpen = errors.New("d'autres ouvertures restent possibles")

// ReportsNeeded : voix qui effacent un partage de maxOpens ouvertures permises.
func ReportsNeeded(maxOpens int) int {
	return max(1, (maxOpens+1)/2)
}

type reportBox struct {
	mu sync.Mutex
	m  map[string]*reportEntry
}

type reportEntry struct {
	exp   int64
	votes map[int]struct{}
}

// vote inscrit la voix de l'ouverture n ; rend le nombre de voix. Oublie les entrées échues.
func (b *reportBox) vote(id string, n int, exp, now int64) int {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.m == nil {
		b.m = map[string]*reportEntry{}
	}
	for k, e := range b.m {
		if e.exp <= now {
			delete(b.m, k)
		}
	}
	e := b.m[id]
	if e == nil {
		e = &reportEntry{votes: map[int]struct{}{}}
		b.m[id] = e
	}
	e.exp = max(e.exp, exp)
	e.votes[n] = struct{}{}
	return len(e.votes)
}

func (b *reportBox) forget(id string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.m, id)
}

// Report : signalement par un destinataire (K_accès, K_preuve et l'octroi de son ouverture).
// K_preuve faux : un essai de mot de passe, comme Unlock. Octroi faux, d'un autre partage ou
// échu : ErrGrantInvalid, sans essai. Rend vrai si cette voix a effacé le partage. Un partage
// déjà fermé aux ouvertures (échu, essais épuisés, détruit) : ErrNotFound, rien n'est coupé.
func (s *Service) Report(kAcces, kPreuve []byte, grant string) (bool, error) {
	v := Verifier(kAcces)
	if v == nil {
		return false, ErrNotFound
	}
	now := s.now()
	var id, state string
	var proofV []byte
	var maxOpens sql.NullInt64
	var exp int64
	err := s.DB.QueryRow(`SELECT id, proof_v, state, max_opens, expires_at FROM shares WHERE access_v=?2 AND `+alive, now, v).
		Scan(&id, &proofV, &state, &maxOpens, &exp)
	if err != nil {
		return false, notFound(err)
	}
	if !s.aliveUpload(id, state, now) || !maxOpens.Valid {
		return false, ErrNotFound
	}
	mu := s.attemptLock(id)
	mu.Lock()
	defer mu.Unlock()
	var failed int
	if err := s.DB.QueryRow(`SELECT failed_attempts FROM shares WHERE id=?`, id).Scan(&failed); err != nil {
		return false, notFound(err)
	}
	if failed >= maxAttempts {
		return false, ErrNotFound
	}
	if !match(kPreuve, proofV) {
		if _, err := s.countFailure(id); err != nil && !errors.Is(err, ErrNotFound) {
			return false, err
		}
		return false, ErrNotFound
	}
	idb, ok := idBytes(id)
	if !ok {
		return false, ErrNotFound
	}
	n, ok := VerifyGrant(s.grantKey, idb, grant, s.Now())
	if !ok {
		return false, ErrGrantInvalid
	}
	if s.reports.vote(id, int(n), exp, now) < ReportsNeeded(int(maxOpens.Int64)) {
		return false, nil
	}
	s.reports.forget(id)
	if err := s.retireOrNotFound(id, false); err != nil {
		return false, err
	}
	return true, nil
}
