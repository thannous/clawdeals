# Dogfooding ClawDeals — 15 octobre 2026

La première campagne utilise l’application locale, Node 24.19.0, Next.js 16.4.0,
TesterArmy e2e 0.18.0 et @e2e-dev/web 0.13.0. Le rejeu demandé ensuite utilise
e2e **0.21.0**, avec le même moteur web compatible et le même navigateur installé.
Les résultats de chaque version sont distingués ci-dessous. Les parcours affectés tournent
à 1280×720 et 390×844. Les observations sont celles d’agents de QA, pas de
participants humains ni une mesure de satisfaction. Aucun déploiement.

## Parcours et corrections

| Étape | Parcours | Correction vérifiée par les régressions |
| --- | --- | --- |
| 1 | Accueil → catalogue → recherche/tri | Recliquer le tri actif conserve les résultats. Les contrôles exposent leur état sélectionné. |
| 2 | Annonce/recherche → mission | Budget contradictoire, exigences, saisie vide et expiration donnent une correction précise ; le champ reçoit le focus et une option repliée se rouvre. |
| 3 | Mission → connexion → brouillon → confirmation | Brouillon, langue, budget et destination sont conservés. La session propriétaire suffit pour enregistrer puis relire la mission. |
| 4 | Connexion et récupération | Entrée soumet le formulaire ; une adresse invalide est bloquée avant requête. Un lien expiré propose une récupération traduite plutôt qu’un formulaire inutilisable. |
| 5 | Réglages et profil | Retour localisé après connexion pour les six réglages ; profil réessayable après erreur, champs et préférences nommés pour les technologies d’assistance. |
| 6 | Agent API/MCP | Le mode choisi reste actif ; l’installation MCP n’est pas sautée par la résolution du propriétaire. Une vérification échouée est réessayable sans recréer de clé. |
| 7 | Appairage Telegram | FR/EN/ES, connexion avec retour au lien exact, validation unique et sortie vers les applications connectées. `/pair` est autorisé exactement dans la redirection sûre. |
| 8 | Mes bons plans et mes offres | Filtres répétés sans perte de données, remise à zéro, sortie des états vides, accès aux détails publics ; prix et statut visibles sur mobile. Une annonce réservée ou retirée n’affiche plus de lien public condamné à une 404. |
| 9 | Console et autres parcours historiques | Corpus existant rejoué ; les résultats et limites sont consignés dans les rapports ci-dessous. |
| 10 | Reprise et lien de connexion par email | Aucun envoi de mission sans stockage de reprise vérifié. Destination sûre conservée dans le lien ; indication explicite de retour à l’onglet d’origine si le brouillon n’est pas dans le nouvel onglet. |
| 11 | Résultats et quota des missions | Correspondances en description conservées ; contraintes non textuelles maintenues, ponctuation seule refusée. Les missions expirées ne consomment plus le quota actif. |
| 12 | Page introuvable → catalogue localisé | Rendu initial stable, sans erreur d’hydratation française ; lien de sortie conservé. |

Les tests ajoutés sont `auth-settings-dogfood.e2e.ts`, `catalog-dogfood.e2e.ts`,
`mission-usability.e2e.ts` et `onboarding-dogfood.e2e.ts`, dans `e2e/testerarmy/`.
Les anciennes attentes de connexion sont actualisées uniquement pour conserver
`next` ; les paramètres de session et de token restent vérifiés exactement.
Les contre-exemples couvrent une mission localisée et une destination externe
refusée. Les protections et contrôles de livraison ne sont pas assouplis.

## Rejeu avec TesterArmy e2e 0.21.0

Le runner est fixé à **0.21.0**, avec `@e2e-dev/web` **0.13.0**, Playwright
**1.63.0**, son Chromium déjà installé et Node **24.19.0**. Le pair déclaré du moteur web accepte cette
version ; aucun navigateur, fournisseur ou appel de modèle supplémentaire.
Les traces Markdown de 0.21 et les anciennes traces ZIP de 0.18 sont contrôlées
par l’index de preuves. Ses **20 tests de contrôle** passent.

| Campagne | Résultat | Source | Rapport local |
| --- | --- | --- | --- |
| Client desktop/mobile | **102/102**, 235,62 s | `48ab9e6beef9301bbbd79de3298b66af74c871a8` | `.e2e/validation/dogfood-021-client-48ab9e6/summary.md` |
| Missions avec Auth/Postgres réels | **4/4**, 55,86 s | `48ab9e6beef9301bbbd79de3298b66af74c871a8` | `.e2e/validation/dogfood-021-live-48ab9e6/summary.md` |
| Corpus historique complet après stabilisation | **181/181**, 252,84 s | `549cadd3e610c0a7dfbd55a1f991c387d17a80aa` | `.e2e/validation/dogfood-021-historical-549cadd/summary.md` |

