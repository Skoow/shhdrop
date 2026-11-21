package main

import (
	"crypto/hmac"
	"crypto/sha1" //nolint:gosec // identifiants temporaires de TURN : HMAC-SHA1 imposé par le protocole
	"encoding/base64"
	"errors"
	"net"
	"net/netip"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pion/stun/v3"
	"github.com/pion/turn/v4"
)

const secretTest = "0123456789abcdef0123456789abcdef"

// identifiants : ceux que calcule le serveur Go (handlers_salon_appel.go).
func identifiants(secret string, exp time.Time) (string, string) {
	nom := strconv.FormatInt(exp.Unix(), 10) + ":00112233445566778899aabbccddeeff"
	m := hmac.New(sha1.New, []byte(secret))
	m.Write([]byte(nom))
	return nom, base64.StdEncoding.EncodeToString(m.Sum(nil))
}

func ecrireSecret(t *testing.T, contenu string, mode os.FileMode) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "turn.secret")
	if err := os.WriteFile(p, []byte(contenu), mode); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestPublique(t *testing.T) {
	for s, attendu := range map[string]bool{
		"203.0.113.9": true, "8.8.8.8": true, "192.0.2.2": true,
		"10.1.2.3": false, "172.16.0.1": false, "192.168.1.1": false, "127.0.0.1": false, "169.254.1.1": false,
		"100.64.0.1": false, "198.18.0.1": false, "0.0.0.0": false, "224.0.0.1": false, "255.255.255.255": false,
		"::1": false, "2001:db8::1": false, "::ffff:10.0.0.1": false,
	} {
		if got := publique(netip.MustParseAddr(s)); got != attendu {
			t.Errorf("publique(%s) = %v", s, got)
		}
	}
}

func TestLireConfTurn(t *testing.T) {
	bon := ecrireSecret(t, secretTest+"\n", 0o400)
	defaut := func() (netip.Addr, error) { return netip.MustParseAddr("203.0.113.9"), nil }
	prive := func() (netip.Addr, error) { return netip.MustParseAddr("10.0.0.5"), nil }
	poser := func(kv map[string]string) {
		for _, k := range []string{"SHH_TURN_SECRET_FILE", "SHH_TURN_IP", "SHH_TURN_PORT", "SHH_TURN_PORTS", "SHH_TURN_ALLOCATIONS", "SHH_TURN_KBPS"} {
			t.Setenv(k, kv[k])
		}
	}
	poser(map[string]string{"SHH_TURN_SECRET_FILE": bon})
	c, err := lireConfTurn(defaut)
	if err != nil || c.secret != secretTest || c.ip.String() != "203.0.113.9" || c.port != 3478 || c.min != 49160 || c.max != 49999 || c.allocations != 60 || c.octetsSecond != 312500 {
		t.Fatalf("défauts : %+v %v", c, err)
	}
	if strings.Contains(c.ip.String(), secretTest) {
		t.Fatal("impossible")
	}
	for nom, cas := range map[string]struct {
		env    map[string]string
		defaut func() (netip.Addr, error)
		err    string
	}{
		"adresse privée détectée": {map[string]string{"SHH_TURN_SECRET_FILE": bon}, prive, "pas une adresse publique"},
		"IPv6":                    {map[string]string{"SHH_TURN_SECRET_FILE": bon, "SHH_TURN_IP": "2001:db8::1"}, defaut, "IPv4"},
		"secret absent":           {map[string]string{}, defaut, "illisible"},
		"secret lisible par tous": {map[string]string{"SHH_TURN_SECRET_FILE": ecrireSecret(t, secretTest, 0o644)}, defaut, "0400"},
		"secret court":            {map[string]string{"SHH_TURN_SECRET_FILE": ecrireSecret(t, "court", 0o600)}, defaut, "32 à 128"},
		"plage trop petite":       {map[string]string{"SHH_TURN_SECRET_FILE": bon, "SHH_TURN_PORTS": "50000-50003"}, defaut, "SHH_TURN_PORTS"},
		"plage avec l'écoute":     {map[string]string{"SHH_TURN_SECRET_FILE": bon, "SHH_TURN_PORTS": "3000-4000"}, defaut, "SHH_TURN_PORTS"},
		"débit absurde":           {map[string]string{"SHH_TURN_SECRET_FILE": bon, "SHH_TURN_KBPS": "5"}, defaut, "SHH_TURN_KBPS"},
	} {
		poser(cas.env)
		_, err := lireConfTurn(cas.defaut)
		if err == nil || !strings.Contains(err.Error(), cas.err) {
			t.Errorf("%s : %v", nom, err)
		}
		if err != nil && strings.Contains(err.Error(), secretTest) {
			t.Errorf("%s : le message cite le secret", nom)
		}
	}
	// Adresse privée donnée explicitement : acceptée (réseau privé voulu, banc d'essai).
	poser(map[string]string{"SHH_TURN_SECRET_FILE": bon, "SHH_TURN_IP": "192.168.1.2"})
	if c, err := lireConfTurn(defaut); err != nil || c.ip.String() != "192.168.1.2" {
		t.Fatalf("SHH_TURN_IP privée : %v %v", c.ip, err)
	}
	// Adresse donnée : prise telle quelle, sans détection.
	poser(map[string]string{"SHH_TURN_SECRET_FILE": bon, "SHH_TURN_IP": "198.51.100.7"})
	if c, err := lireConfTurn(prive); err != nil || c.ip.String() != "198.51.100.7" {
		t.Fatalf("SHH_TURN_IP : %v %v", c.ip, err)
	}
}

