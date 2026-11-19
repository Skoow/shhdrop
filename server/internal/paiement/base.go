package paiement

import (
	"database/sql"
	"errors"
	"fmt"
	"os"

	"github.com/skoow/shhdrop/server/internal/store"
)

// Schéma de paiements.db (conception §5.1) : base à part, sans aucune colonne commune avec
// shares.db ni comptes.db. Seulement des BLOB et des INTEGER ; dates au jour (minuit UTC,
// multiple de 86 400), jamais d'heure. Aucun montant, aucun pays, aucune donnée personnelle.
//
// passes : q (empreinte du pass) ; offre ; début et fin ; jetons restants de la période ; jour
// de la prochaine recharge ; révoqué.
// commandes : id (aléatoire, donné au prestataire) ; q ; formule ; état ; identifiant
// d'abonnement du prestataire (seul texte, gardé en octets parce qu'il sert à résilier) ;
// jours de création et de fin de garde.
// refs : empreinte SHA-256 d'une référence de paiement du prestataire → commande (idempotence
// des crédits, remboursements et litiges).
const schemaPaiements = `
CREATE TABLE IF NOT EXISTS passes(
  q BLOB PRIMARY KEY CHECK(typeof(q)='blob' AND length(q)=32),
  offre INTEGER NOT NULL CHECK(offre IN (1,2)),
  debut_jour INTEGER NOT NULL CHECK(typeof(debut_jour)='integer' AND debut_jour >= 0 AND debut_jour % 86400 = 0),
  fin_jour INTEGER NOT NULL CHECK(typeof(fin_jour)='integer' AND fin_jour >= 0 AND fin_jour % 86400 = 0),
  jetons INTEGER NOT NULL CHECK(typeof(jetons)='integer' AND jetons >= 0),
  recharge_jour INTEGER NOT NULL CHECK(typeof(recharge_jour)='integer' AND recharge_jour >= 0 AND recharge_jour % 86400 = 0),
  revoque INTEGER NOT NULL CHECK(revoque IN (0,1))) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS commandes(
  id BLOB PRIMARY KEY CHECK(typeof(id)='blob' AND length(id)=16),
  q BLOB NOT NULL CHECK(typeof(q)='blob' AND length(q)=32),
  offre INTEGER NOT NULL CHECK(offre IN (1,2)),
  jours INTEGER NOT NULL CHECK(jours IN (30,365)),
  renouvelle INTEGER NOT NULL CHECK(renouvelle IN (0,1)),
  moyen INTEGER NOT NULL CHECK(moyen IN (1,2,3)),
  etat INTEGER NOT NULL CHECK(etat BETWEEN 1 AND 5),
  abonnement BLOB CHECK(abonnement IS NULL OR (typeof(abonnement)='blob' AND length(abonnement) BETWEEN 1 AND 64)),
  cree_jour INTEGER NOT NULL CHECK(typeof(cree_jour)='integer' AND cree_jour >= 0 AND cree_jour % 86400 = 0),
  garde_jour INTEGER NOT NULL CHECK(typeof(garde_jour)='integer' AND garde_jour >= 0 AND garde_jour % 86400 = 0)) WITHOUT ROWID;
CREATE UNIQUE INDEX IF NOT EXISTS commandes_q ON commandes(q);
CREATE UNIQUE INDEX IF NOT EXISTS commandes_abonnement ON commandes(abonnement);
CREATE TABLE IF NOT EXISTS refs(
  r BLOB PRIMARY KEY CHECK(typeof(r)='blob' AND length(r)=32),
  commande BLOB NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  jour INTEGER NOT NULL CHECK(typeof(jour)='integer' AND jour >= 0 AND jour % 86400 = 0)) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS refs_commande ON refs(commande)`

// VersionBase : version du schéma de paiements.db (PRAGMA user_version).
const VersionBase = 1

// ErrBasePlusRecente : paiements.db écrite par une version plus récente ; message fixe.
var ErrBasePlusRecente = errors.New("paiements.db créée par une version plus récente de Shhgone : refus d'ouvrir " +
	"(retour arrière : réinstaller la version récente ; ne jamais effacer cette base, elle garde les pass payés)")

// OuvrirBase ouvre (ou crée) paiements.db comme comptes.db : fichier créé en 0600 avant
// SQLite, droits resserrés (base, -wal, -shm), mêmes PRAGMA que shares.db, une seule
// connexion, schéma exact. chemin : absolu, sans « ? », « # » ni « % » (SHH_DATA_DIR).
func OuvrirBase(chemin string) (*sql.DB, error) {
	f, err := os.OpenFile(chemin, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, err
	}
	f.Close()
	if err := serrer(chemin); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", "file:"+chemin+"?"+store.Pragmas)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	var v int
	if err := db.QueryRow(`PRAGMA user_version`).Scan(&v); err != nil {
		db.Close()
		return nil, fmt.Errorf("lecture de la version de paiements.db : %w", err)
	}
	if v > VersionBase {
		db.Close()
		return nil, ErrBasePlusRecente
	}
	if _, err := db.Exec(schemaPaiements); err != nil {
		db.Close()
		return nil, fmt.Errorf("création du schéma de paiements.db : %w", err)
	}
	if _, err := db.Exec(fmt.Sprintf(`PRAGMA user_version=%d`, VersionBase)); err != nil {
		db.Close()
		return nil, err
	}
	if err := serrer(chemin); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func serrer(chemin string) error {
	for _, f := range []string{chemin, chemin + "-wal", chemin + "-shm"} {
		if err := os.Chmod(f, 0o600); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}
