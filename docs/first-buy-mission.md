# Première mission d’achat

Contrat de travail et prochaines priorités — 2026-10-11. Les critères ci-dessous
décrivent le résultat attendu ; seule la section « Preuves » établit ce qui a été
vérifié et livré. Les propositions de pilote ne sont pas des résultats d’usage.

## Parcours prioritaire

| Étape | Résultat attendu |
| --- | --- |
| Partir d’une annonce ou d’une recherche | Retrouver l’objet recherché dans le formulaire de mission, avec une source identifiable quand il s’agit d’une annonce. |
| Se connecter | Reprendre le brouillon après la connexion, sans perdre l’objet, le budget ni la zone déjà saisis. |
| Définir les limites | Comprendre le plafond, la devise, le pays et la zone ; corriger une valeur invalide avant la création. Les détails techniques restent secondaires. |
| Créer la mission | Utiliser l’identité authentifiée, confirmer les limites et recevoir une confirmation seulement après l’écriture réussie. Un refus explique la prochaine action. |
| Retrouver la mission | Recharger ou revenir et retrouver les mêmes critères et le statut enregistré. La mission indique ce que le service fait et ce que l’utilisateur peut faire ensuite. |
| Consulter les résultats | Voir des annonces compatibles avec les limites ou un état vide explicite permettant d’ajuster la recherche. Une panne ne doit pas être présentée comme une absence de résultats. |

Créer une mission ne signifie pas qu’un vendeur a été contacté, qu’une offre a été
envoyée ou qu’un achat est conclu. Ces actions gardent leurs autorisations et
confirmations propres. Le [runner Cerebras](./cerebras-buyer-workflow.md) prépare
une proposition locale distincte ; il ne remplace pas la persistance de ce parcours.

### Passage de l’annonce à la mission

Le prix préféré et le plafond sont initialisés au prix exact de l’annonce. L’ancien
ajout automatique de 10 % est supprimé : une marge supplémentaire résulte d’une
modification explicite du plafond. La devise reste visible avec les limites.
La durée, les actions autorisées et les coordonnées détaillées sont accessibles
dans des sections repliées ; une zone personnalisée peut toujours être modifiée.

Le brouillon est conservé dans le même onglet pendant 24 heures, y compris les
exigences et les actions choisies. L’écran de connexion indique la reprise de la
mission et permet de revenir au brouillon avant de se connecter. Ses contrôles
sont traduits en français, anglais et espagnol. Après la connexion, la création
attend toujours la confirmation du récapitulatif. Cette conservation ne promet
pas une synchronisation entre appareils ou des onglets ouverts indépendamment.

Le [dogfooding du 2026-10-15](dogfooding-2026-10-15.md) ajoute les garanties
suivantes : la requête et sa clé de reprise doivent être écrites puis relues dans
le stockage de l’onglet avant tout envoi, même après connexion. En cas d’échec,
le formulaire explique comment rétablir le stockage et aucun POST n’est envoyé.
La confirmation revérifie le compte actif avant l’envoi : un changement dans un
autre onglet bloque la création et conserve la tentative pour le compte initial.
Le POST transmet aussi `X-Expected-Owner-Id`, issu du compte qui a confirmé le
brief. Le serveur le compare à l’identité authentifiée de cette même requête
avant toute création : une bascule de cookie après la sonde est refusée avec
`403 OWNER_SESSION_CHANGED`. Cet identifiant n’est pas un moyen d’authentification.
Le corps et la clé d’une tentative au résultat inconnu restent inchangés au
retour sur le compte initial. Les appels GET et l’API agent restent inchangés.
Une réponse `201` contenant seulement un identifiant ne suffit pas à confirmer
la création : les critères, la zone, le budget et les permissions doivent être
valides avant d’effacer le brouillon et la reprise. Un succès incomplet ou
corrompu garde donc la même clé et le même corps après rechargement.
Le lien de connexion par email conserve une destination locale validée. Si sa
vérification est ouverte dans un autre onglet sans le brouillon, elle propose
explicitement de revenir à l’onglet d’origine ; elle ne prétend pas transférer
les modifications du brouillon.

