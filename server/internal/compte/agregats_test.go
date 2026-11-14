package compte

import (
	"errors"
	"reflect"
	"testing"
	"time"
)

// Lot 7 : agrégats des comptes pour le tableau de bord (conception §21.14.2). Que des
// entiers : aucun champ texte, aucune liste qui désigne un compte ; lus en direct dans
// comptes.db, compteurs depuis le démarrage en mémoire.

// entiersSeulement : chaque champ (récursivement) est un entier ou un tableau d'entiers.
func entiersSeulement(t *testing.T, ty reflect.Type, chemin string) {
	t.Helper()
	switch ty.Kind() {
	case reflect.Int, reflect.Int64:
	case reflect.Array:
		entiersSeulement(t, ty.Elem(), chemin+"[]")
	case reflect.Struct:
		for i := range ty.NumField() {
			entiersSeulement(t, ty.Field(i).Type, chemin+"."+ty.Field(i).Name)
		}
	default:
		t.Errorf("%s : %s (seuls des entiers)", chemin, ty)
	}
}

func TestAgregatsQueDesEntiers(t *testing.T) {
	entiersSeulement(t, reflect.TypeFor[AgregatsComptes](), "AgregatsComptes")

	b := nouveauBanc(t)
	h1, _, _ := b.inscrire(t, ipN(1), "a@exemple.fr", "aaa")
	b.clk.Add(40 * 24 * time.Hour)
	h2, _, _ := b.inscrire(t, ipN(2), "b@exemple.fr", "bbb")
	b.clk.Add(200 * 24 * time.Hour)
	_, _, d3 := b.inscrire(t, ipN(3), "c@exemple.fr", "ccc")
	// a : 240 j, b : 200 j, c : 0 j. Double authentification pour a, retrait demandé.
	b.db.Exec(`UPDATE comptes SET totp=randomblob(48) WHERE h=?`, h1[:])
	b.db.Exec(`UPDATE comptes SET totp_retrait_jour=? WHERE h=?`, jourDe(b.clk.Now())+7*jourS, h1[:])
	b.db.Exec(`UPDATE comptes SET recup_jour=? WHERE h=?`, jourDe(b.clk.Now())-6*jourS, h2[:])
	if _, err := b.s.Connexion(ipN(1), "a@exemple.fr", alea32(), OptionsSession{}, false); !errors.Is(err, ErrIdentifiants) {
		t.Fatal(err)
	}
	if _, err := b.s.Connexion(ipN(2), "b@exemple.fr", alea32(), OptionsSession{Persistante: true}, false); !errors.Is(err, ErrIdentifiants) {
		t.Fatal(err)
	}
	b.ban(t, Cible{Email: []byte("x@exemple.fr")}, 30, 10)
	r := b.ban(t, Cible{Email: []byte("y@exemple.fr")}, 365, 10)
	b.s.ActionBan(r.Vue.ID, "suspendre", "")

	a, err := b.s.Agregats()
	if err != nil {
		t.Fatal(err)
	}
	want := AgregatsComptes{Comptes: 3, Max: 100, Neufs: 1, Confirmes: 2, Anciennete: [5]int{1, 0, 0, 2, 0},
		AvecTOTP: 1, RetraitTOTP: 1, RecuperesSemaine: 1, Sessions: 1, SessionsPersistantes: 0,
		BannisActifs: 1, BannisSuspendus: 1, BannisBientot: 1,
		Inscriptions: 3, Connexions: 0, EchecsConnexion: 2}
	if a != want {
		t.Fatalf("\n%+v\nattendu\n%+v", a, want)
	}
	// Connexions réussies, récupération comptée à part, suppression, effacement des inactifs.
	o, err := b.s.Connexion(ipN(3), "c@exemple.fr", d3.AAuth, OptionsSession{Persistante: true}, false)
	if err != nil {
		t.Fatal(err)
	}
	b.clk.Add(time.Minute)
	if _, err := b.s.Supprimer(b.session(t, o.Jeton)); err != nil {
		t.Fatal(err)
	}
	b.clk.Add(15 * 31 * 24 * time.Hour)
	if n, err := b.s.Effacer(b.clk.Now()); err != nil || n != 2 {
		t.Fatal(n, err)
	}
	a, _ = b.s.Agregats()
	if a.Connexions != 1 || a.Suppressions != 1 || a.EffacesDernierPassage != 2 || a.Comptes != 0 || a.Sessions != 0 {
		t.Fatalf("%+v", a)
	}
}
