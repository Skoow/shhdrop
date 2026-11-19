package paiement

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLireSecret(t *testing.T) {
	dir := t.TempDir()
	ecrire := func(nom, contenu string, mode os.FileMode) string {
		p := filepath.Join(dir, nom)
		os.WriteFile(p, []byte(contenu), mode)
		os.Chmod(p, mode)
		return p
	}
	if s, err := LireSecret("X", ecrire("ok", "sk_test_abc\n", 0o400)); err != nil || s != "sk_test_abc" {
		t.Fatal(s, err)
	}
	if s, err := LireSecret("X", ecrire("crlf", "whsec_1\r\n", 0o600)); err != nil || s != "whsec_1" {
		t.Fatal(s, err)
	}
	for nom, p := range map[string]string{
		"droits larges": ecrire("large", "sk_test_abc", 0o644),
		"vide":          ecrire("vide", "\n", 0o400),
		"espace":        ecrire("espace", "sk test", 0o400),
		"trop long":     ecrire("long", strings.Repeat("a", 1025), 0o400),
		"absent":        filepath.Join(dir, "absent"),
		"dossier":       dir,
	} {
		_, err := LireSecret("SHH_X_FILE", p)
		if err == nil {
			t.Errorf("%s accepté", nom)
			continue
		}
		if strings.Contains(err.Error(), "sk_test_abc") || strings.Contains(err.Error(), "aaaa") {
			t.Errorf("%s : valeur dans le message", nom)
		}
	}
}

func TestVerifierStripe(t *testing.T) {
	cas := []struct {
		cle, wh string
		essai   bool
		ok      bool
	}{
		{"sk_test_1", "whsec_1", true, true},
		{"rk_test_1", "whsec_1", true, true},
		{"sk_live_1", "whsec_1", false, true},
		{"sk_live_1", "whsec_1", true, false}, // clé réelle en essai
		{"sk_test_1", "whsec_1", false, false},
		{"pk_test_1", "whsec_1", true, false}, // clé publique
		{"sk_test_1", "secret", true, false},
	}
	for _, c := range cas {
		if err := VerifierStripe(c.cle, c.wh, c.essai); (err == nil) != c.ok {
			t.Errorf("%+v : %v", c, err)
		}
	}
}