Les régressions navigateur de ces deux garanties sont dans
`e2e/testerarmy/mission-create-contract.e2e.ts` (API interceptée, aucune écriture
externe). Le test HTTP `src/__tests__/pages-api/v1/owner/missions.test.ts`
complète cette preuve : le navigateur simulé ne peut pas prouver que le vrai
handler refuse la bascule de compte avant d’appeler le service de création.
Les appels directs des fixtures réelles conservent eux aussi le propriétaire
attendu avec leur clé ; le parcours réel reste qualifié séparément.

Les missions expirées restent consultables mais ne consomment plus de place
dans le quota actif. La recherche de résultats conserve les correspondances
trouvées dans la description par le catalogue, tout en appliquant encore les
contraintes de pays, devise, prix, distance, catégorie et livraison. Une requête
composée uniquement de ponctuation ne devient pas une recherche sans filtre.

Si le compte possède plusieurs agents, la création utilise les agents non
suspendus dans un ordre stable. Quand le premier atteint ses 50 recherches
actives, elle essaie le suivant avec les mêmes critères et permissions. Seul
le refus `409 WATCHLIST_LIMIT_REACHED`, émis avant insertion, autorise ce passage
au suivant ; toute autre erreur arrête la demande. Aucun agent supplémentaire
n’est créé pour contourner le quota. La création d’un premier agent reste
réservée aux comptes sans agent, sous leur limite existante. Les lectures
continuent d’agréger les missions de tous les agents possédés.

Cette frontière multi-agent est couverte par `owner-buy-missions.test.ts`,
`owner-agent-selection.test.ts` et `watchlist-quota.test.ts` : un agent plein
suivi d’un agent libre, tous pleins, suspension, première mission et erreurs
sans repli. Les deux derniers utilisent le constructeur de requêtes Supabase
réel avec un transport PostgREST contrôlé ; ils ne constituent pas une nouvelle
preuve de persistance sur le backend réel ni un rejeu navigateur.

Avant de publier son annonce LIVE, le fixture `mission-live` vérifie les
watchlists actives non supprimées du même marché, avec le matcher utilisé par
la file de notifications. Une correspondance hors du fixture, une erreur de
lecture ou un scan incomplet bloque l’insertion. Le scan est borné à 100 pages
de 500 lignes ; le compte exact détecte aussi une limite serveur plus basse.
Les critères tiers ne sont ni modifiés ni enregistrés dans les preuves.
Cette vérification décrit un instantané, pas un verrou contre des modifications
concurrentes. Le reçu ne conserve que l’identifiant fictif, le nombre de lignes
vérifiées et la complétude. Le nettoyage inclut l’entrée de file portant
exactement le type `listing` et l’identifiant de l’annonce du fixture.

`src/__tests__/e2e/mission-fixture-notifications.test.ts` exécute le fixture et
le constructeur HTTP Supabase réels sur un transport simulé : correspondance
en première ou seconde page, mode `in_app`, critères nuls, erreurs, pagination
incomplète et nettoyage borné. Ces cas ne doivent pas publier une annonce à
risque sur le backend réel pour démontrer le refus.

Validation complémentaire du 2026-10-11 sur la branche `codex/first-buy-mission` :

- `.e2e/validation/listing-mission-draft-verified-20261011/report.json` : **6/6**,
  bureau/mobile, prix sans marge implicite, options repliées, retour depuis
  l’inscription, critères conservés puis rechargement. Auth anonyme simulée pour
  ce scénario de retour sans connexion.
- `.e2e/validation/listing-mission-live-20261011/report.json` : **4/4**, connexion
  réelle, écriture et relecture EUR/GBP ; Redis local simulé, Auth/Postgres réels.
  Les quatre fixtures signalent zéro erreur de nettoyage et zéro ligne restante.
