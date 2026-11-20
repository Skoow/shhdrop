package share

import (
	"errors"
	"testing"
)

func TestReportsNeeded(t *testing.T) {
	for max, want := range map[int]int{0: 1, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 10: 5, 20: 10} {
		if got := ReportsNeeded(max); got != want {
			t.Errorf("ReportsNeeded(%d) = %d, attendu %d", max, got, want)
		}
	}
}

// Règle des voix (20 novembre) : 5 ouvertures permises, il faut 3 voix d'ouvertures
// différentes ; la même ouverture qui signale deux fois ne compte qu'une fois ; une mauvaise
// preuve compte un essai et ne vote pas ; un octroi faux est refusé sans essai.
func TestReportVotesPerOpening(t *testing.T) {
	s, _ := newSvc(t)
	k := newKeys()
	id := ready(t, s, k, 1, 1, 5)
	var grants []string
	for i := 0; i < 3; i++ {
		o, err := s.UnlockGrant(id, k.acces, k.preuve, "")
		if err != nil {
			t.Fatal(err)
		}
		grants = append(grants, o.Grant)
	}
	// Même ouverture, trois fois : une voix.
	for i := 0; i < 3; i++ {
		if gone, err := s.Report(k.acces, k.preuve, grants[0]); err != nil || gone {
			t.Fatal(i, gone, err)
		}
	}
	if _, err := s.Report(k.acces, k.preuve, "AAAA"); !errors.Is(err, ErrGrantInvalid) {
		t.Fatal("octroi faux accepté", err)
	}
	if _, err := s.Report(k.acces, rnd(32), grants[1]); !errors.Is(err, ErrNotFound) {
		t.Fatal("mauvaise preuve acceptée", err)
	}
	var failed int
	s.DB.QueryRow(`SELECT failed_attempts FROM shares WHERE id=?`, id).Scan(&failed)
	if failed != 1 {
		t.Fatal("essais comptés :", failed)
	}
	for i := 1; i < 2; i++ {
		if gone, err := s.Report(k.acces, k.preuve, grants[i]); err != nil || gone {
			t.Fatal(i, gone, err)
		}
	}
	if rowCount(t, s, id) != 1 {
		t.Fatal("effacé avant 3 voix")
	}
	gone, err := s.Report(k.acces, k.preuve, grants[2])
	if err != nil || !gone {
		t.Fatal("3ᵉ voix :", gone, err)
	}
	gone2 := rowCount(t, s, id)
	if gone2 != 0 {
		t.Fatal("partage encore là après 3 voix")
	}
}

// Un octroi d'un autre partage ne vote pas.
func TestReportGrantOfOtherShare(t *testing.T) {
	s, _ := newSvc(t)
	k1, k2 := newKeys(), newKeys()
	id1 := ready(t, s, k1, 1, 1, 1)
	id2 := ready(t, s, k2, 1, 1, 3)
	o1, err := s.UnlockGrant(id1, k1.acces, k1.preuve, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Report(k2.acces, k2.preuve, o1.Grant); !errors.Is(err, ErrGrantInvalid) {
		t.Fatal(err)
	}
	if rowCount(t, s, id2) != 1 {
		t.Fatal("effacé")
	}
}

// Destruction par un destinataire : refusée tant que d'autres ouvertures restent possibles.
func TestDestroyWithProofStillOpen(t *testing.T) {
	s, _ := newSvc(t)
	k := newKeys()
	id := ready(t, s, k, 1, 1, 2)
	if _, _, err := s.Unlock(id, k.acces, k.preuve); err != nil {
		t.Fatal(err)
	}
	if err := s.DestroyWithProof(k.acces, k.preuve); !errors.Is(err, ErrStillOpen) {
		t.Fatal(err)
	}
	if _, _, err := s.Unlock(id, k.acces, k.preuve); err != nil {
		t.Fatal(err)
	}
	if err := s.DestroyWithProof(k.acces, k.preuve); err != nil {
		t.Fatal(err)
	}
	if rowCount(t, s, id) != 0 {
		t.Fatal("non effacé")
	}
}
