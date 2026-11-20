package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAppelsFromEnv(t *testing.T) {
	dir := t.TempDir()
	sec := filepath.Join(dir, "turn.secret")
	base := func() Config { return Config{DataDir: "/var/lib/shhdrop", Salons: true} }
	for nom, c := range map[string]struct {
		urls, file string
		salons     bool
		err        string
		n          int
	}{
		"rien":             {"", "", true, "", 0},
		"les deux":         {"turn:turn.shhgone.com:3478?transport=udp,turns:turn.shhgone.com:5349?transport=tcp", sec, true, "", 2},
		"sans port":        {"turn:turn.shhgone.com", sec, true, "", 1},
		"adresse seule":    {"turn:turn.shhgone.com:3478", "", true, "vont ensemble", 0},
		"secret seul":      {"", sec, true, "vont ensemble", 0},
		"sans salon":       {"turn:turn.shhgone.com:3478", sec, false, "SHH_SALONS=1", 0},
		"stun":             {"stun:turn.shhgone.com:3478", sec, true, "invalide", 0},
		"majuscules":       {"turn:Turn.shhgone.com:3478", sec, true, "invalide", 0},
		"espace":           {"turn:a.example:3478, turn:b.example:3478", sec, true, "invalide", 0},
		"identifiants":     {"turn:user:pass@a.example:3478", sec, true, "invalide", 0},
		"trop":             {"turn:a.example,turn:b.example,turn:c.example,turn:d.example,turn:e.example", sec, true, "4 adresses", 0},
		"dans les données": {"turn:a.example", "/var/lib/shhdrop/turn.secret", true, "hors de SHH_DATA_DIR", 0},
	} {
		t.Setenv("SHH_TURN_URLS", c.urls)
		t.Setenv("SHH_TURN_SECRET_FILE", c.file)
		cfg := base()
		cfg.Salons = c.salons
		err := appelsFromEnv(&cfg)
		if c.err == "" {
			if err != nil || len(cfg.TurnURLs) != c.n {
				t.Fatalf("%s : %v, %v", nom, err, cfg.TurnURLs)
			}
		} else if err == nil || !strings.Contains(err.Error(), c.err) {
			t.Fatalf("%s : %v", nom, err)
		}
	}
}

func TestLireSecretTurn(t *testing.T) {
	dir := t.TempDir()
	ecrire := func(nom, contenu string, mode os.FileMode) string {
		p := filepath.Join(dir, nom)
		if err := os.WriteFile(p, []byte(contenu), mode); err != nil {
			t.Fatal(err)
		}
		return p
	}
	bon := strings.Repeat("a1", 16)
	if b, err := LireSecretTurn(ecrire("ok", bon+"\n", 0o600)); err != nil || string(b) != bon {
		t.Fatalf("secret valable : %q %v", b, err)
	}
	for nom, p := range map[string]string{
		"lisible par tous": ecrire("ouvert", bon, 0o644),
		"trop court":       ecrire("court", "abc", 0o600),
		"trop long":        ecrire("long", strings.Repeat("a", 129), 0o600),
		"espace":           ecrire("espace", strings.Repeat("a ", 16), 0o600),
		"absent":           filepath.Join(dir, "absent"),
	} {
		_, err := LireSecretTurn(p)
		if err == nil {
			t.Fatalf("%s : accepté", nom)
		}
		// Jamais le contenu dans le message.
		if strings.Contains(err.Error(), "abc") && nom == "trop court" {
			t.Fatalf("%s : le message cite le secret : %v", nom, err)
		}
	}
	lien := filepath.Join(dir, "lien")
	if err := os.Symlink(filepath.Join(dir, "ok"), lien); err == nil {
		if _, err := LireSecretTurn(lien); err == nil {
			t.Fatal("lien symbolique accepté")
		}
	}
}
