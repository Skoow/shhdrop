#!/usr/bin/env bash
# Test de la sortie SMTP (plan du compte, lot 8 ; conception du compte §3.2) : le serveur Go
# n'a aucune route vers Internet, même compte activé ; sa seule sortie est le relais SMTP, qui
# ne joint que SHH_SMTP_HOST:465.
#
# 1. Statique (docker compose config, sans démon) : sur la vraie compose.yaml,
#    - SHH_COMPTES vaut "0" ; le relais et le réseau « sortie » n'existent qu'avec le profil
#      « comptes » ; aucun service ne publie de port ;
#    - le serveur n'est que sur le réseau « interne » (internal: true) ; le relais sur
#      « interne » et « sortie », écoute 172.30.53.3:465, cible SHH_SMTP_HOST:465 ; le nom du
#      fournisseur désigne le relais dans /etc/hosts du serveur ;
#    - secrets : /run/secrets en lecture seule, hors de /data, chemins seulement dans
#      l'environnement (aucune valeur de clé ni de mot de passe) ;
#    - relais : compte 65532, lecture seule, sans capacité, no-new-privileges, sans journal.
# 2. Avec un démon Docker et l'image construite (SHH_IMAGE, binaires de cet arbre) : pile de
#    test (projet à part, mêmes réseaux que la production : à ne PAS lancer sur la machine de
#    production), faux fournisseur SMTP en TLS sur la machine ;
#    - depuis un conteneur du service shhdrop : accueil SMTP en TLS vérifié pour le nom du
#      fournisseur, à travers le relais ; une adresse d'Internet (TCP 443, 465, 25), un nom à
#      résoudre et le faux fournisseur joint directement : injoignables ;
#    - relais arrêté (compte désactivé) : le fournisseur n'est plus joignable du tout.
#
# Usage : deploy/test-sortie.sh            (statique, puis dynamique si un démon répond)
#         deploy/test-sortie.sh --statique (statique seulement)
#   SHH_IMAGE=…  image construite depuis cet arbre (ex. shhdrop:ci) ; partie dynamique
#   PORT_FAUX=…  port du faux fournisseur sur la machine (défaut : 18465)
# Outils : docker (Compose 2.24 ou plus), jq ; partie dynamique : openssl, python3.
# Code de sortie : 0 tout passe ; 1 un contrôle échoue ; 2 erreur d'usage ; 3 partie
# dynamique non faite (aucun démon Docker) : rien n'est alors prouvé sur le réseau réel.
set -euo pipefail
export LC_ALL=C

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
statique=0
[ "${1:-}" = --statique ] && statique=1
smtp=smtp.sortie.test

fails=0
ok() { printf 'ok    %s\n' "$1"; }
ko() {
	printf 'ÉCHEC %s\n' "$1"
	fails=$((fails + 1))
}
check() {
	local d=$1
	shift
	if "$@" >/dev/null 2>&1; then ok "$d"; else ko "$d"; fi
}
refuse() {
	local d=$1
	shift
	if "$@" >/dev/null 2>&1; then ko "$d"; else ok "$d"; fi
}
die() {
	printf 'erreur: %s\n' "$1" >&2
	exit 2
}
command -v docker >/dev/null || die "docker introuvable"
command -v jq >/dev/null || die "jq introuvable"

work=$(mktemp -d "${TMPDIR:-/tmp}/shh-sortie.XXXXXX")
proj=shhsortie$$
pid_faux=
dyn=0
cleanup() {
	if [ "$dyn" = 1 ]; then
		COMPOSE_PROFILES=comptes "${dcp[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
	fi
	if [ -n "$pid_faux" ]; then kill "$pid_faux" 2>/dev/null || true; fi
	rm -rf -- "$work"
}
trap cleanup EXIT

# --- 1. Statique ------------------------------------------------------------------------------
cfg() { # cfg <profils> : configuration résolue, en JSON
	env -i PATH="$PATH" HOME="${HOME:-/root}" SHH_IMAGE="${SHH_IMAGE:-registre.test/shhdrop@sha256:$(printf '0%.0s' {1..64})}" \
		SHH_DOMAIN=shhdrop.test SHH_DATA_ROOT="$work/racine" SHH_SMTP_HOST=$smtp COMPOSE_PROFILES="$1" \
		docker compose -p "$proj" -f "$here/compose.yaml" config --format json
}
cfg "" >"$work/sans.json" || die "docker compose config (sans profil) échoue"
cfg comptes >"$work/avec.json" || die "docker compose config (profil comptes) échoue"
j() { jq -e "$1" "$2" >/dev/null; }
S=$work/sans.json A=$work/avec.json