- `.e2e/validation/listing-mission-client-20261011/report.json` : les **14 cas**
  WebMCP et reprise après erreur passent. Le même rapport garde deux échecs du
  nouveau test de brouillon dus au sélecteur de titre ; ce scénario a ensuite été
  corrigé et rejoué dans le rapport 6/6 ci-dessus. Ces 14 résultats sont réutilisés,
  pas présentés comme une nouvelle exécution.

Ces exécutions portent sur les modifications locales au-dessus de `7671b335`.
Les commandes, versions et empreintes sont dans chaque `command.json` associé.
Les résultats qualifient l’app locale, pas un déploiement en production.

Relance des contrôles de cette évolution avec l’app locale et les prérequis du
guide E2E ci-dessous (chaque dossier de sortie doit être nouveau) :

```bash
TESTERARMY_AI=0 E2E_BASE_URL=http://localhost:4327 \
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
PARITY_OUTPUT=.e2e/validation/listing-mission-draft-UNIQUE \
  npm run test:testerarmy -- e2e/testerarmy/mission-draft.e2e.ts

E2E_BASE_URL=http://localhost:4327 TESTERARMY_REDIS_FIXTURE=local-mock \
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
PARITY_OUTPUT=.e2e/validation/listing-mission-live-UNIQUE \
  npm run test:mission
```

## Vérification et livraison

Utiliser le parcours TesterArmy et ses prérequis dans
[le guide E2E](./testerarmy-e2e.md). L’[environnement de test](./release-environments.md)
doit être identifié : un serveur local peut utiliser la base ClawDeals de données
fictives autorisées. Les fixtures ne doivent contacter personne ni déclencher de
paiement. Garder une preuve représentative, les identifiants de source/build, le
résultat, la commande exacte et la trace utile en cas d’échec.

La [livraison](./release-staging-to-prod.md) passe par un commit sur branche,
`npm run verify:pr` réussi avant le push et une PR indiquant le SHA vérifié et le
résultat. Le CTO relit et merge après résolution des commentaires. La publication
exige ensuite `npm run verify:release` réussi sur le SHA exact fusionné dans
`main`, puis le go de thanh. Les déploiements Git automatiques sont désactivés.
Vérifier enfin le déploiement Vercel et le comportement affecté. Les preuves
locales, la revue, la CI manuelle éventuelle et le produit déployé restent distincts.

Dans le périmètre actuel, l’agent prépare les changements, les vérifie, pousse la
branche après `verify:pr` et ouvre la PR avec ses preuves. La fusion revient au
CTO ; la mise en production attend un go explicite de thanh. L’ancienne mention
de push direct avec déploiement automatique ne décrit plus la configuration
actuelle. Les tests sur données fictives n’autorisent pas à sauter ces étapes.

## Preuves

État constaté le 2026-10-11. Les campagnes navigateur ci-dessous ont démarré sur
le commit `dd9e76eee1ba37578f785513bbd32e578549d72b`, avec Node 24.19.0,
Next.js 16.4.0, `e2e` 0.18.0 et `@e2e-dev/web` 0.13.0. Leurs wrappers terminent
avec le code 0 et des entrées inchangées. Seul ce document était modifié au
démarrage ; les reçus portent donc `dirty: true`. Elles qualifient le code de ce
commit, pas les corrections ultérieures ni un déploiement.