Ces trois campagnes sont sorties à 0, avec des entrées stables. Les **102 pages
de trace et 68 médias** client ainsi que les **181 pages de trace** historiques
ont été contrôlés. Les quatre fixtures réelles
ont été nettoyées sans erreur, sans ligne propriétaire/agent/annonce restante
parmi leurs identités ; Redis reste simulé, les traces Auth désactivées.
`verify:pr` sur `48ab9e6` a réexécuté ses **12 contrôles**, tous réussis,
dont **817 tests unitaires**, avec un test ignoré, et le lint de tous les fichiers.
`verify:pr` sur `549cadd` est également réussi : quatre contrôles exécutés,
huit réutilisés. Les 102 cas client et les quatre missions restent les exécutions
fraîches de `48ab9e6`, réutilisées après la seule correction des deux tests de
mesure de l’accueil. Le reçu `.e2e/dogfood-20261015/qualified-source-021.json`
consigne cette portée et les mises à jour de skills préservées hors livraison.
La PR indique la vérification du dernier commit documentaire livré.

Le premier corpus historique sous 0.21 conserve son résultat **180/181**,
294,79 s, entrées stables, dans
`.e2e/validation/dogfood-021-historical-48ab9e6/summary.md`.
Son seul échec comptait les mots avant la levée du masquage initial de Next dev :
`body.innerText` lisait alors les données sérialisées, soit **1 531 mots**,
contre **441** après affichage, encore stables une et trois secondes plus tard.
Les deux versions du test attendent désormais le corps, le hero et les polices
avant de mesurer. Les limites restent **450 mots, six sections et six écrans**.
Le contre-exemple de 20 mots visibles ajoutés porte bien le compte à **461** ;
la hauteur mobile rendue mesure **5,68 écrans**. Ce correctif de test ne modifie
pas l’application. Diagnostic : `.e2e/dogfood-20261015/landing-021-fouc-diagnostic.json`.
Le pilote initial de dix cas sous Node 26 reste un diagnostic de compatibilité,
pas une qualification sur le runtime du dépôt.

## Qualification précédente sous e2e 0.18 après les corrections de revue

Le commit applicatif `12f7c626658974556afa11c93656d37e4a7c9291` a été qualifié
sur l’application locale à `http://localhost:4327` :

| Vérification | Résultat | Rapport local conservé |
| --- | --- | --- |
| Campagne desktop/mobile complète | **102/102**, 211,27 s | `.e2e/validation/dogfood-qualified-12f7c62/summary.md` |
| Missions avec Auth/Postgres réels | **4/4**, 86,81 s | `.e2e/validation/dogfood-live-12f7c62/summary.md` |
| Authentification historique affectée | **3/3**, 34,50 s | `.e2e/validation/dogfood-historical-auth-12f7c62/summary.md` |
| Contrats PR | **Réussis**, 6 contrôles exécutés et 6 réutilisés | Arbre `39f3822c8a15c9cc3fcbbb9d301ddc41b9037131` |

Les trois wrappers sont sortis à 0 avec des entrées stables. Les sources
applicatives correspondent au commit ; des mises à jour de skills sans rapport
sont présentes dans le checkout, hors de cette livraison. Le périmètre exact est
consigné dans `.e2e/dogfood-20261015/qualified-source.json`. Le vérificateur PR
utilise sa copie isolée du commit. Il a exécuté **219 fichiers de tests unitaires,
817 réussis et 1 ignoré**, ainsi que lint, types, traductions et SDK.

Le scénario réel d’annonce exige désormais un terme présent uniquement dans sa
description. Les quatre fixtures ont été nettoyées sans erreur et sans ligne
propriétaire/agent/annonce restante parmi les identités créées par les tests.
Le filtre du quota a également été accepté par le vrai backend lors d’un comptage
en lecture seule sur un identifiant synthétique inexistant. Cette requête valide
la syntaxe PostgREST ; la frontière 49/50, l’expiration et la réactivation sont
couvertes séparément par les tests de service à transport simulé.

Les 178 cas historiques hors authentification restent une réutilisation du
premier passage décrit ci-dessous, pas un nouveau corpus intégral. Les textes
résiduels de la vérification de connexion ont ensuite été traduits en FR/EN/ES,
sans changer le parcours ; les preuves applicatives ci-dessus restent identifiées
à leur commit d’exécution. La PR indique la vérification du dernier commit livré.

## Premier passage et historique conservé