check "SHH_COMPTES vaut \"0\" dans compose.yaml" j '.services.shhdrop.environment.SHH_COMPTES == "0"' "$A"
check "sans profil : ni relais ni réseau « sortie »" j '(.services | keys) == ["caddy","shhdrop"] and (.networks | keys) == ["interne"]' "$S"
check "profil « comptes » : relais et réseau « sortie »" j '(.services | keys) == ["caddy","relais-smtp","shhdrop"] and (.networks | keys) == ["interne","sortie"]' "$A"
check "aucun port publié" j '[.services[] | .ports // [] | length] | add == 0' "$A"
check "serveur : réseau interne seul, internal: true" \
	j '(.services.shhdrop.networks | keys) == ["interne"] and .networks.interne.internal == true' "$A"
check "réseau « sortie » : pas interne (sortie du seul relais)" j '(.networks.sortie.internal // false) == false' "$A"
check "seul le relais est sur « sortie »" j '[.services | to_entries[] | select(.value.networks.sortie != null) | .key] == ["relais-smtp"]' "$A"
check "relais : interne 172.30.53.3 et sortie" \
	j '(.services["relais-smtp"].networks | keys) == ["interne","sortie"] and .services["relais-smtp"].networks.interne.ipv4_address == "172.30.53.3"' "$A"
check "relais : cible SHH_SMTP_HOST:465, écoute 172.30.53.3:465" \
	j '.services["relais-smtp"].entrypoint == ["/shhcheck"] and .services["relais-smtp"].command == ["relais","172.30.53.3:465","'$smtp':465"]' "$A"
check "relais : même image que le serveur" j '.services["relais-smtp"].image == .services.shhdrop.image' "$A"
check "serveur : le nom du fournisseur désigne le relais" \
	j '.services.shhdrop.extra_hosts == ["'$smtp'=172.30.53.3"] or .services.shhdrop.extra_hosts == ["'$smtp':172.30.53.3"]' "$A"
check "serveur : SMTP sur 465 seulement" j '.services.shhdrop.environment.SHH_SMTP_PORT == "465"' "$A"
check "secrets : /run/secrets en lecture seule, hors de /data, jamais créé par Docker" \
	j '[.services.shhdrop.volumes[] | select(.target == "/run/secrets")] | length == 1 and .[0].read_only == true and .[0].bind.create_host_path == false and (.[0].source | endswith("/secrets"))' "$A"
check "secrets : chemins seulement (…_FILE sous /run/secrets)" \
	j '.services.shhdrop.environment.SHH_COMPTES_CLE_FILE == "/run/secrets/shh_comptes_cle" and .services.shhdrop.environment.SHH_SMTP_PASSWORD_FILE == "/run/secrets/shh_smtp_mdp"' "$A"
check "aucune variable de secret en valeur (mot de passe, clé, jeton) : des chemins …_FILE seulement" \
	j '[.services[] | .environment // {} | keys[] | select(test("PASSWORD|MDP|SECRET|TOKEN|CLE|KEY") and (endswith("_FILE") | not))] == []' "$A"
check "relais : 65532, lecture seule, sans capacité, no-new-privileges, sans journal" \
	j '.services["relais-smtp"] | .user == "65532:65532" and .read_only == true and .cap_drop == ["ALL"] and .security_opt == ["no-new-privileges:true"] and .logging.driver == "none"' "$A"
check "relais : relancé s'il tombe, mémoire et processus bornés" \
	j '.services["relais-smtp"] | .restart == "unless-stopped" and .pids_limit == 64 and .mem_limit != null' "$A"

if [ "$statique" = 1 ]; then
	[ "$fails" -eq 0 ] || {
		echo "$fails échec(s)"
		exit 1
	}
	echo "partie statique : tous les contrôles passent (partie dynamique non demandée)"
	exit 0