// Seules les allocations de ce relais sont joignables : son adresse, sa plage ; jamais Internet.
func TestPermis(t *testing.T) {
	c := &confTurn{ip: netip.MustParseAddr("203.0.113.9"), min: 49160, max: 49999}
	for s, attendu := range map[string]bool{
		"203.0.113.9:49160": true, "203.0.113.9:49999": true, "[::ffff:203.0.113.9]:49200": true,
		"203.0.113.9:443": false, "203.0.113.9:22": false, "203.0.113.9:3478": false, "203.0.113.9:50000": false,
		"8.8.8.8:5000": false, "8.8.8.8:49200": false, "10.0.0.1:5000": false, "127.0.0.1:49170": false, "172.30.53.2:8080": false,
	} {
		if got := c.permis(netip.MustParseAddrPort(s)); got != attendu {
			t.Errorf("permis(%s) = %v", s, got)
		}
	}
}

type faussePrise struct {
	net.PacketConn
	envoyes int
}

func (f *faussePrise) WriteTo(p []byte, _ net.Addr) (int, error) {
	f.envoyes += len(p)
	return len(p), nil
}

// Débit : au-delà du seau (une seconde de débit), les paquets sont jetés ; il se remplit au fil du temps.
func TestConnBridee(t *testing.T) {
	c := &confTurn{ip: netip.MustParseAddr("203.0.113.9"), min: 49160, max: 49999, octetsSecond: 10_000}
	f := &faussePrise{}
	now := time.Unix(1_700_000_000, 0)
	b := &connBridee{PacketConn: f, c: c, compte: &atomic.Int64{}, jetons: 10_000, maintien: func() time.Time { return now }}
	vers := &net.UDPAddr{IP: net.ParseIP("203.0.113.9"), Port: 49200}
	p := make([]byte, 1000)
	for i := 0; i < 15; i++ {
		if n, err := b.WriteTo(p, vers); n != 1000 || err != nil {
			t.Fatal(n, err)
		}
	}
	if f.envoyes != 10_000 {
		t.Fatalf("envoyés : %d, attendu 10 000", f.envoyes)
	}
	now = now.Add(500 * time.Millisecond)
	for i := 0; i < 10; i++ {
		_, _ = b.WriteTo(p, vers)
	}
	if f.envoyes != 15_000 {
		t.Fatalf("après 0,5 s : %d, attendu 15 000", f.envoyes)
	}
	// Destination interdite : jetée, sans consommer le débit.
	now = now.Add(time.Second)
	_, _ = b.WriteTo(p, &net.UDPAddr{IP: net.ParseIP("10.0.0.1"), Port: 5000})
	_, _ = b.WriteTo(p, &net.UDPAddr{IP: net.ParseIP("8.8.8.8"), Port: 49200})
	_, _ = b.WriteTo(p, &net.UDPAddr{IP: net.ParseIP("203.0.113.9"), Port: 22})
	if f.envoyes != 15_000 {
		t.Fatalf("destination interdite envoyée : %d", f.envoyes)
	}
}

