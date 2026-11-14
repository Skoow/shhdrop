#!/usr/bin/env bash
# Restauration de comptes.db depuis une sauvegarde chiffrée par deploy/sauvegarder.sh
# (conception du compte §21.13 ; plan, lot 8). Linux, outils : age, sqlite3, coreutils.
#
#   restaurer.sh verifier <sauvegarde.age> <identité age>
#       Essai mensuel (décision du propriétaire du 14 novembre) : déchiffre en mémoire
#       (/dev/shm), vérifie l'intégrité et les tables, affiche la version du schéma et le
#       nombre de comptes, efface le clair. Ne touche à aucune base.
#
#   restaurer.sh installer [--remplacer] <sauvegarde.age> <identité age> <dossier de données>
#       Sur la machine, SERVEUR ARRÊTÉ : déchiffre dans le dossier de données lui-même (le clair
#       ne quitte pas le volume chiffré), vérifie, efface les sessions de la copie (chacun se
#       reconnecte : une session fermée depuis la sauvegarde ne revient pas), puis installe
#       <dossier>/comptes.db
#       (propriétaire du dossier, 0600). Refus si un processus a encore la base ouverte. Une
#       base présente n'est remplacée qu'avec --remplacer : elle est alors gardée à côté
#       (comptes.db.avant-restauration, avec son -wal et son -shm), à effacer une fois le
#       compte de contrôle reconnecté. Un -wal ou un -shm orphelin est mis de côté aussi :
#       SQLite l'appliquerait à la base restaurée.
#
# Règles (README §12) : toujours la sauvegarde la PLUS RÉCENTE (les suppressions de comptes
# antérieures y sont appliquées ; en restaurer une plus ancienne ferait revenir des comptes
# supprimés) ; la restauration ne sert à rien sans la même clé du serveur (K_serveur,
# copie hors ligne). L'identité age peut être protégée par une phrase (age la demande).
#
# Codes de sortie : 0 réussite, 1 échec, 2 erreur d'usage.
set -euo pipefail
umask 077
export LC_ALL=C

die() {
	printf 'restauration : %s\n' "$1" >&2
	exit 1
}
usage() {
	printf 'usage: restaurer.sh verifier <sauvegarde.age> <identité age>\n' >&2
	printf '       restaurer.sh installer [--remplacer] <sauvegarde.age> <identité age> <dossier de données>\n' >&2
	exit 2
}

for c in age sqlite3; do
	command -v "$c" >/dev/null || die "$c introuvable"
done

# verifier_copie <clair> : intégrité, tables, version ; affiche le résumé (aucune donnée).
verifier_copie() {
	local f=$1 ok n v nb
	ok=$(sqlite3 -bail "$f" "PRAGMA integrity_check;" 2>/dev/null) || ok=
	[ "$ok" = ok ] || die "base déchiffrée abîmée (integrity_check)"
	n=$(sqlite3 -bail "$f" \
		"SELECT count(*) FROM sqlite_schema WHERE type='table' AND name IN ('comptes','sessions','bannis');")
	[ "$n" = 3 ] || die "ce n'est pas une base des comptes (tables comptes, sessions, bannis absentes)"
	v=$(sqlite3 -bail "$f" "PRAGMA user_version;")
	nb=$(sqlite3 -bail "$f" "SELECT count(*) FROM comptes;")
	printf 'intégrité : ok ; schéma %s ; %s comptes\n' "$v" "$nb"
}

# dechiffrer <sauvegarde> <identité> <clair>
dechiffrer() {
	[ -f "$1" ] || die "$1 absent"
	[ -f "$2" ] || die "$2 absent"
	[ "$(head -c 22 "$1")" = "age-encryption.org/v1" ] || die "$1 n'est pas un fichier age"
	age -d -i "$2" -o "$3" "$1" || die "déchiffrement impossible (mauvaise identité, ou fichier abîmé)"
}

# ouverte <fichier> : un processus de la machine (conteneurs compris) a ce fichier ouvert.
# Comparaison par périphérique et inode : le chemin vu dans un conteneur n'est pas celui-ci.
ouverte() {
	local id fd
	[ -e "$1" ] || return 1
	id=$(stat -L -c %d:%i "$1")
	for fd in /proc/[0-9]*/fd/*; do
		[ "$(stat -L -c %d:%i "$fd" 2>/dev/null)" = "$id" ] && return 0
	done
	return 1
}

[ $# -ge 1 ] || usage
mode=$1
shift
case $mode in
verifier)
	[ $# -eq 2 ] || usage
	[ -d /dev/shm ] || die "/dev/shm absent : le clair ne s'écrit qu'en mémoire"
	w=$(mktemp -d /dev/shm/shh-verif.XXXXXX)
	trap 'rm -rf -- "$w"' EXIT
	dechiffrer "$1" "$2" "$w/comptes.db"
	verifier_copie "$w/comptes.db"
	;;
installer)
	remplacer=0
	if [ "${1:-}" = --remplacer ]; then
		remplacer=1
		shift
	fi
	[ $# -eq 3 ] || usage
	[ "$(id -u)" = 0 ] || die "installer se lance en root (processus des conteneurs, propriétaire du fichier)"
	src=$1 id=$2 dir=$3
	[ -d "$dir" ] && [ ! -L "$dir" ] || die "$dir : dossier de données absent"
	db=$dir/comptes.db
	for f in "$db" "$db-wal" "$db-shm"; do
		if ouverte "$f"; then die "$f est ouvert par un processus : arrêter le serveur d'abord (deploy.sh, README §12)"; fi
	done
	if [ -e "$db" ] && [ "$remplacer" = 0 ]; then
		die "$db existe : --remplacer pour la remplacer (elle sera gardée à côté)"
	fi
	for f in "$db" "$db-wal" "$db-shm"; do
		[ ! -e "$f.avant-restauration" ] || die "$f.avant-restauration existe déjà (restauration précédente) : l'effacer d'abord"
	done
	w=$(mktemp -d "$dir/.restauration.XXXXXX")
	trap 'rm -rf -- "$w"' EXIT
	dechiffrer "$src" "$id" "$w/comptes.db"
	verifier_copie "$w/comptes.db"
	# Sessions effacées : une session fermée après la sauvegarde (déconnexion, mot de passe
	# changé, appareil retiré) ne doit pas revenir. Chacun se reconnecte (README §12.5).
	sqlite3 -bail "$w/comptes.db" "PRAGMA secure_delete=ON; DELETE FROM sessions; PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null ||
		die "effacement des sessions de la copie impossible"
	[ "$(sqlite3 -bail "$w/comptes.db" "SELECT count(*) FROM sessions;")" = 0 ] || die "sessions encore présentes"
	rm -f -- "$w/comptes.db-wal" "$w/comptes.db-shm" "$w/comptes.db-journal"
	chown --reference="$dir" "$w/comptes.db"
	chmod 0600 "$w/comptes.db"
	for f in "$db" "$db-wal" "$db-shm"; do
		if [ -e "$f" ]; then mv -T -- "$f" "$f.avant-restauration"; fi
	done
	mv -T -- "$w/comptes.db" "$db"
	sync -f "$db" 2>/dev/null || sync
	printf 'installée : %s (sauvegarde %s)\n' "$db" "${src##*/}"
	if [ "$remplacer" = 1 ]; then
		printf 'ancienne base gardée : %s.avant-restauration (à effacer après contrôle)\n' "$db"
	fi
	echo "suite : relancer le serveur (deploy/deploy.sh \"\$(cat deploy/.release)\"), puis se connecter avec le compte de contrôle."
	;;
*) usage ;;
esac
