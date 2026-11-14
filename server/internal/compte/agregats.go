package compte

import "sync/atomic"

// Agrégats des comptes pour le tableau de bord (conception §21.14.2 ; plan lot 7). Que des
// entiers : lus en direct dans comptes.db (aucune ligne n'en sort), ou comptés depuis le
// démarrage en mémoire (un entier chacun, sans clé, perdus au redémarrage, comme
// internal/usage). Avec peu de comptes, un agrégat peut désigner une personne (§21.14.2) :
// rien n'est enregistré.

// compteurs : depuis le démarrage du processus.
type compteurs struct {
	inscriptions, connexions, echecs, recuperations, suppressions atomic.Int64
	// effaces : comptes effacés pour inactivité à la dernière passe quotidienne.
	effaces atomic.Int64
}

// AgregatsComptes : GET /api/comptes du tableau de bord.
type AgregatsComptes struct {
	// Comptes / Max (SHH_COMPTES_MAX) ; Neufs (< 7 jours d'ancienneté), Confirmes.
	Comptes   int `json:"comptes"`
	Max       int `json:"comptes_max"`
	Neufs     int `json:"neufs"`
	Confirmes int `json:"confirmes"`
	// Anciennete : depuis compte_des, < 7 j, 7 à 29 j, 30 à 182 j (« 1 à 6 mois »), 183 à 364 j
	// (« 6 à 12 mois »), 365 j et plus.
	Anciennete [5]int `json:"anciennete"`
	// AvecTOTP : double authentification active ; RetraitTOTP : retrait demandé, en attente ;
	// RecuperesSemaine : récupération par e-mail ces 7 derniers jours (recup_jour).
	AvecTOTP         int `json:"avec_totp"`
	RetraitTOTP      int `json:"retrait_totp_en_attente"`
	RecuperesSemaine int `json:"recuperes_7_jours"`
	// Sessions non échues, dont « rester connecté ».
	Sessions             int `json:"sessions"`
	SessionsPersistantes int `json:"sessions_persistantes"`
	// EffacesDernierPassage : comptes effacés pour inactivité à la dernière passe (0 avant).
	EffacesDernierPassage int `json:"effaces_inactivite_dernier_passage"`
	// Bannissements en cours : actifs, suspendus, actifs échéant dans les 30 jours.
	BannisActifs    int `json:"bannis_actifs"`
	BannisSuspendus int `json:"bannis_suspendus"`
	BannisBientot   int `json:"bannis_echeant_30_jours"`
	// Depuis le démarrage : inscriptions confirmées, connexions réussies (mot de passe, puis
	// code de l'application s'il le faut), échecs (mot de passe ou code de l'application faux),
	// récupérations par e-mail menées au bout, suppressions de compte.
	Inscriptions    int64 `json:"inscriptions"`
	Connexions      int64 `json:"connexions"`
	EchecsConnexion int64 `json:"echecs_connexion"`
	Recuperations   int64 `json:"recuperations"`
	Suppressions    int64 `json:"suppressions"`
}

// Agregats : lus à l'instant (trois requêtes d'agrégat ; une seule connexion à la base).
func (s *Service) Agregats() (AgregatsComptes, error) {
	now := s.now()
	auj := jourDe(now)
	a := AgregatsComptes{Max: s.max, EffacesDernierPassage: int(s.cpt.effaces.Load()),
		Inscriptions: s.cpt.inscriptions.Load(), Connexions: s.cpt.connexions.Load(), EchecsConnexion: s.cpt.echecs.Load(),
		Recuperations: s.cpt.recuperations.Load(), Suppressions: s.cpt.suppressions.Load()}
	q := s.db.QueryRow(`SELECT count(*),
		coalesce(sum((?1-compte_des)/86400 < 7), 0),
		coalesce(sum((?1-compte_des)/86400 BETWEEN 7 AND 29), 0),
		coalesce(sum((?1-compte_des)/86400 BETWEEN 30 AND 182), 0),
		coalesce(sum((?1-compte_des)/86400 BETWEEN 183 AND 364), 0),
		coalesce(sum((?1-compte_des)/86400 >= 365), 0),
		coalesce(sum(totp IS NOT NULL), 0), coalesce(sum(totp_retrait_jour IS NOT NULL), 0),
		coalesce(sum(recup_jour > ?1-7*86400), 0) FROM comptes`, auj)
	if err := q.Scan(&a.Comptes, &a.Anciennete[0], &a.Anciennete[1], &a.Anciennete[2], &a.Anciennete[3], &a.Anciennete[4],
		&a.AvecTOTP, &a.RetraitTOTP, &a.RecuperesSemaine); err != nil {
		return AgregatsComptes{}, err
	}
	a.Neufs = a.Anciennete[0]
	a.Confirmes = a.Comptes - a.Neufs
	if err := s.db.QueryRow(`SELECT count(*), coalesce(sum(persistante), 0) FROM sessions WHERE expire_jour>?`,
		now.Unix()).Scan(&a.Sessions, &a.SessionsPersistantes); err != nil {
		return AgregatsComptes{}, err
	}
	if err := s.db.QueryRow(`SELECT coalesce(sum(actif=1), 0), coalesce(sum(actif=0), 0),
		coalesce(sum(actif=1 AND jusqu_jour<=?1+30*86400), 0) FROM bannis WHERE jusqu_jour>?1`, auj).Scan(
		&a.BannisActifs, &a.BannisSuspendus, &a.BannisBientot); err != nil {
		return AgregatsComptes{}, err
	}
	return a, nil
}