| Périmètre exécuté | Résultat et limite | Référence locale |
| --- | --- | --- |
| Première mission authentifiée | **4/4 réussis**, bureau et mobile : recherche française sans résultat et annonce britannique avec résultat, connexion réelle, brouillon conservé, budget décimal EUR/GBP, écriture/relecture et retour après rechargement. | `.e2e/validation/first-mission-dd9e76e-20261011/report.json` |
| Régressions navigateur | **16/16 réussis** : WebMCP 8, brouillon 4, réponse perdue/reprise idempotente 2 et statut serveur en pause 2. Les réponses simulées du test de récupération prouvent ce cas réseau ; la persistance réelle est qualifiée séparément par les quatre cas précédents. | `.e2e/validation/mission-client-dd9e76e-20261011/report.json` |
| Filtres et contrôles backend après `7adc10d` | **31/31 réussis dans 4 fichiers**, sur le checkout modifié : création/validation/résultats propriétaire, catégorie/livraison, matcher, matching/outbox et backfill. ESLint ciblé et diff check réussis. Ce résultat n’est pas un nouveau parcours navigateur. | Sortie d’exécution du 2026-10-11 à 05:03:34 locale ; commande ci-dessous, aucun rapport persistant dédié. |
| Cerebras CLI, preuve antérieure réutilisée | **10/10 réussis** avec processus CLI et services HTTP simulés. Les deux sources correspondent toujours aux empreintes du rapport ; aucun nouvel appel Cerebras ni offre réelle. | `test-results/first-buy-mission/cerebras-cli-check.json` |
| Retour Magic link | Défaut reproduit avant correction, puis **18/18 tests ciblés réussis** ; ces tests composants font aussi partie du contrôle unitaire complet ci-dessous. Aucun email envoyé, retour dans le même onglet. | `test-results/first-buy-mission/magic-link-return-check.json` pour la reproduction et première correction |
| Validation obligatoire du commit `dd9e76e` | `verify:pr` réussi : **12 contrôles exécutés**, dont typage, lint, traductions, OpenAPI et SDK TypeScript/Python. **217 fichiers / 786 tests unitaires réussis, 1 ignoré**. Le moteur de vérification passe **70 tests, 7 ignorés spécifiques à la plateforme**. | `.git/verify-proofs/8a7175a17d2a2436478e8ac8293601aaece8e3b9.json` |
| Reprise après refus de quota, correction postérieure à `dd9e76e` | Défaut reproduit rouge, puis **6/6 cas navigateur réussis** : réponse de création perdue, refus de quota direct et refus retrouvé après perte de réponse, sur les deux tailles d’écran. Un refus confirmé libère l’édition et crée une nouvelle clé ; un résultat inconnu conserve la clé et les limites. | `.e2e/validation/mission-recovery-quota-fixed-20261011/report.json` et `source-scope.json` ; reproduction : `mission-quota-before-20261011` |

La campagne authentifiée utilise l’app locale `http://localhost:4327`, Auth et
Postgres réels du projet ClawDeals autorisé `gztfmpuqtpvncdcuhqxy`, avec le Redis
REST simulé local sur le port 4413. Elle ne qualifie ni Redis déployé, ni sa
durabilité, ni l’interface de production. Les quatre reçus `mission-fixtures/`
signalent zéro erreur de nettoyage et zéro ligne owner/agent/listing restante
parmi les données créées par chaque cas. Aucun email, message vendeur, paiement
ou appel de modèle n’a été nécessaire. Les preuves Auth restent privées, sans
trace réseau ni credentials enregistrés ; ne pas les publier dans un bundle public.