fi

# --- 2. Dynamique -----------------------------------------------------------------------------
if ! docker info >/dev/null 2>&1; then
	echo "$fails échec(s) statique(s) ; partie dynamique NON FAITE : aucun démon Docker" >&2
	[ "$fails" -eq 0 ] || exit 1
	exit 3
fi
: "${SHH_IMAGE:?SHH_IMAGE manquant : image construite depuis cet arbre (docker build -f deploy/Dockerfile …)}"
for c in openssl python3; do command -v "$c" >/dev/null || die "$c introuvable"; done
port=${PORT_FAUX:-18465}

# Faux fournisseur : TLS (certificat pour $smtp, autorité de test), accueil « 220 », sur toutes
# les interfaces de la machine : le relais le joint par host-gateway ; le serveur ne doit pas.
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 1 -subj "/CN=$smtp" \
	-addext "subjectAltName=DNS:$smtp" -keyout "$work/faux.key" -out "$work/faux.pem" >/dev/null 2>&1
chmod 0644 "$work/faux.pem"
cat >"$work/faux.py" <<'EOF'
import socket, ssl, sys, threading
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(sys.argv[2], sys.argv[3])
s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("0.0.0.0", int(sys.argv[1]))); s.listen(16)
def servir(c):
    try:
        t = ctx.wrap_socket(c, server_side=True); t.settimeout(5)
        t.sendall(b"220 faux ESMTP\r\n"); t.recv(64); t.close()
    except Exception:
        c.close()
while True:
    c, _ = s.accept()
    threading.Thread(target=servir, args=(c,), daemon=True).start()
EOF
python3 -I "$work/faux.py" "$port" "$work/faux.pem" "$work/faux.key" &
pid_faux=$!

mkdir -p "$work/racine/data" "$work/racine/caddy" "$work/racine/secrets"
cat >"$work/override.yaml" <<EOF
services:
  relais-smtp:
    command: ["relais", "172.30.53.3:465", "$smtp:$port"]
    extra_hosts: ["$smtp:host-gateway"]
EOF
dcp=(env SHH_IMAGE="$SHH_IMAGE" SHH_DOMAIN=shhdrop.test SHH_DATA_ROOT="$work/racine" SHH_SMTP_HOST="$smtp"
	docker compose -p "$proj" -f "$here/compose.yaml" -f "$work/override.yaml")
dyn=1
COMPOSE_PROFILES=comptes "${dcp[@]}" up -d --wait relais-smtp >/dev/null 2>&1 || die "relais de test non démarré"
# sonde <hôte:port> : shhcheck smtp dans un conteneur du service shhdrop (mêmes réseaux,
# /etc/hosts, lecture seule), autorité du faux fournisseur acceptée.
sonde() {
	COMPOSE_PROFILES=comptes "${dcp[@]}" run --rm --no-deps -T -v "$work/faux.pem:/ca.pem:ro" -e SSL_CERT_FILE=/ca.pem \
		--entrypoint /shhcheck shhdrop smtp "$1"
}
check "serveur → fournisseur, à travers le relais, TLS vérifié" sonde "$smtp:465"
refuse "serveur → Internet (1.1.1.1:443) : injoignable" sonde 1.1.1.1:443
refuse "serveur → Internet (9.9.9.9:465) : injoignable" sonde 9.9.9.9:465
refuse "serveur → Internet (8.8.8.8:25) : injoignable" sonde 8.8.8.8:25
refuse "serveur → nom à résoudre (example.com:443) : injoignable" sonde example.com:443
gw=$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || echo 172.17.0.1)
refuse "serveur → faux fournisseur joint directement ($gw) : injoignable" sonde "$gw:$port"
check "aucun port publié (docker port)" test -z "$(COMPOSE_PROFILES=comptes "${dcp[@]}" port relais-smtp 465 2>/dev/null)"
COMPOSE_PROFILES=comptes "${dcp[@]}" rm -sf relais-smtp >/dev/null 2>&1
refuse "relais arrêté (compte désactivé) : fournisseur injoignable" sonde "$smtp:465"

if [ "$fails" -ne 0 ]; then
	echo "$fails échec(s)"
	exit 1
fi
echo "tous les contrôles passent"
