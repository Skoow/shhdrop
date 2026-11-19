# Paiement des offres Plus et Pro : Stripe, PayPal, NOWPayments et jetons anonymes (conception)

**Statut** : conception du 19 novembre 2026, **à valider par le propriétaire**. Les décisions prises par défaut sont numérotées **DP-n** et marquées « à valider ». Remplace l'ébauche Paddle (`2026-11-16-paiement-paddle-design.md`, gardée pour mémoire) ; complète la spécification principale §38 (offre payante), §36 (ce que voit le serveur) et la conception du salon v3 §8 (appels).

**Décisions du propriétaire reprises ici** (19 novembre) :

1. **Stripe** (carte bancaire) et **PayPal** remplacent Paddle. Conséquence acceptée : **le propriétaire devient le vendeur** (TVA, factures, remboursements, litiges, droit de la consommation), il n'y a plus de « vendeur officiel » qui porte cela.
2. **Cryptomonnaies via NOWPayments** (Monero, BTC, ETH, USDT ; service hébergé ; un tiers voit les paiements ; commission ≈ 0,5 %).
3. **Jetons anonymes Privacy Pass (RSA aveugle)** : un achat ne relie jamais les partages à une identité. Moteur Rust : `blind-rsa-signatures` (version épinglée) ; serveur Go : `github.com/cloudflare/circl` (version épinglée) ; mêmes résultats prouvés par des vecteurs communs ; exception écrite dans `CLAUDE.md`.
4. Le compte à rebours « à partir de la première ouverture » est **réservé à Plus et Pro**.
5. Appels audio et vidéo des salons : **option payante, pas encore codée** (salon v3 §8) ; affichés « bientôt », jamais vendus ni promis comme disponibles ; le droit est prévu dès maintenant dans le format (§11).
6. Aucune ressource tierce sur le site : **redirection** vers la page hébergée du prestataire, jamais de script Stripe, PayPal ou NOWPayments dans nos pages.

---

## 1. Ce qui est vendu

| | Plus | Pro |
|---|---|---|
| Prix mensuel (TTC) | 7 € | 20 € |
| Prix annuel (TTC) | 70 € | 200 € |
| Taille par partage | 10 Go | 30 Go |
| Durée d'un partage | 2 ou 3 jours | 2, 3 ou 7 jours |
| Ouvertures | jusqu'à 10 | jusqu'à 20 |
| Compte à rebours à la première ouverture | oui | oui |
| Partages payants par période de 30 jours (jetons) | 30 | 100 |
| Salons payants par période de 30 jours (même réserve de jetons) | compris dans les 30 | compris dans les 100 |
| Appels audio dans un salon | **bientôt** (DP-14, à valider) | **bientôt** |
| Appels vidéo dans un salon | non | **bientôt** |

Chiffres lus dans un seul endroit par couche : `web/src/limits.ts` (`PAID`) pour le site, `server/internal/paiement/offres.go` (`Offres`) pour le serveur ; un test compare les deux (prix, durées des périodes, jetons).

**Rythmes et renouvellement** (D41-34, inchangé) :

| Rythme | Carte (Stripe) | PayPal | Crypto (NOWPayments) |
|---|---|---|---|
| Mensuel (30 jours) | abonnement renouvelé chaque mois, résiliable en un clic | abonnement renouvelé chaque mois, résiliable en un clic | **paiement unique de 30 jours** (aucun prélèvement possible en crypto) |
| Annuel (365 jours) | au choix : paiement unique **ou** renouvellement annuel (jamais présélectionné) | au choix : paiement unique **ou** renouvellement annuel | paiement unique de 365 jours |

- **DP-1 (à valider)** : en crypto, le mensuel est proposé en **paiement unique de 30 jours** (D41-34 (a) l'excluait ; l'écran disait « paiement unique pour la période ») : sans renouvellement, il n'y a aucun motif trompeur, et c'est le seul mensuel possible sans prélèvement.
- **Durées exactes** : un « mois » est une période de **30 jours**, un « an » de **365 jours**, comptés en jours UTC à partir du jour du paiement confirmé (§5.4). Un renouvellement payé avant la fin s'ajoute à la fin en cours (jamais de jour perdu).
- **Fin** : sans renouvellement, le pass s'arrête ; rien n'est prélevé. Avec renouvellement, un paiement refusé arrête simplement le pass à sa fin (aucune relance, aucun e-mail de notre part ; le prestataire peut en envoyer selon ses réglages, à couper chez lui, §13).
- **Résiliation** : bouton « Arrêter le renouvellement » sur la page Offres (pass gardé sur l'appareil) → le serveur demande au prestataire d'arrêter le renouvellement à la fin de la période payée (Stripe `cancel_at_period_end`, PayPal `cancel`). Aucune identité demandée : le pass suffit (§5.6).
- **Aucune promotion, aucun code promo, aucun essai gratuit, aucun prix barré** (§38.1).

## 2. Parcours

1. **Page Offres** (`/offres`) : étape 1 offre et rythme ; étape 2 moyen de paiement et **pays de résidence** (§9.2) ; étape 3 compte (facultatif, informatif) ; récapitulatif, case **non cochée** « Je demande l'accès immédiat et je renonce à mon droit de rétractation pour la période commencée » (§9.4), puis bouton « Payer sur la page sécurisée de {prestataire} ».
2. **Pass** : le navigateur tire `P` (32 octets, `crypto.getRandomValues`) et le range **avant** la redirection dans le stockage de l'appareil (§6.1), avec la commande en attente.
3. **Commande** : `POST /api/paiement/commande` (en-tête `X-Shh-Pass: P`, corps : offre, rythme, renouvellement, moyen, pays, renonciation). Le serveur crée la commande (`id` aléatoire de 16 octets), appelle le prestataire et rend l'adresse de sa page hébergée (`url`). Le site vérifie que l'adresse commence par l'origine attendue du prestataire (§4.4), puis `location.assign(url)`.
4. **Page hébergée du prestataire** : la personne paie (carte, compte PayPal, portefeuille crypto). Nous ne voyons rien de ce qui s'y passe.
5. **Retour** : `/offres/retour` (même adresse en cas de réussite ou d'abandon, **sans paramètre** : aucune donnée dans l'adresse). La page lit le pass en attente sur l'appareil, interroge `POST /api/paiement/etat` (`X-Shh-Pass`) toutes les 3 s pendant 2 min, puis toutes les 30 s, et affiche : **« Paiement reçu »** (offre, date de fin, renouvellement), **« Paiement en attente »** (crypto en confirmation, webhook pas encore reçu, paiement crypto partiel), ou **« Paiement non abouti »** (refusé, expiré, abandonné), avec « Réessayer » et « Oublier cette commande ».
6. **Webhook signé** du prestataire → notre serveur : seule source de vérité du paiement (§4). Le retour de la personne ne prouve rien.
7. **Droit** : paiement confirmé → le pass reçoit sa période et sa réserve de jetons (§5). Les jetons anonymes sont émis plus tard, à la demande de l'appareil, et dépensés à la création d'un partage ou d'un salon payant (§7).

**Sans compte** : tout marche. **Avec compte** : le pass est en plus rangé dans le coffre de profil (`pass`, §6.2), pour le retrouver sur un autre appareil.

## 3. Ce que voit chaque partie

| Partie | Voit | Ne voit jamais |
|---|---|---|
| Stripe, PayPal, NOWPayments | identité et moyen de paiement (selon le prestataire), pays, montant, date, **identifiant de commande** (aléatoire, 16 octets en hexadécimal), offre et rythme, renonciation cochée et son heure | `P`, `Q`, jetons, partages, salons, compte |
| Notre serveur (au repos, `paiements.db`) | `Q` = empreinte du pass, offre, jours de début et de fin, jetons restants, commande (identifiant aléatoire), référence d'abonnement du prestataire (pour résilier), empreintes SHA-256 des références de paiement (pour les remboursements et litiges), jours | nom, e-mail, adresse, carte, compte PayPal, adresse de portefeuille, pays, adresse IP, heure précise, montant (déduit de l'offre), lien avec un partage, un salon ou un compte |
| Notre serveur (en direct) | `P` à la commande, à l'état et à l'émission des jetons ; l'adresse IP de la requête (mémoire seulement, limites anti-abus, comme toute requête) | — |
| Un voleur du disque | ce que garde `paiements.db` (ci-dessus) : combien de pass existent, leurs offres et leurs fins | `P` (seul `Q` est gardé : il ne permet ni de demander des jetons ni de lire l'état) |

**Règle** : `paiements.db` est une **base séparée** de `shares.db` et `comptes.db`, sans aucune colonne commune (ni identifiant de partage, ni `h` de compte). Seulement des BLOB et des INTEGER, dates au jour (multiples de 86 400), jamais d'heure, comme `comptes.db`.

**Ce qui relie quoi** :

- Prestataire : identité ↔ commande.
- Notre serveur : commande ↔ `Q`. Donc, en réunissant le prestataire **et** notre disque : identité ↔ `Q` ↔ « a acheté Plus jusqu'au 12 mars ». **Jamais** `Q` ↔ partages ou salons : les jetons sont aveugles (§7).
- **DP-2 (à valider)** : l'identifiant de commande est donné au prestataire à la place de `Q` (l'ébauche Paddle donnait `Q`). Gain : le prestataire n'apprend rien de lié au pass ; un `Q` ne circule jamais hors de notre serveur.

