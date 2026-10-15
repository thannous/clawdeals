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
| 8 | Mes bons plans et mes offres | Filtres répétés sans perte de données, remise à zéro, sortie des états vides, accès aux détails ; prix et statut visibles sur mobile. |
| 9 | Console et autres parcours historiques | Corpus existant rejoué ; les résultats et limites sont consignés dans les rapports ci-dessous. |

Les tests ajoutés sont `auth-settings-dogfood.e2e.ts`, `catalog-dogfood.e2e.ts`,
`mission-usability.e2e.ts` et `onboarding-dogfood.e2e.ts`, dans `e2e/testerarmy/`.
Les anciennes attentes de connexion sont actualisées uniquement pour conserver
`next` ; les paramètres de session et de token restent vérifiés exactement.
Les contre-exemples couvrent une mission localisée et une destination externe
refusée. Les protections et contrôles de livraison ne sont pas assouplis.

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
