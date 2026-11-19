# Ouvrir les comptes au public : ce qu'il faut réunir

État au 19 novembre 2026. Le compte par e-mail est **entièrement codé** côté moteur, serveur et site :
- inscription par code e-mail, connexion, « Rester connecté » ;
- double authentification (TOTP), mot de passe oublié, changement d'adresse et de mot de passe ;
- liste des appareils, export, suppression ;
- pseudo unique, deux coffres chiffrés sur l'appareil.

Il est **activé en production** (décision D8 du 19 novembre) : `SHH_COMPTES: "1"` dans `deploy/compose.yaml`, site de l'image construit avec `SHH_SITE_COMPTES=1`. Il ne peut pas encore fonctionner en ligne : `deploy.sh` refuse d'installer sans les secrets et le fournisseur d'e-mails (point 4). Dans la démo GitHub Pages, il est **essayable**, avec un faux serveur dans l'onglet ; aucun e-mail n'y est envoyé.

Ce document liste ce qui manque pour l'ouvrir au public. La procédure technique elle-même est dans `deploy/README.md` §12.

## 1. Décisions qui vous reviennent

| N° | Décision | État | Ce qu'il faut faire |
|---|---|---|---|
| D8 | Ouverture au public | **prise le 19 novembre : ouvert** | `SHH_COMPTES: "1"` et `SHH_SALONS: "1"` dans `deploy/compose.yaml`, site de l'image construit avec le compte. **Risque assumé : sans l'avis du juriste (point 2).** |
| D1 | Fournisseur d'envoi d'e-mails | ouverte | choisir un fournisseur dans l'UE, en SMTP standard (recommandé : Scaleway Transactional Email) |
| D4 | Un signalement remet l'ancienneté à zéro | ouverte | recommandé : oui, avec « Rendre l'ancienneté » au tableau de bord |
| D7 | « Rester connecté » | ouverte | recommandé : proposé, décoché par défaut ; session de 30 jours sans usage, 90 jours au plus (c'est ce qui est codé) |

Source : `docs/superpowers/specs/2026-11-14-compte-email-design.md`, §20 et §21.19.

## 2. Avis du juriste (recommandé ; D8 prise sans lui, risque assumé)

À lui soumettre, avec la conception du compte (§16, §21.18) :
- **LCEN art. 6 et décret 2021-1362** : obligation possible de conserver 1 an les données de création de compte (adresse, pseudonyme) et de connexion (adresse IP). Elle contredirait « adresse jamais gardée » et « aucune adresse IP sur disque » (gravité élevée, R17).
- **Contenus terroristes et pédocriminels** : obligations de l'hébergeur (LCEN, DSA art. 16 à 18, règlement TCO 2021/784) face à des signalements de contenus que Shhgone ne peut pas lire (R15).
- **Motif de bannissement** gardé sous forme de catégorie : donnée relative à une infraction présumée (RGPD art. 10, R16).
- **Photo de profil** : contenu hébergé, lisible par le séquestre (R22).
- **Suppression retardée de 7 jours** après une récupération : compatible avec le RGPD art. 12.3 ? (§21.10).

## 3. Ce qui manque encore dans le produit

- **Les écrans du salon** (plans C-3 à C-5) : aujourd'hui, un compte **ne sert qu'à créer des salons** (« Un compte gratuit sert seulement à créer des salons »). Le serveur refuse d'ailleurs `SHH_COMPTES=1` sans `SHH_SALONS=1`. Ouvrir les comptes avant le salon donnerait un compte sans usage visible. Ordre recommandé : salon d'abord, comptes ensuite.
- **Jetons anonymes (Privacy Pass)** et paiement Plus/Pro : le coffre du compte prévoit le pass Plus, mais la vente n'est pas codée.

## 4. À préparer techniquement (vous, avec `deploy/README.md` §12)

1. **Compte chez le fournisseur d'e-mails** (D1) :
   - SMTP en TLS implicite sur le port 465 ;
   - suivi des ouvertures et des clics désactivé ;
   - contrat de sous-traitance (RGPD art. 28) ;
   - journaux gardés le moins longtemps possible ;
   - enregistrements DNS de l'expéditeur (SPF, DKIM, DMARC) posés et vérifiés (§12.1).
2. **Clé du serveur** (32 octets) et mot de passe SMTP, dans `/srv/shhdrop/secrets/`, avec des droits stricts (§12.2).
   - **Copie hors ligne de la clé obligatoire** : sans elle, tous les comptes sont perdus, sans recours.
3. **Sauvegarde quotidienne chiffrée** de `comptes.db` (§12.4), installée **le jour même** de l'activation, puis une restauration essayée (§12.5) :
   - `age` et sa paire de clés (la clé privée hors ligne, à part de la clé du serveur) ;
   - un stockage objet dans l'UE, chez un autre fournisseur que l'hébergeur, avec versions et suppression après 30 jours ;
   - un accès en écriture seule sur la machine.
4. **Configuration** :
   - `deploy/.env` : `SHH_SMTP_HOST`, `SHH_SMTP_USER`, `SHH_MAIL_FROM` ;
   - `compose.yaml` : `SHH_SALONS: "1"` et `SHH_COMPTES: "1"`.
5. **Site** construit avec `SHH_SITE_COMPTES=1`, contrôlé par `node scripts/check-dist.mjs --comptes`.
6. Déploiement : `deploy/deploy.sh sha256:<empreinte>`. Il contrôle le relais SMTP, les secrets et le fournisseur.

## 5. Preuves déjà en place

- **Tests unitaires** : du compte (`web/src/account`, `web/src/routes/compte`) et du serveur (`server/internal/compte`, `server/internal/api/compte_test.go`).
- **Test « le serveur ne voit rien » étendu au compte** : `web/e2e/compte-sees-nothing.test.ts`, bloquant.
- **Démo** : parcours par l'interface (`web/ui-e2e/compte.demo.spec.ts`) et faux serveur du compte testé (`web/src/demo/fake-compte.test.ts`, TOTP contre les vecteurs de la RFC 6238).
- **Tests de bout en bout contre le vrai serveur**, comptes activés et faux SMTP local (`web/ui-e2e/compte.spec.ts`), par l'interface réelle :
  - inscription, connexion, mauvais mot de passe ;
  - « Rester connecté » et deux onglets ;
  - mot de passe oublié, changement de mot de passe ;
  - double authentification ;
  - suppression ;
  - « le serveur ne voit rien » (dossier de données et sorties du serveur fouillés : ni adresse, ni mot de passe, ni pseudo, ni clé TOTP).

  Pour l'instant sous Chromium seulement : WebKit est à activer après un premier passage vert en CI.

Ce qui reste à votre charge : les décisions (point 1), l'avis du juriste (point 2) et les comptes chez les fournisseurs (point 4). Le reste est prêt.
