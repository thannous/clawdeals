# Dogfooding ClawDeals — 15 octobre 2026

Cette campagne utilise l’application locale, Node 24.19.0, Next.js 16.4.0,
TesterArmy e2e 0.18.0 et @e2e-dev/web 0.13.0. Les parcours affectés tournent
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

## Résultats et identité

Les campagnes finales ont exécuté le commit propre
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