Le premier passage a exécuté le commit propre
`e0a868f81dc3bdb1518ed925b29a4406191d2923`, sur l’application locale à
`http://localhost:4327`. Les trois reçus finaux ci-dessous indiquent un code de
sortie 0, des entrées stables et aucune erreur du journal du runner.

| Vérification | Résultat | Rapport local conservé |
| --- | --- | --- |
| Parcours client desktop/mobile | 82/82, 135,52 s | `.e2e/validation/dogfood-final-e0a868f/summary.md` |
| Missions avec Auth/Postgres réels | 4/4, 58,18 s | `.e2e/validation/dogfood-live-e0a868f/summary.md` |
| Rejeu authentification historique | 3/3, 5,12 s | `.e2e/validation/dogfood-historical-auth-e0a868f/summary.md` |
| Contrats PR | `npm run verify:pr` réussi ; 5 contrôles exécutés, 7 réutilisés | Preuve locale pour l’arbre `1f6e9d6268baf978239621d5fd825e5f0a713133` |

Le vérificateur a notamment exécuté les tests unitaires : 217 fichiers,
787 tests réussis et 1 ignoré. Il a aussi vérifié TypeScript, les traductions,
le lint des fichiers concernés et les SDK. Ce résultat est local, pas un statut CI.
Les quatre fixtures réelles ont été nettoyées sans erreur, avec zéro ligne
propriétaire/agent/annonce restante parmi les identités créées par la campagne.

Le corpus historique initial conserve son résultat **179/181**, en 312,70 s,
dans `.e2e/validation/dogfood-historical-20261015/summary.md`. Les deux échecs
étaient des attentes de liens qui omettaient désormais `next`. Après correction
de ces attentes, les trois cas d’authentification ont été rejoués avec succès.
Les **178 autres cas réussis sont réutilisés** : aucune de leurs entrées
sélectionnées n’a changé. Le premier reçu reste `inputStable:false`, car trois
fichiers de tests ont changé pendant l’exécution, dont deux hors sélection.
Ce n’est donc pas une exécution fraîche intégrale des 181 cas sur le commit final.

Ces 26 familles historiques incluent les annonces et bons plans, les identités,
la connexion d’appareil, les réglages, WebMCP et la console (approbations, audit,
annonces, messages et contrôle d’accès). Un rapport illustré privé est conservé
dans `.e2e/dogfood-20261015/rapport.md`. Les ajouts documentaires qui suivent
réutilisent ces preuves applicatives ; ils ne sont pas présentés comme un rejeu.

## Relancer

Démarrer l’application locale selon [le guide TesterArmy](testerarmy-e2e.md),
avec les origines publiques de l’application pointant vers le serveur local.
Le port utilisé est 4327. Un `PARITY_OUTPUT` doit être neuf à chaque invocation.

```sh
E2E_BASE_URL=http://localhost:4327 \
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
PARITY_OUTPUT=.e2e/validation/dogfood-new-run \
mise exec node@24.19.0 -- npm run test:testerarmy

E2E_BASE_URL=http://localhost:4327 \
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
TESTERARMY_REDIS_FIXTURE=local-mock \
PARITY_OUTPUT=.e2e/validation/dogfood-live-new-run \
mise exec node@24.19.0 -- npm run test:mission

E2E_BASE_URL=http://localhost:4327 \
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
PARITY_OUTPUT=.e2e/validation/dogfood-historical-new-run \
mise exec node@24.19.0 -- node e2e/testerarmy/run-historical.mjs run

mise exec node@24.19.0 java@temurin-17.0.20+101 python@3.11.17 -- npm run verify:pr
```

Le parcours réel utilise Auth et Postgres du projet ClawDeals jetable autorisé,
et la fixture Redis locale du dépôt sur 4413. Ses comptes/listings/missions sont
uniques, créés sans email et nettoyés en fin de tentative. Les secrets, traces
d’authentification et données privées ne sont pas publiés.

## Portée des preuves

Les campagnes client/historiques utilisent des réponses API synthétiques pour
les états déterministes ; elles prouvent l’interface, pas la persistance des
opérations simulées. Seule la campagne `test:mission` qualifie la connexion et
la création/relecture réelles, y compris l’idempotence et le nettoyage.

Aucun achat réel, message à un vendeur, email, installation MCP tierce, OAuth ou
appairage Telegram réel n’a été déclenché. Redis déployé, livraison de notifications,
paiements, cycle complet de négociation et interface de production restent hors
preuve. Les états anonymes des réglages ne prouvent pas toutes leurs écritures.
Le corpus historique ne couvre pas chaque écran d’administration ; cette campagne
ne démontre pas l’absence de toute friction possible ni la conformité complète
aux normes d’accessibilité.