## 4. Prestataires : appels sortants et webhooks

Aucun SDK : appels HTTPS simples avec la bibliothèque standard Go (`net/http`, `crypto/hmac`, `crypto/sha256`, `crypto/sha512`, `encoding/json`), derrière une interface testable (`paiement.Prestataire`). Les adresses des API sont **fixées dans le code** (production ou bac à sable selon `SHH_PAIEMENT_ESSAI`), jamais lues dans l'environnement : une variable modifiée ne peut pas envoyer nos clés ailleurs. Les tests remplacent l'adresse par celle d'un faux serveur `httptest` (champ non exporté).

Client HTTP : délai total 20 s, TLS vérifié (certificats racine de l'image), aucune redirection suivie, réponse lue jusqu'à 1 Mio au plus, aucun en-tête `User-Agent` de notre part autre que `Shhgone` (jamais de version), aucune donnée personnelle envoyée (pas d'e-mail, pas de nom, pas d'IP).

### 4.1 Stripe (carte)

- **Création** : `POST https://api.stripe.com/v1/checkout/sessions` (formulaire), en-têtes `Authorization: Bearer <clé secrète>`, `Stripe-Version: 2026-02-25.clover` (version épinglée, DP-3), `Idempotency-Key: commande-<id>`. Paramètres :
  - `mode=payment` (paiement unique) ou `mode=subscription` (renouvellement) ;
  - `line_items[0][quantity]=1`, `line_items[0][price_data][currency]=eur`, `[unit_amount]` en centimes (700, 7000, 2000, 20000), `[product_data][name]` (« Shhgone Plus, 30 jours »…), `[tax_behavior]=inclusive` (prix TTC), et pour un abonnement `[recurring][interval]=month|year` ;
  - `client_reference_id=<commande>`, `metadata[commande]`, `metadata[pays_declare]`, `metadata[renonciation]=oui`, `metadata[renonciation_heure]` (secondes Unix) ; `payment_intent_data[metadata][commande]` (paiement unique) ou `subscription_data[metadata][commande]` (abonnement) ;
  - `payment_method_types[0]=card` ; `success_url` et `cancel_url` = `<SHH_ORIGIN>/offres/retour` ; `locale=auto` ;
  - `invoice_creation[enabled]=true` en paiement unique (facture Stripe, §9.3) ; `automatic_tax[enabled]=true` si `SHH_STRIPE_TAXE=1` (Stripe Tax, §9.1).
  - Réponse : `id`, `url` ; `url` doit commencer par `https://checkout.stripe.com/`.
  - Prix « en ligne » (`price_data`) plutôt que des prix créés dans le tableau de bord (**DP-4, à valider**) : une seule source de vérité, le code, comparée au site par un test ; rien à recopier chez Stripe.
- **Webhook** : `POST /api/paiement/webhook/stripe`. En-tête `Stripe-Signature: t=<secondes>,v1=<hex>[,v1=<hex>…]` ; signature = HMAC-SHA-256(secret `whsec_…`, `t` ‖ « . » ‖ corps brut) ; **comparaison en temps constant** (`hmac.Equal`) avec chaque `v1` (plusieurs pendant un changement de secret) ; `t` à **±300 s** de l'horloge du serveur (Stripe ne borne que le passé ; nous refusons aussi un `t` dans le futur). `object` = `event`, `livemode` = mode attendu (`false` en essai). Événements traités :
  - `checkout.session.completed` et `checkout.session.async_payment_succeeded` : si `payment_status` = `paid` → paiement confirmé ; référence de paiement = `payment_intent` (paiement unique) ou `invoice` (premier mois d'un abonnement, la même que son `invoice.paid`) ; abonnement : `subscription` gardé pour résilier ;
  - `checkout.session.expired`, `checkout.session.async_payment_failed` → commande « non aboutie » ;
  - `invoice.paid` (`billing_reason` = `subscription_create` ou `subscription_cycle`) : commande lue dans `parent.subscription_details.metadata.commande` (version « clover ») ou, à défaut, par l'abonnement (`parent.subscription_details.subscription`, ou `subscription` des anciennes versions) ; référence = `id` de la facture ; montant `amount_paid` et devise `currency` vérifiés ;
  - `customer.subscription.deleted` → renouvellement arrêté (le pass va jusqu'à sa fin) ;
  - `charge.refunded` (seulement si `refunded` = `true`, remboursement total) et `charge.dispute.created` → pass **révoqué** ; commande lue dans `metadata.commande`, sinon par l'empreinte de `payment_intent`.
  - Tout autre type : 200, ignoré.

### 4.2 PayPal

- **Jeton d'accès** : `POST https://api-m.paypal.com/v1/oauth2/token` (bac à sable : `api-m.sandbox.paypal.com`), authentification basique `client_id:secret`, corps `grant_type=client_credentials` ; jeton gardé en mémoire jusqu'à 60 s avant son échéance (`expires_in`).
- **Paiement unique (annuel sans renouvellement)** : `POST /v2/checkout/orders`, en-tête `PayPal-Request-Id: commande-<id>` (idempotence), corps : `intent=CAPTURE`, `purchase_units[0]` avec `custom_id=<commande>`, `description`, `amount{currency_code:EUR, value:"70.00", breakdown{item_total, tax_total}}` et `items[0]{name, quantity:"1", category:DIGITAL_GOODS, unit_amount, tax}` (§9.1) ; `payment_source.paypal.experience_context{return_url, cancel_url, user_action:PAY_NOW, shipping_preference:NO_SHIPPING, brand_name:"Shhgone"}`. Réponse : lien `rel=payer-action` (`https://www.paypal.com/…` ou `https://www.sandbox.paypal.com/…`).
- **Abonnement** : `POST /v1/billing/subscriptions`, `PayPal-Request-Id`, corps `plan_id` (plan créé par le propriétaire chez PayPal, §14), `custom_id=<commande>`, `application_context{brand_name, return_url, cancel_url, user_action:SUBSCRIBE_NOW, shipping_preference:NO_SHIPPING}`. Réponse : `id` (abonnement, gardé) et lien `rel=approve`.
- **Capture** : à `CHECKOUT.ORDER.APPROVED`, le serveur appelle `POST /v2/checkout/orders/{id}/capture` (`PayPal-Request-Id: capture-<commande>`) ; une capture `COMPLETED` dans la réponse confirme le paiement (référence = identifiant de la capture), comme le webhook `PAYMENT.CAPTURE.COMPLETED` qui suit (même référence : un seul crédit). **DP-5 (à valider)** : capture déclenchée par le webhook seulement (pas par la page de retour) : une seule voie, déjà signée.
- **Webhook** : `POST /api/paiement/webhook/paypal`. Vérification **par l'API** `POST /v1/notifications/verify-webhook-signature` avec `auth_algo`, `cert_url`, `transmission_id`, `transmission_sig`, `transmission_time` (en-têtes `PayPal-Auth-Algo`, `PayPal-Cert-Url`, `PayPal-Transmission-Id`, `PayPal-Transmission-Sig`, `PayPal-Transmission-Time`), `webhook_id` (configuration) et `webhook_event` = **corps brut tel quel** (jamais réencodé) ; accepté seulement si `verification_status` = `SUCCESS`. Contrôles avant l'appel (aucun appel sortant pour une requête manifestement fausse) : les cinq en-têtes présents une seule fois, `cert_url` en `https://api.paypal.com/` ou `https://api.sandbox.paypal.com/` (ou `api-m.`), corps JSON avec `id` et `event_type`. Au plus **4 vérifications simultanées** (au-delà : 503, PayPal réessaie). Événements :
  - `CHECKOUT.ORDER.APPROVED` → capture (ci-dessus) ;
  - `PAYMENT.CAPTURE.COMPLETED` → confirmé (`custom_id`, `amount` vérifiés) ; `PAYMENT.CAPTURE.DENIED` → non abouti ;
  - `BILLING.SUBSCRIPTION.ACTIVATED` → identifiant d'abonnement gardé ; `BILLING.SUBSCRIPTION.CANCELLED`, `…EXPIRED`, `…SUSPENDED` → renouvellement arrêté ;
  - `PAYMENT.SALE.COMPLETED` (abonnement) → confirmé ; commande par `custom` si présent, sinon par `billing_agreement_id` ; référence = `id` de la vente ; inconnue (l'activation n'est pas encore arrivée) → **500** pour que PayPal réessaie ;
  - `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `PAYMENT.SALE.REFUNDED`, `PAYMENT.SALE.REVERSED` → révoqué (par `custom_id`/`custom`, sinon par l'empreinte de la capture ou de la vente : `sale_id`, liens `up`) ;
  - `CUSTOMER.DISPUTE.CREATED` → révoqué (par `disputed_transactions[].seller_transaction_id`).

### 4.3 NOWPayments (crypto)

- **Création** : `POST https://api.nowpayments.io/v1/invoice` (bac à sable : `api-sandbox.nowpayments.io`), en-tête `x-api-key`, corps `price_amount` (7, 20, 70 ou 200), `price_currency=eur`, `order_id=<commande>`, `order_description`, `ipn_callback_url=<SHH_ORIGIN>/api/paiement/webhook/nowpayments`, `success_url` et `cancel_url` = `<SHH_ORIGIN>/offres/retour`, `is_fixed_rate=true`, `is_fee_paid_by_user=false`. Réponse : `invoice_url` en `https://nowpayments.io/` (bac à sable : `https://sandbox.nowpayments.io/`). Monnaies proposées : celles activées par le propriétaire dans son tableau de bord NOWPayments (XMR, BTC, ETH, USDT).
- **Webhook (IPN)** : en-tête `x-nowpayments-sig` = HMAC-SHA-512(secret IPN, JSON du corps **aux clés triées récursivement**, sans espace), en hexadécimal ; comparaison en temps constant. Le serveur retrie les clés lui-même (décodage en `json.Number` pour garder chaque nombre tel qu'écrit, échappement HTML désactivé) ; une différence d'écriture fait refuser (échec fermé, jamais un crédit).
  - `payment_status` = `finished` et `price_amount` = prix attendu et `price_currency` = `eur` → confirmé (référence = `payment_id`) ;
  - `waiting`, `confirming`, `confirmed`, `sending` → en attente ; `partially_paid` → **en attente, jamais crédité** (le propriétaire règle à la main : complément ou remboursement, §8) ;
  - `failed`, `expired` → non abouti ; `refunded` → révoqué.
- **Horodatage** : l'IPN ne porte pas d'heure signée ; le rejeu d'un IPN valide ne fait rien (idempotence, §5.3).

### 4.4 Garde-fous communs

- **Adresses de redirection** vérifiées deux fois (serveur et site) contre une liste fermée d'origines : `https://checkout.stripe.com/`, `https://www.paypal.com/`, `https://www.sandbox.paypal.com/`, `https://nowpayments.io/`, `https://sandbox.nowpayments.io/`. Toute autre réponse → 502 `prestataire`.
- **Montant et devise** vérifiés à chaque confirmation (euros, centimes exacts) ; un écart → commande en « anomalie » (affichée « Paiement non abouti, contactez-nous avec le numéro de commande »), aucun crédit.
- **Corps des webhooks** : 256 Kio au plus, lu en 10 s ; réponse `200 {}` pour un événement traité ou ignoré, `400` pour une signature fausse ou un corps illisible, `500` pour une erreur à nous (le prestataire réessaie), `503` si le serveur est occupé.
- **Aucun journal** : rien du corps, des en-têtes ni de l'adresse n'est écrit (règle de tout le serveur).

## 5. Données gardées, idempotence, cycle de vie

### 5.1 `paiements.db` (schéma 1)

```
passes(q BLOB(32) PK, offre INTEGER (1 Plus, 2 Pro), debut_jour, fin_jour,
       jetons INTEGER ≥ 0, recharge_jour, revoque INTEGER (0/1)) WITHOUT ROWID
commandes(id BLOB(16) PK, q BLOB(32), offre, jours (30/365), renouvelle (0/1),
          moyen (1 carte, 2 PayPal, 3 crypto), etat (1 en attente, 2 payée,
          3 non aboutie, 4 anomalie, 5 révoquée), abonnement BLOB(1..64) NULL,
          cree_jour, garde_jour) WITHOUT ROWID
references(r BLOB(32) PK = SHA-256(« shhdrop/v2/paiement/ref » ‖ 0x00 ‖ fournisseur ‖ 0x00 ‖ référence),
           commande BLOB(16), jour) WITHOUT ROWID
```

- Fichier `SHH_DATA_DIR/paiements.db`, 0600, mêmes PRAGMA que `shares.db` (`secure_delete`, WAL), une connexion. **Sauvegardé chaque jour avec `comptes.db`** (perdre la base = perdre les pass payés ; plan, tâche 9).
- `abonnement` : identifiant d'abonnement du prestataire (`sub_…`, `I-…`), seul texte gardé, **en clair parce qu'il sert à résilier** ; aucune autre référence en clair.

### 5.2 Le pass `P` et son empreinte `Q`

- `P` : 32 octets aléatoires tirés par l'appareil (WebCrypto ; apps : générateur du système). Envoyé en base64url sans bourrage dans l'en-tête `X-Shh-Pass` (jamais dans l'adresse, jamais dans un corps), seulement vers `/api/paiement/*` (et plus tard l'émission des jetons).
- `Q` = SHA-256(« shhdrop/v2/pass » ‖ 0x00 ‖ `P`), calculée **par le serveur** (bibliothèque standard Go). **DP-6 (à valider)** : remplace la formule de §38.4 (SHA-256(HKDF(`P`, « shhdrop/v2/pass »))) : `Q` ne sert qu'à retrouver la ligne, sans clé dérivée ; une seule fonction, côté serveur, donc rien à refaire à l'identique dans le moteur ni dans les apps (l'appareil n'envoie que `P`). Vecteurs : `engine/vectors/paiement.json` (entrée `P`, sortie `Q`), rejoués par le test Go.

### 5.3 Idempotence

- **Un paiement ne crédite qu'une fois** : chaque confirmation porte une **référence de paiement** du prestataire (Stripe : PaymentIntent ou facture ; PayPal : capture ou vente ; NOWPayments : `payment_id`) ; son empreinte est insérée dans `references` **dans la même transaction** que le crédit ; une empreinte déjà présente → rien (200). Peu importe l'événement qui l'apporte (session terminée puis `invoice.paid`, capture puis `PAYMENT.CAPTURE.COMPLETED`, IPN rejoué).
- Création de commande : `Idempotency-Key` (Stripe) et `PayPal-Request-Id` (PayPal) dérivés de la commande ; un double clic crée deux commandes distinctes, chacune ouverte au plus une fois (sans effet).
- Révocation, arrêt du renouvellement, « non aboutie » : opérations idempotentes (état final).

### 5.4 Crédit d'une période

Dans une transaction : `fin_jour` = max(`fin_jour`, aujourd'hui) + 30 ou 365 jours ; à la première période `debut_jour` = aujourd'hui, `jetons` = réserve de la période (Plus 30, Pro 100), `recharge_jour` = aujourd'hui + 30 ; commande → « payée ». Un pass révoqué ne se recrédite pas (anomalie).

**Réserve de jetons** : à chaque demande d'émission (§7), si `recharge_jour` ≤ aujourd'hui < `fin_jour`, la réserve est **remise** à sa valeur (pas de report) et `recharge_jour` avance de 30 jours (autant de fois que nécessaire). Un annuel a donc 12 ou 13 réserves ; un mensuel renouvelé une par mois.

### 5.5 Remboursement, litige, révocation

- Remboursement **total**, litige ouvert, reversement : `revoque` = 1, `jetons` = 0, `fin_jour` = aujourd'hui ; la commande passe « révoquée ». Les **jetons déjà émis restent utilisables** jusqu'à la fin de l'époque de leur clé (ils sont aveugles : personne ne sait lesquels), d'où l'émission par petits lots (§7).
- Remboursement **partiel** (geste commercial, rétractation au prorata) : aucun effet automatique ; le propriétaire décide (`shhdrop admin paiement revoquer <commande>`).
- **Commande introuvable** pour un remboursement (abonnement Stripe dont la facture n'est pas reliée) : 200, rien ; le propriétaire révoque à la main avec l'identifiant de commande lu dans les métadonnées du prestataire.

### 5.6 Résiliation et état

- `POST /api/paiement/etat` (`X-Shh-Pass`) → `{ "etat": "attente" | "payee" | "non_aboutie" | "anomalie" | "revoquee" | "inconnue", "offre": "plus" | "pro" | null, "fin": "AAAA-MM-JJ" | null, "renouvelle": bool, "droits": [...] }`. `inconnue` : aucun pass ni commande pour ce `P` (commande purgée, ou pass inventé) ; un `P` mal formé (pas exactement 32 octets en base64url) → 400 `bad_request`. Si plusieurs commandes portent le même `P` (nouvel essai après un échec), l'état est celui de la plus favorable (payée, puis en attente, puis les autres).
- `POST /api/paiement/resilier` (`X-Shh-Pass`) → arrête le renouvellement chez le prestataire (Stripe `POST /v1/subscriptions/{id}` `cancel_at_period_end=true` ; PayPal `POST /v1/billing/subscriptions/{id}/cancel`) ; `renouvelle` = 0 ; idempotent.

### 5.7 Purge (passe quotidienne)

- Commande « en attente » ou « non aboutie » : effacée 2 jours après sa création (une page hébergée expire au plus en 24 h ; crypto : NOWPayments garde la facture ouverte jusqu'à 24 h environ).
- Commande payée ou révoquée : gardée jusqu'à `garde_jour` = fin du pass + 180 jours (délai des litiges : PayPal 180 jours, cartes jusqu'à 120 jours), puis effacée avec ses références.
- Pass : effacé 31 jours après `fin_jour` (après la fin de validité des jetons émis, §7) ou 31 jours après sa révocation.

## 6. Où vit le pass

### 6.1 Sur l'appareil

- Base IndexedDB `shhdrop-pass` (module `web/src/paiement/`), chiffrée comme la session du compte (`account/persist.ts`) : clé AES-256-GCM **non extractible** gardée dans la base ; honnêtement, cela ne protège que d'une lecture naïve du stockage (dit sur la page). Enregistrements : `P`, offre, rythme, moyen, commande en attente oui/non. **Exception écrite** à « aucun stockage navigateur » (`source-rules.test.ts`), comme le compte.
- « Oublier ce pass » efface l'enregistrement ; perdre l'appareil sans compte = perdre le pass (dit avant le paiement : « Sans compte, votre offre ne vit que sur cet appareil »). **DP-7 (à valider)** : pas de « clé de secours » à recopier au lancement (simplicité) ; le compte la remplace.

### 6.2 Dans le compte (facultatif)

- Coffre de **profil** (`pass`, champ texte existant) : `"shp1:" ‖ base64url(P)` (plusieurs pass : séparés par « , », 8 au plus). Le serveur du compte ne sait pas ouvrir ce coffre… **sauf** le séquestre du profil (conception du compte, R-D1) : avec la clé du serveur et la base, un exploitant peut ouvrir les profils, donc les pass. **DP-8 (à valider)** : ranger le pass dans le coffre **privé** (ouvert seulement par le mot de passe), pas dans le profil : le champ `pass` du profil reste vide. Plan, tâche 8.
- La page Offres (page séparée, sans module de compte) ne lit pas le compte : le rangement se fait depuis l'application, à la connexion suivante (« 1 offre sur cet appareil : la ranger dans votre compte ? »).

### 6.3 Apps (D42-20)

Même format : `P` en base64url, en-tête `X-Shh-Pass`, mêmes routes ; stockage dans le trousseau du système. Rien ne dépend du navigateur **sauf** : la redirection vers la page hébergée (apps : navigateur du système, `ASWebAuthenticationSession` / Custom Tabs) et le retour (`/offres/retour`, lien universel de l'app plus tard). **Signalement S7** : l'App Store et Google Play imposent leur propre paiement pour un service numérique consommé dans l'app (règles 3.1.1 et « Payments policy ») ; vendre Plus/Pro dans les apps par Stripe, PayPal ou crypto peut faire refuser l'app. Correction : dans les apps, **aucun achat** (lecture du pass acheté ailleurs seulement, règle « reader »/« multiplatform services »), à valider à la soumission.

## 7. Jetons anonymes (Privacy Pass, RSA aveugle)

**État** : interface serveur prête (`paiement.Droits` : « paiement confirmé → réserve de N jetons » et `Prendre(q, n)`), émission RSA aveugle **à faire** (plan, tâches 6 et 7). Paramètres fixés ici pour que les apps et le salon puissent s'y fier :

- **Protocole** : Privacy Pass, émission RFC 9578 type **0x0002** (RSA aveugle publiquement vérifiable), **RSABSSA-SHA384-PSS-Deterministic**, module de 2 048 bits (RFC 9474). **Signalement S8 (faible, exactitude)** : §38.4 écrit « Randomized » ; RFC 9578 impose la variante **Deterministic** pour le type 2 (le nonce du jeton tient lieu d'aléa) ; corrigé ici.
- **Bibliothèques** (décision du propriétaire) : site et apps, moteur Rust `blind-rsa-signatures` **= 0.19.0** (dernière publiée le 19 novembre, à épingler exactement dans `Cargo.lock` après revue, §12) ; serveur, `github.com/cloudflare/circl` **v1.6.5** (`blindsign/blindrsa`). Vecteurs communs : `engine/vectors/privacypass.json` (RFC 9474 annexe A et nos cas : `TokenRequest`, `TokenResponse`, jeton final), rejoués en Rust, en wasm et en Go.
- **Clés d'émission** : une paire par **offre** (Plus, Pro) et par **mois UTC** ; jetons valables le mois de leur clé et le suivant. Clés publiques publiées dans le manifeste de version signé (§28.2), pour que tout le monde reçoive la même. Clés privées : fichiers secrets (`SHH_JETONS_CLES_DIR`), hors de `SHH_DATA_DIR`.
- **Émission** : `POST /api/jetons` (`X-Shh-Pass`, corps : jusqu'à **5** `TokenRequest`) → `TokenResponse` signées ; `jetons` décrémenté dans la même transaction ; l'appareil demande à une heure aléatoire, bien avant l'usage, et garde ses jetons à côté du pass (IndexedDB chiffrée ; coffre privé du compte).
- **Dépense** : `Authorization: PrivateToken token=<base64url>` sur `POST /api/shares` (partage Plus/Pro) et sur la création d'un salon payant ; le serveur vérifie la signature (clé du mois ou du précédent), refuse un jeton déjà vu (`spent`, empreinte SHA-256 seule, sans date, dans `paiements.db`, purgée à la fin de l'époque), fixe le niveau (`tier`) du partage ou du salon et **ne garde rien** qui relie le partage au jeton.
- **Ce que voit le serveur** : à l'émission, `P` (donc le pass) et le nombre de jetons ; à la dépense, un jeton valable pour une offre, jamais lequel des pass l'a obtenu (anonymat inconditionnel de la signature aveugle) ; deux partages payants du même pass ne sont pas reliables.
- **Limite honnête** : la date d'émission et la date de dépense, rapprochées, peuvent relier un pass à un partage si très peu de personnes paient (petit anonymat) ; d'où l'émission anticipée à heure aléatoire et par lots. À dire sur la page Confidentialité.

## 8. Limites et abus

- **Création de commande** : 10 par heure et par connexion (/64), 30 par /48 ; 1 000 commandes « en attente » au plus en tout (au-delà : 503) ; `SHH_PAIEMENT` active la route seulement si au moins un prestataire est configuré.
- **État** : limite générale de l'API (60 requêtes par minute et par connexion) ; la page de retour interroge au plus toutes les 3 s.
- **Webhooks** : soumis à la limite générale par adresse (les prestataires réessaient après un 429) ; la vérification PayPal (appel sortant) est bornée à 4 simultanées ; signatures Stripe et NOWPayments vérifiées avant toute lecture de base.
- **Pass partagé publiquement** : la réserve de jetons s'épuise ; un abus constaté se révoque (`shhdrop admin paiement revoquer`).
- **Fraude à la carte** : Radar de Stripe (réglage du propriétaire) ; un litige révoque le pass.
- **Paiement crypto partiel ou en trop** : jamais crédité automatiquement ; le propriétaire voit la commande dans NOWPayments et règle à la main.

## 9. Conformité (le propriétaire est le vendeur)

### 9.1 TVA

- Services fournis par voie électronique à des particuliers : TVA du **pays du client** au-delà de 10 000 € HT de ventes par an vers les autres États membres (guichet unique **OSS**), TVA française en deçà (sauf option) ; **franchise en base** possible pour une micro-entreprise (« TVA non applicable, art. 293 B du CGI »). Le régime est **choisi explicitement** par le propriétaire : `SHH_TVA=franchise|france|oss` (aucune valeur par défaut : le paiement ne démarre pas sans elle).
- **Prix TTC identiques dans tous les pays** (7 € partout) ; le HT varie avec le taux. Calcul en centimes : HT = arrondi au plus proche de TTC × 10 000 / (10 000 + taux en points de base), TVA = TTC − HT.
- **Taux normaux de l'UE** (au 19 novembre 2026, **à vérifier par le comptable** dans la base TEDB de la Commission avant la première vente et à chaque changement) : AT 20, BE 21, BG 20, CY 19, CZ 21, DE 19, DK 25, EE 24, ES 21, FI 25,5, FR 20, GR 24, HR 25, HU 27, IE 23, IT 22, LT 21, LU 17, LV 21, MT 18, NL 21, PL 23, PT 23, RO 21, SE 25, SI 22, SK 23. Table unique : `server/internal/paiement/tva.go`.
- **Pays** : déclaré par la personne sur la page Offres (liste des 27 États membres), envoyé avec la commande, **jamais gardé par notre serveur** ; transmis au prestataire (`metadata[pays_declare]`, ventilation de TVA PayPal) qui le garde avec la transaction. **Preuves de localisation** (OSS, au-delà du seuil : deux éléments non contradictoires) : pays déclaré + pays de la carte (Stripe) ou du compte PayPal ; **en crypto il n'existe qu'un élément** (le pays déclaré) : signalement S3.
- **DP-9 (à valider)** : **ventes limitées aux 27 pays de l'UE au lancement**. Hors UE (Royaume-Uni, Suisse, Norvège, Canada…) beaucoup de pays exigent une immatriculation dès la première vente de services numériques : la page dit « Pas encore disponible dans votre pays ».
- Stripe : `SHH_STRIPE_TAXE=1` active Stripe Tax (calcul et déclaration préparée, commission en plus) ; sinon la facture Stripe porte le taux de notre table (réglage manuel du propriétaire dans Stripe).

### 9.2 Registre et conservation

- **Registre OSS** (règlement 282/2011, art. 63 quater) : conservé **10 ans** : pays, date, montant HT, taux, TVA, moyen de paiement. **Il vit chez les prestataires et dans la comptabilité du propriétaire** (exports mensuels des tableaux de bord Stripe, PayPal, NOWPayments), **jamais dans `paiements.db`**, qui ne garde ni montant ni pays.
- Pièces comptables : 10 ans (Code de commerce L123-22), même lieu.

### 9.3 Factures

- France, particulier : note obligatoire pour une prestation de services d'au moins 25 € TTC (annuels Plus et Pro), sinon sur demande. Mentions : numéro unique et continu, date, nom ou dénomination, adresse, SIREN et numéro de TVA intracommunautaire du vendeur (ou la mention de franchise), désignation (« Shhgone Plus, 365 jours »), prix unitaire HT, taux et montant de TVA (par pays en OSS), total TTC, date de la période.
- **Stripe** : facture créée par Stripe (`invoice_creation` pour un paiement unique ; automatique pour un abonnement), envoyée par Stripe à l'e-mail saisi chez Stripe, avec les mentions réglées par le propriétaire dans Stripe.
- **PayPal et crypto** : aucune facture automatique ; **le propriétaire l'émet** depuis son outil de facturation, à partir de l'export du prestataire (PayPal : reçu PayPal + facture du propriétaire ; crypto : sur demande, avec le numéro de commande). Signalement S4.
- Notre serveur **n'émet aucune facture** et ne garde aucune donnée de facturation.

### 9.4 Droit de la consommation

- Information précontractuelle et **CGV** (L111-1, L221-5) accessibles avant le paiement (lien depuis le récapitulatif) ; prix TTC, durée, renouvellement, résiliation.
- **Rétractation 14 jours** (L221-18) : accès immédiat demandé par une case **non cochée** et renonciation expresse (L221-28 13°, contenu numérique fourni immédiatement) ; sans case cochée, le bouton reste inactif (**DP-10, à valider avec le juriste** : alternative, accepter sans renonciation et rembourser au prorata sur demande). La renonciation et son heure sont transmises au prestataire (`metadata`), preuve gardée avec la transaction.
- **Abonnement** : information sur la reconduction, **résiliation en ligne en un clic** (« Arrêter le renouvellement », §5.6, conforme à la résiliation « en trois clics » de 2023), sans frais ; rappel avant échéance annuelle : **non fait par nous** (aucun e-mail) ; Stripe peut l'envoyer (réglage « e-mails de rappel » du propriétaire) ; signalement S5.
- **Médiateur de la consommation** (L612-1) : nom et adresse dans les CGV et les mentions légales.

### 9.5 RGPD

- Responsables de traitement : le propriétaire (commande, pass, comptabilité) ; Stripe, PayPal et NOWPayments pour leurs propres traitements (lutte contre la fraude, obligations bancaires) ; contrats de sous-traitance ou de coresponsabilité à accepter chez chacun.
- Page Confidentialité : ce que voit chaque prestataire (§3), transferts hors UE (Stripe et PayPal : États-Unis, cadre de protection des données UE–États-Unis ; NOWPayments : pays du siège, à vérifier), durées (§5.7, §9.2).
- Aucune donnée personnelle dans `paiements.db` (pas d'e-mail, de nom, de pays, d'IP) ; `Q` et l'identifiant de commande sont des pseudonymes (le prestataire peut les relier à une personne).
- Mentions légales d'un professionnel (LCEN art. 6) : obligatoires avant la première vente.

## 10. Configuration du serveur

Désactivé par défaut, comme `SHH_COMPTES` : sans `SHH_PAIEMENT=1`, aucune route `/api/paiement/*` (404 uniforme), aucun fichier lu, aucune base ouverte, aucun appel sortant. Toute variable posée est vérifiée même désactivé (erreur visible au démarrage).

| Variable | Rôle |
|---|---|
| `SHH_PAIEMENT` | `1` : active le paiement (exige `SHH_ORIGIN` pour les adresses de retour, `SHH_TVA` et au moins un prestataire complet) |
| `SHH_PAIEMENT_ESSAI` | `1` : bacs à sable (Stripe `sk_test_`/`rk_test_`, PayPal sandbox, NOWPayments sandbox) ; `0` (défaut) : production (`sk_live_`/`rk_live_`) ; une clé d'un autre mode → refus |
| `SHH_TVA` | `franchise`, `france` ou `oss` (§9.1) |
| `SHH_STRIPE_CLE_FILE`, `SHH_STRIPE_WEBHOOK_FILE` | fichiers secrets : clé secrète ou restreinte, secret de signature `whsec_…` ; les deux ou aucun |
| `SHH_STRIPE_TAXE` | `1` : Stripe Tax |
| `SHH_PAYPAL_CLIENT_ID` | identifiant d'application (public) |
| `SHH_PAYPAL_SECRET_FILE` | fichier secret du secret d'application |
| `SHH_PAYPAL_WEBHOOK_ID` | identifiant du webhook déclaré chez PayPal (public) |
| `SHH_PAYPAL_PLANS` | `plus-mois=P-…,plus-an=P-…,pro-mois=P-…,pro-an=P-…` (quatre plans exactement) |
| `SHH_NOWPAYMENTS_CLE_FILE`, `SHH_NOWPAYMENTS_IPN_FILE` | fichiers secrets : clé d'API, secret IPN ; les deux ou aucun |

Règles (refus de démarrer, message sans valeur secrète) : un prestataire **à moitié configuré** ; un fichier secret dans `SHH_DATA_DIR`, illisible, vide, de plus de 1 Kio, ou aux droits plus larges que 0600 ; une clé Stripe qui n'a pas le préfixe du mode ; un secret Stripe sans `whsec_` ; des plans PayPal incomplets ou en double ; `SHH_PAIEMENT=1` sans prestataire.

**Sortie réseau** (signalement S1, **bloquant pour la mise en ligne**) : le serveur Go n'a **aucune route vers Internet** (`compose.yaml`, réseau `internal`). Le paiement demande trois sorties HTTPS : `api.stripe.com`, `api-m.paypal.com` (ou bac à sable), `api.nowpayments.io`. Correction prévue (plan, tâche 10) : trois relais `shhcheck relais` (comme le relais SMTP), un par cible fixe `hôte:443`, sur 172.30.53.4 à .6, `extra_hosts` vers eux ; TLS de bout en bout vérifié par le serveur.

## 11. Droits et format, pour les apps et le salon

Liste fermée de droits, en texte, rendue par `/api/paiement/etat` et attachée à l'offre (donc à la clé d'émission des jetons) :

| Droit | Plus | Pro | Disponible |
|---|---|---|---|
| `partage_plus` (limites Plus : 10 Go, 3 j, 10 ouvertures) | oui | — | à la tâche P2 du plan principal |
| `partage_pro` (limites Pro : 30 Go, 7 j, 20 ouvertures) | — | oui | idem |
| `premiere_ouverture` (compte à rebours au premier déverrouillage) | oui | oui | §38.9.1, à coder |
| `salon_plus`, `salon_pro` (§38.8.1 : 3 j, 20 personnes, 5 Go ; 7 j, 50 personnes, 20 Go) | `salon_plus` | `salon_pro` | à coder |
| `appel_audio` | oui (**DP-14, à valider**) | oui | **non : bientôt** |
| `appel_video` | — | oui | **non : bientôt** |

- Un jeton dépensé à la création d'un salon fixe le niveau du salon (`tier`) ; les appels liront ce niveau, jamais un pass ni un compte (même règle que les fonctions de §38.9.0 point 3).
- **Appels : jamais vendus ni promis comme disponibles** tant qu'ils n'existent pas : sur la page Offres et les cartes des offres, une ligne « Appels audio et vidéo dans les salons · bientôt » (Pro) et « Appels audio · bientôt » (Plus), sans aucune incidence sur le prix ; les CGV disent que l'offre ne comprend pas les appels aujourd'hui. Spécification des appels à écrire avant tout code (salon v3 §8 : TURN relais seulement, SFrame, coût en bande passante).
- Version du format : champ `v: 1` dans la réponse d'état ; un droit inconnu est ignoré par un client ancien.

## 12. Chaîne d'approvisionnement

- **Aucun SDK de paiement** : ni `stripe-go`, ni SDK PayPal, ni bibliothèque NOWPayments. Raisons : surface d'attaque, mises à jour fréquentes, dépendances transitives ; quatre appels et trois vérifications de signature tiennent dans la bibliothèque standard. Le format des événements Stripe a été relu dans `stripe-go` v84.4.0 (module téléchargé depuis `proxy.golang.org`, non ajouté au dépôt) : signature `t`/`v1`, tolérance 300 s, champs `parent.subscription_details` de la version « clover ».
- **Privacy Pass** (tâches 6 et 7) : `github.com/cloudflare/circl` v1.6.5 (BSD-3-Clause, Cloudflare, déjà audité pour `blindrsa` par l'équipe de recherche de Cloudflare ; dépendances : `golang.org/x/sys`, `golang.org/x/crypto`) ; `blind-rsa-signatures` 0.19.0 (MIT, Frank Denis, dépend de `crypto-bigint`, `crypto-primes`, `digest`, `rand`, `sha2`…) : revue `cargo tree`, `cargo audit`, licences et taille du .wasm avant ajout. **Rien n'est ajouté aujourd'hui.**

## 13. Ce que le propriétaire doit fournir

**Avant tout essai (bac à sable)** :

1. Compte **Stripe** (mode test) : clé secrète `sk_test_…` (ou clé restreinte : écriture Checkout Sessions et Subscriptions, lecture du reste) ; endpoint de webhook `https://<domaine>/api/paiement/webhook/stripe`, **version d'API `2026-02-25.clover`**, événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created` ; son secret `whsec_…`.
2. Compte **PayPal Business** et application REST (sandbox) : `client_id` et secret ; webhook `https://<domaine>/api/paiement/webhook/paypal` avec les événements `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `PAYMENT.SALE.COMPLETED`, `PAYMENT.SALE.REFUNDED`, `PAYMENT.SALE.REVERSED`, `CUSTOMER.DISPUTE.CREATED` ; son identifiant ; **un produit et quatre plans** (Plus mensuel 7,00 EUR, Plus annuel 70,00 EUR, Pro mensuel 20,00 EUR, Pro annuel 200,00 EUR, prix TTC, sans période d'essai, sans frais d'installation, `payment_failure_threshold` 1) et leurs identifiants `P-…`.
3. Compte **NOWPayments** (sandbox) : clé d'API, secret IPN, adresse de versement (payout) pour chaque monnaie activée (XMR, BTC, ETH, USDT) ; adresse IPN `https://<domaine>/api/paiement/webhook/nowpayments`.
4. Les secrets **par le formulaire sécurisé ou en fichiers 0400** dans `/srv/shhdrop/secrets/` (jamais dans le chat, le dépôt ou `deploy/.env`).
5. Le domaine de production servi par le serveur (la démo GitHub Pages n'a pas de serveur).

**Avant la première vente réelle** :

6. Statut, SIREN, numéro de TVA intracommunautaire (sauf franchise), **choix du régime de TVA** (`SHH_TVA`), immatriculation OSS si `oss`.
7. Mentions légales d'un professionnel, **CGV**, médiateur de la consommation, texte exact de la renonciation, page Confidentialité complétée (§9.5).
8. Réglages chez Stripe : identité du vendeur et mentions sur les factures, Stripe Tax (ou non), Radar, e-mails de reçus et de rappel ; chez PayPal : nom de marque, e-mails ; chez NOWPayments : monnaies, conversion automatique en euros ou non (choix fiscal, à voir avec le comptable).
9. Comptable : tenue du registre OSS et des factures depuis les exports, traitement des paiements crypto (valeur en euros à la date de réception).
10. Clés de production (`sk_live_…`, application PayPal « Live », NOWPayments production), webhooks de production déclarés de même.
11. Validation des DP-1 à DP-14 et des signalements ci-dessous.

## 14. Décisions prises par défaut (à valider)

| # | Décision |
|---|---|
| DP-1 | Crypto : mensuel en paiement unique de 30 jours |
| DP-2 | Le prestataire reçoit un identifiant de commande aléatoire, jamais `Q` |
| DP-3 | Version d'API Stripe épinglée `2026-02-25.clover` (celle de `stripe-go` v84.4.0) ; le webhook est déclaré dans cette version |
| DP-4 | Prix Stripe « en ligne » (`price_data`), pas de prix créés dans le tableau de bord ; PayPal : plans créés par le propriétaire (obligatoires pour un abonnement) |
| DP-5 | Capture PayPal déclenchée par le webhook `CHECKOUT.ORDER.APPROVED` seulement |
| DP-6 | `Q` = SHA-256(« shhdrop/v2/pass » ‖ 0x00 ‖ `P`), calculée par le serveur ; l'appareil n'envoie que `P` |
| DP-7 | Pas de clé de secours du pass au lancement |
| DP-8 | Pass rangé dans le coffre **privé** du compte, pas dans le profil (séquestre) |
| DP-9 | Ventes limitées aux 27 pays de l'UE |
| DP-10 | Renonciation au droit de rétractation obligatoire pour payer |
| DP-11 | Remboursement partiel : aucun effet automatique |
| DP-12 | Rétention : commande non payée 2 jours ; commande payée jusqu'à la fin + 180 jours ; pass jusqu'à la fin + 31 jours |
| DP-13 | Retour unique `/offres/retour`, sans paramètre ; l'état vient du serveur |
| DP-14 | Appels audio dans Plus, audio et vidéo dans Pro, « bientôt » |

## 15. Signalements

| # | Gravité | Endroit | Problème | Correction |
|---|---|---|---|---|
| S1 | **Bloquante** | `deploy/compose.yaml` (réseau `internal`) | Le serveur n'a aucune sortie vers Internet : aucun appel à Stripe, PayPal ou NOWPayments ne peut aboutir en production | Trois relais à cible fixe (plan, tâche 10) ; à défaut, rien ne part et la commande échoue proprement (502) |
| S2 | **Bloquante** | `server/internal/share` | Le serveur ne connaît **aucune limite Plus/Pro** (paliers 10 et 30 Go, 7 jours, 20 ouvertures, première ouverture) : un pass payé ne donne **rien d'utilisable** aujourd'hui | Ne pas poser de clés de production avant les tâches P2 (limites payantes) et 6–7 (jetons) ; la page dit déjà ce qui est disponible |
| S3 | Élevée, légal | §9.1 | Crypto : une seule preuve de localisation (pays déclaré) ; au-delà du seuil OSS, deux preuves sont exigées | Rester sous le seuil, ou n'accepter la crypto qu'en `franchise`/`france`, ou demander une seconde preuve ; avis du comptable |
| S4 | Élevée, légal | §9.3 | PayPal et crypto n'émettent pas de facture ; note obligatoire dès 25 € TTC | Le propriétaire émet les factures depuis son outil (export mensuel) ; ou n'ouvrir l'annuel qu'à la carte |
| S5 | Moyenne, légal | §9.4 | Abonnements : rappel avant reconduction annuelle non fait par nous (aucun e-mail) | Activer le rappel de Stripe et PayPal ; avis du juriste |
| S6 | Moyenne, confidentialité | §3, §5.1 | Notre base relie commande ↔ `Q`, le prestataire commande ↔ identité : ensemble, ils disent qui a payé quel pass (pas quels partages) | Assumé ; dit sur la page Confidentialité ; purge §5.7 |
| S7 | Moyenne, exploitation | §6.3 | App Store et Google Play : vendre un service numérique hors de leur paiement peut faire refuser les apps | Aucun achat dans les apps, lecture du pass seulement |
| S8 | Faible, exactitude | spec §38.4 | « RSABSSA-SHA384-PSS-Randomized » contredit RFC 9578 (type 2 : Deterministic) | Corrigé en §7 |
| S9 | Moyenne, sécurité | §5.5 | Les jetons déjà émis survivent à une révocation | Lots de 5 au plus ; époque mensuelle ; dit dans les CGV |
| S10 | Moyenne, exploitation | §4.1 | Un remboursement d'une facture d'abonnement Stripe n'est pas toujours relié à sa commande (le PaymentIntent d'une facture ne porte pas nos métadonnées) | Révocation à la main par l'identifiant de commande ; plus tard, lire `invoice_payment.paid` |
| S11 | Moyenne, exploitation | §5.1 | `paiements.db` perdue = pass payés perdus | Sauvegarde quotidienne chiffrée avec `comptes.db` (plan, tâche 9) avant toute vente |
| S12 | Faible, exploitation | §8 | Webhooks soumis à 60 requêtes par minute par adresse : un pic de renouvellements peut être retardé | Assumé : les prestataires réessaient ; à revoir si des retards s'observent |
| S13 | Moyenne, exactitude | §38.8.2 | Pro annuel à 200 € : marge brute 57,7 %, sous la cible ; frais Stripe (≈ 1,5 % + 0,25 €) et PayPal (≈ 3,4 % + 0,35 €) différents de ceux d'un vendeur officiel, et la TVA à 27 % pèse sur le HT | Refaire le tableau de marge de §38.8.3 avec les vrais frais avant la première vente |
| S14 | Moyenne, légal | §1 | « Appels audio et vidéo · bientôt » affiché à côté d'un prix peut passer pour une promesse | Mention « non compris aujourd'hui » dans les CGV et sur la carte ; aucun effet sur le prix |
| S15 | Faible, confidentialité | §2 | La page Offres demande le pays de résidence | Nécessaire à la TVA ; jamais gardé par nous ; dit sous le champ |
