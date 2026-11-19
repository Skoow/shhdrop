# Salon v3, étape C-5 : effacement, codes de vérification, gestion, fin, signalement — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** la règle d'effacement réglable par tout participant (1 min, 5 min, 1 h après la lecture par tous ; 5 min par défaut) avec son compte à rebours honnête ; les codes de vérification de chacun, à comparer de vive voix ; pour le créateur : places, renouvellement (le groupe MLS est recréé, exigence C-3 22), destruction, exclusion avec nouvelle invitation ; pour tous : « Quitter et signaler », destruction si le salon le permet, écrans de fin ; retour du créateur avec ses droits par l'historique local.

**Architecture :** client (`salon/client.ts`) : `0x10` de renouvellement (purge, nouveau groupe), exclusion et rotation (exigence C-3 24), délogement (exigence 35) ; fil (`conversation.ts`) : messages `regle`, compte à rebours (`etatEffacement` du moteur), codes ; écrans : `Membres.svelte` (codes, exclure), `Gestion.svelte` (places, renouvellement, nouvelle invitation, destruction), `Salon.svelte` (fins, retour du créateur).

**Spec :** salon v3 §3.6.1 (exigences 9, 17, 22 à 36), §5, §9 point 4, §14.4, §14.7, §15 ; spec principale §39.5, §39.13 ; `2026-11-13-salon-places-duree-design.md`.

## Points à trancher (décisions prises par défaut, à valider par le propriétaire)

1. **Moyenne — règle courante d'un arrivant.** Un arrivant ne lit rien d'avant son entrée, donc pas le dernier message `regle`. **Retenu :** la règle courante est celle du dernier message `regle` lu, sinon celle du dernier message reçu, sinon 5 min (défaut de l'écran) ; chaque message garde la sienne (elle voyage avec lui).
2. **Moyenne — renouvellement et codes (§14.7, H2).** Le renouvellement `0x10` passe par un `Salon` neuf (exigence 22) : les codes des invités changent (nouvelle identité), celui du créateur non (clé de rôle). L'écran l'annonce (« Les codes de vérification ont changé avec le renouvellement ») et annule les vérifications. Le `0x10` n'est pas signé par le créateur (H2, non codé).
3. **Moyenne — vérification des codes.** Marquée sur l'appareil seulement (« J'ai comparé ce code »), en mémoire de la page ; annulée à chaque changement de code (exigences 9, 29). Pas de code de groupe (proposition non codée de §15).
4. **Élevée, manque — exclusion et rotation de l'invitation (exigence 24, §39.13).** Faites si le temps le permet dans cette étape ; sinon signalées comme reste, et le bouton « Exclure » n'est pas proposé (jamais un retrait MLS seul pour une exclusion hostile, C-P1).
5. **Faible — son et silencieux (§14.4).** Son de nouveau message synthétisé (Web Audio, balayage descendant, 150 ms), au plus toutes les 2 s, jamais si la conversation est visible et en bas ; « Mettre en silencieux » en mémoire de la page seulement (le réglage chiffré gardé jusqu'à la fin du salon demande une base locale de plus : non fait, signalé).
6. **Moyenne — retour du créateur (exigence 32).** Par l'historique local : l'entrée `salon_cree` garde le lien d'invitation et le lien de gestion ; « Ouvrir le salon » mène à `/salon#c…`, la page y retrouve le lien de gestion et entre au siège 0 avec `X-Shh-Manage`. Le lien de gestion collé seul (`#s`) demande aussi l'invitation : il est gardé en mémoire de la page jusqu'à l'ouverture du lien d'invitation.

## Tasks

### Task 1 : renouvellement du salon côté client (exigence 22)
- [ ] test de bout en bout : renouvellement par le créateur ; chaque membre purge, le groupe est recréé, les messages repartent.

### Task 2 : règle d'effacement et compte à rebours
- [ ] tests du fil : message `regle` (« Léa a réglé l'effacement… »), règle courante, état d'effacement (`etatEffacement`), « En attente de lecture ».

### Task 3 : codes de vérification
- [ ] test du fil : vérification annulée au changement de code.

### Task 4 : gestion, fin, signalement, retour du créateur
- [ ] Playwright : places, destruction par le créateur (écran de fin chez l'invité), « Quitter et signaler ».

### Task 5 : exclusion et nouvelle invitation (si fait)
- [ ] test de bout en bout : exclusion, retrait, rotation, refondation ; l'exclu ne lit plus rien ; l'ancienne invitation n'ouvre plus rien ; la nouvelle fait entrer.