Les dossiers de campagne contiennent aussi `command.json` (sélection exacte et
source) et `completion.json`. Prérequis, cible et commandes navigateur :
[guide de relance](./testerarmy-e2e.md#verify-the-real-first-purchase-mission).
Commande exacte du contrôle backend de 31 cas :

```bash
npx vitest run --project node \
  src/server/services/owner-buy-missions.test.ts \
  src/server/utils/matching.test.ts \
  src/server/services/watchlist-matching.test.ts \
  src/server/services/watchlist-backfill-queue.test.ts
```

Le premier `verify:pr` a révélé trois assertions de chemins non portables sur
macOS. La correction canonicalise la racine temporaire des fixtures ; le moteur,
son empreinte et ses protections restent inchangés. Le contrôle complet ci-dessus
inclut ces assertions. Le bloc « Local proof » de la PR identifie le commit final
et distingue les contrôles exécutés de ceux réutilisés avec entrées inchangées.

La correction du refus de quota a été testée sur `dd9e76e` avec les modifications
locales identifiées dans `source-scope.json` (formulaire, messages et test).
Les cinq empreintes restent stables pendant les six cas. Les quatre parcours
authentifiés et les parties client inchangées sont réutilisés avec ce périmètre ;
ce n’est pas une nouvelle exécution globale des 20 cas de la sélection client.

La CI distante n’a pas été déclenchée pour ce lot. La fusion, `verify:release`
sur le SHA fusionné, le go de thanh et la publication/vérification du déploiement
restent à constater. Aucun de ces états n’est déduit des résultats locaux.

## Backlog après le parcours vérifié

Ordre proposé ; ces sujets nécessitent leur propre implémentation et validation.

| Priorité | Résultat recherché | Critère de décision |
| --- | --- | --- |
| 1 — Pertinence locale et multilingue | Retrouver une annonce adaptée malgré une requête FR/EN/ES, en respectant pays, devise, budget et rayon. Expliquer tout élargissement proposé. | Petit jeu de requêtes annotées avec résultats attendus et contre-exemples hors zone/hors budget ; comparer avant/après. Un repli sans texte n’est pas une preuve de pertinence. |
| 2 — Alertes utiles | Prévenir d’une nouvelle annonce adaptée, éviter les répétitions et rendre fréquence, canal et arrêt compréhensibles. | Scénarios d’apparition/disparition/doublon, préférences conservées et envoi vers une destination de test autorisée seulement. |
| 3 — Suivi lisible | Distinguer recherche active, résultat disponible, action attendue, échec et mission arrêtée ; montrer la dernière action vérifiée. | L’utilisateur peut comprendre l’état et choisir l’étape suivante sans lire des codes techniques ; aucun contact ni achat annoncé sans preuve. |

## Protocole de pilote proposé

- **Périmètre initial :** France, Paris et rayon de 25 km, vélos électriques
  d’occasion. C’est une hypothèse cohérente avec la mission de démonstration
  Cerebras, pas une validation de la demande ou de la densité réelle d’annonces.
- **Avant recrutement :** vérifier la disponibilité d’un catalogue approprié,
  terminer les preuves ci-dessus et revoir la politique de données fictives avant
  l’arrivée de données ou d’utilisateurs réels. Toute prise de contact ou dépense
  demande son autorisation ; aucun participant n’est contacté par ce document.
- **Format proposé :** cinq participants volontaires, une première session
  observée puis un retour volontaire après sept jours. Chaque personne réalise
  une mission à partir d’une annonce ou d’une recherche, retrouve sa mission et
  explique ce qu’elle attend ensuite. Aucune transaction réelle n’est nécessaire.
- **Mesures :** achèvement sans aide et point d’abandon ; temps jusqu’à la mission
  enregistrée puis au premier résultat jugé utile ; pertinence expliquée par la
  personne ; compréhension de l’état ; retour et raison du retour/non-retour.
  Rapporter les comptes exacts et les cas individuels, sans extrapoler un marché
  à partir de cinq personnes. Une mission créée n’est pas un achat réussi.
- **Décision :** corriger d’abord tout blocage de création/reprise ou toute
  confusion sur une action de l’agent ; si le catalogue manque, ajuster le
  périmètre avant de juger les alertes. Étendre seulement après des résultats
  utiles et un suivi compréhensible observés, avec limites et désaccords consignés.
- **Compte rendu :** observations anonymisées et synthèse des décisions ; garder
  les identités, coordonnées, enregistrements et retours privés hors des exports
  publics et du dépôt. Aucun résultat de ce pilote n’a été recueilli ici.