// demarrer : relais réel sur la boucle locale (qui tient lieu d'adresse publique ici).
func demarrer(t *testing.T, allocations int, parIP ...int) (confTurn, string) {
	return demarrerAvec(t, allocations, func(c *confTurn) {
		if len(parIP) == 1 {
			c.parIP = parIP[0]
		}
	})
}

func demarrerAvec(t *testing.T, allocations int, regler func(*confTurn)) (confTurn, string) {
	t.Helper()
	l, err := net.ListenPacket("udp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := l.LocalAddr().(*net.UDPAddr).Port
	l.Close()
	c := confTurn{secret: secretTest, ip: netip.MustParseAddr("127.0.0.1"), port: port, min: 40000, max: 40100, allocations: allocations, parIP: 100, parNom: 100, octetsSecond: 1 << 20}
	regler(&c)
	srv, err := serveurTurn(c, "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { srv.Close() })
	return c, net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
}

func client(t *testing.T, adresse, nom, mdp string) *turn.Client {
	t.Helper()
	conn, err := net.ListenPacket("udp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	cl, err := turn.NewClient(&turn.ClientConfig{TURNServerAddr: adresse, STUNServerAddr: adresse, Username: nom, Password: mdp, Realm: realmTurn, Conn: conn, LoggerFactory: silence(), RTO: 200 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	if err := cl.Listen(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cl.Close(); conn.Close() })
	return cl
}

// De bout en bout : deux participants, chacun son allocation, échangent par le relais ; mauvais
// identifiants et identifiants échus refusés ; plafond d'allocations ; aucune sortie hors de la plage.
func TestRelaisDeBoutEnBout(t *testing.T) {
	_, adresse := demarrer(t, 3)
	nom, mdp := identifiants(secretTest, time.Now().Add(time.Hour))

	a := client(t, adresse, nom, mdp)
	b := client(t, adresse, nom, mdp)
	ra, err := a.Allocate()
	if err != nil {
		t.Fatal("allocation A :", err)
	}
	defer ra.Close()
	rb, err := b.Allocate()
	if err != nil {
		t.Fatal("allocation B :", err)
	}
	defer rb.Close()
	if p := ra.LocalAddr().(*net.UDPAddr).Port; p < 40000 || p > 40100 {
		t.Fatalf("port relayé hors plage : %d", p)
	}
	// A écrit vers l'allocation de B (la bibliothèque crée la permission) ; B lit.
	if _, err := rb.WriteTo([]byte("ouvre"), ra.LocalAddr()); err != nil {
		t.Fatal(err)
	}
	if _, err := ra.WriteTo([]byte("bonjour"), rb.LocalAddr()); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 64)
	_ = rb.SetReadDeadline(time.Now().Add(3 * time.Second))
	for {
		n, from, err := rb.ReadFrom(buf)
		if err != nil {
			t.Fatal("rien reçu par le relais :", err)
		}
		if string(buf[:n]) == "bonjour" {
			if from.String() != ra.LocalAddr().String() {
				t.Fatalf("expéditeur vu : %v, attendu l'allocation de A %v", from, ra.LocalAddr())
			}
			break
		}
	}

	// Contrôle d'exploitation de deploy.sh : le relais répond en STUN ; un port muet, non.
	if err := stunMain(adresse); err != nil {
		t.Fatal("stun :", err)
	}
	muet, _ := net.ListenPacket("udp4", "127.0.0.1:0")
	defer muet.Close()
	if err := stunMain(muet.LocalAddr().String()); err == nil {
		t.Fatal("stun : un port muet passe le contrôle")
	}

	// Une destination de la machine hors plage (ici un port local qui écoute) ne reçoit rien.
	cible, err := net.ListenPacket("udp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer cible.Close()
	_, _ = ra.WriteTo([]byte("rebond"), cible.LocalAddr())
	_ = cible.SetReadDeadline(time.Now().Add(700 * time.Millisecond))
	if n, _, err := cible.ReadFrom(buf); err == nil {
		t.Fatalf("un port de la machine hors plage a reçu %q", buf[:n])
	}

	// Plafond : 3 allocations ; la troisième passe, la quatrième est refusée.
	c3 := client(t, adresse, nom, mdp)
	r3, err := c3.Allocate()
	if err != nil {
		t.Fatal("troisième allocation :", err)
	}
	defer r3.Close()
	c4 := client(t, adresse, nom, mdp)
	if r4, err := c4.Allocate(); err == nil {
		r4.Close()
		t.Fatal("quatrième allocation acceptée au-delà du plafond")
	}

	// Identifiants faux ou échus : refusés.
	faux := client(t, adresse, nom, "AAAAAAAAAAAAAAAAAAAAAAAAAAA=")
	if r, err := faux.Allocate(); err == nil {
		r.Close()
		t.Fatal("mot de passe faux accepté")
	}
	nomEchu, mdpEchu := identifiants(secretTest, time.Now().Add(-time.Minute))
	echu := client(t, adresse, nomEchu, mdpEchu)
	if r, err := echu.Allocate(); err == nil {
		r.Close()
		t.Fatal("identifiants échus acceptés")
	}
}

// Plafond par adresse d'origine : au-delà, refus ; une allocation rendue libère sa place.
func TestPlafondParOrigine(t *testing.T) {
	_, adresse := demarrer(t, 100, 2)
	nom, mdp := identifiants(secretTest, time.Now().Add(time.Hour))
	a := client(t, adresse, nom, mdp)
	ra, err := a.Allocate()
	if err != nil {
		t.Fatal(err)
	}
	b := client(t, adresse, nom, mdp)
	rb, err := b.Allocate()
	if err != nil {
		t.Fatal(err)
	}
	defer rb.Close()
	c := client(t, adresse, nom, mdp)
	if r, err := c.Allocate(); err == nil {
		r.Close()
		t.Fatal("troisième allocation de la même adresse acceptée")
	}
	// Rendue : la place se libère.
	ra.Close()
	a.Close()
	deadline := time.Now().Add(3 * time.Second)
	for {
		d := client(t, adresse, nom, mdp)
		r, err := d.Allocate()
		if err == nil {
			r.Close()
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("place jamais rendue :", err)
		}
		time.Sleep(100 * time.Millisecond)
	}
}

// Plafond par identifiant : un même nom ne prend pas plus de parNom allocations, même depuis
// plusieurs adresses (le nonce de la bibliothèque n'est pas lié à l'adresse).
func TestPlafondParNom(t *testing.T) {
	_, adresse := demarrerAvec(t, 100, func(c *confTurn) { c.parNom = 2 })
	nom, mdp := identifiants(secretTest, time.Now().Add(time.Hour))
	for i := 0; i < 2; i++ {
		r, err := client(t, adresse, nom, mdp).Allocate()
		if err != nil {
			t.Fatal(i, err)
		}
		defer r.Close()
	}
	if r, err := client(t, adresse, nom, mdp).Allocate(); err == nil {
		r.Close()
		t.Fatal("troisième allocation du même identifiant acceptée")
	}
	autre, mdp2 := identifiants(secretTest, time.Now().Add(2*time.Hour))
	r, err := client(t, adresse, autre, mdp2).Allocate()
	if err != nil {
		t.Fatal("un autre identifiant est refusé :", err)
	}
	r.Close()
}

// Liaison de canal hors de la plage relayée : jetée (mémoire du relais), dans la plage : acceptée.
func TestGardeChannelBind(t *testing.T) {
	c := &confTurn{min: 49160, max: 49999}
	pour := func(port int) []byte {
		m, err := stun.Build(stun.TransactionID, stun.NewType(stun.MethodChannelBind, stun.ClassRequest))
		if err != nil {
			t.Fatal(err)
		}
		a := stun.XORMappedAddress{IP: net.ParseIP("203.0.113.9").To4(), Port: port}
		if err := a.AddToAs(m, stun.AttrXORPeerAddress); err != nil {
			t.Fatal(err)
		}
		m.WriteHeader()
		return m.Raw
	}
	if !c.garde(pour(49200)) {
		t.Fatal("liaison dans la plage jetée")
	}
	for _, p := range []int{1, 443, 49159, 50000, 65535} {
		if c.garde(pour(p)) {
			t.Fatalf("liaison vers le port %d acceptée", p)
		}
	}
	// Demande d'allocation avec EVEN-PORT : jetée ; sans : passe.
	alloc := func(even bool) []byte {
		m, _ := stun.Build(stun.TransactionID, stun.NewType(stun.MethodAllocate, stun.ClassRequest))
		if even {
			m.Add(stun.AttrEvenPort, []byte{0x80})
		}
		m.WriteHeader()
		return m.Raw
	}
	if c.garde(alloc(true)) || !c.garde(alloc(false)) {
		t.Fatal("EVEN-PORT mal filtré")
	}
	// ChannelData et octets quelconques : laissés à la bibliothèque.
	if !c.garde([]byte{0x40, 0x01, 0x00, 0x02, 1, 2}) || !c.garde([]byte{1}) {
		t.Fatal("ChannelData jeté")
	}
}

// Inondation de connexions TCP muettes : au-delà du plafond, refusées ; une fois fermées,
// l'écoute TCP répond de nouveau (pion s'arrêtait pour toujours à la première erreur d'Accept).
func TestEcouteTCPBornee(t *testing.T) {
	_, adresse := demarrerAvec(t, 4, func(c *confTurn) { c.parIP = 3 }) // TCP : 8 au total, 3 par adresse
	var muettes []net.Conn
	for i := 0; i < 20; i++ {
		c, err := net.Dial("tcp4", adresse)
		if err != nil {
			t.Fatal(err)
		}
		muettes = append(muettes, c)
	}
	time.Sleep(300 * time.Millisecond)
	// Au-delà de 3 pour cette adresse : fermées par le relais.
	fermees := 0
	for _, c := range muettes {
		_ = c.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
		if _, err := c.Read(make([]byte, 1)); err != nil && !isTimeout(err) {
			fermees++
		}
	}
	if fermees < 17 {
		t.Fatalf("connexions muettes refusées : %d, attendu au moins 17", fermees)
	}
	for _, c := range muettes {
		c.Close()
	}
	time.Sleep(200 * time.Millisecond)
	// Un Binding STUN en TCP passe de nouveau.
	c, err := net.Dial("tcp4", adresse)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	req := stun.MustBuild(stun.TransactionID, stun.BindingRequest)
	if _, err := c.Write(req.Raw); err != nil {
		t.Fatal(err)
	}
	_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 1500)
	n, err := c.Read(buf)
	if err != nil || n < 20 {
		t.Fatalf("pas de réponse STUN en TCP après l'inondation : %v", err)
	}
}

func isTimeout(err error) bool {
	var ne net.Error
	return errors.As(err, &ne) && ne.Timeout()
}
