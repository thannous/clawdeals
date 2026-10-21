# Pilote local : abonnement ChatGPT

Essai sur ce Mac du protocole public Sign in with ChatGPT. Le client Node
indépendant ne contient pas de code du DevKit OpenAI. Sa seule dépendance est
`jose`, pour vérifier la signature et les claims du jeton d'identité.

Ce pilote vérifie l'accès du compte choisi ; il ne prouve pas l'autorisation
de proposer cette fonction dans le service commercial hébergé ClawDeals.

## Tester dans ClawDeals

Depuis la racine du dépôt :

```sh
mise exec node@24.22.1 -- npm --prefix scripts/agents/chatgpt-local ci --ignore-scripts
mise exec node@24.22.1 -- npm run dev:chatgpt
```

Ouvrir <http://127.0.0.1:4327/fr/browse>, choisir une annonce, puis
**Demander à mon agent**. Vérifier les critères, se connecter à ClawDeals et
confirmer la mission. Dans son détail, **Continuer avec ChatGPT** ouvre le
consentement OpenAI, puis ramène à cette mission. Un profil déjà autorisé par
le pilote est réutilisé après ce clic explicite. Choisir un modèle puis
**Comparer les annonces**. Le résultat porte sur les cinq premières annonces
correspondant aux critères, au budget et à la zone de cette mission. Sans
annonce, aucune requête IA n'est lancée.

La commande démarre Next.js sur `127.0.0.1:4327` et le connecteur sur
`127.0.0.1:4318`, avec `/auth/callback` réservé à OpenAI sur ce dernier.
`CLAWDEALS_APP_LOCAL_PORT` et `CLAWDEALS_CHATGPT_LOCAL_PORT` changent ces ports.
La connexion ClawDeals conserve son parcours habituel. Auth et base utilisent
`.env.local` ; si Redis y pointe sur le simulateur local, la commande le
démarre aussi et l'indique. Le simulateur ne prouve pas la durabilité Redis.

Le profil ChatGPT est associé à un seul propriétaire ClawDeals sur ce Mac.
L'API locale exige sa session propriétaire réelle, l'identité attendue et
l'origine de l'application pour les écritures, avec les protections habituelles
d'idempotence et de débit. La clé privée entre Next.js et le connecteur ne
quitte pas le serveur ; les jetons OAuth ne sont jamais renvoyés au navigateur.
Le panneau et l'API nécessitent les indicateurs activés par cette commande ;
l'API refuse un runtime de production ou Vercel. **Déconnecter ChatGPT** révoque
le jeton de renouvellement OpenAI, puis efface les identifiants locaux.

## Pilote autonome

Depuis la racine du dépôt, avec les versions Node/npm du projet :

```sh
mise exec node@24.22.1 -- npm --prefix scripts/agents/chatgpt-local ci --ignore-scripts
mise exec node@24.22.1 -- npm --prefix scripts/agents/chatgpt-local start
```

Ouvrir <http://127.0.0.1:4318>, sélectionner **Continue with ChatGPT**, puis
terminer la vérification du compte et le consentement chez OpenAI. Une nouvelle
tentative depuis la page locale est nécessaire si l'autorisation dure plus de
dix minutes. Le compte ChatGPT existant suffit : aucun e-mail ClawDeals nouveau
n'est nécessaire.

Après la connexion, lancer **Comparer les annonces avec mon abonnement ChatGPT**.
Le pilote découvre les modèles autorisés pour ce compte et prend le premier
modèle visible dans l'ordre d'OpenAI. `CLAWDEALS_CHATGPT_MODEL` permet de choisir
un slug présent dans cette liste. `CLAWDEALS_CHATGPT_LOCAL_PORT` change le port.

Une comparaison effectue une requête au modèle sur cinq annonces publiques au
maximum, lues depuis l'API déployée `app.clawdeals.com`. Le client s'exécute
localement ; l'authentification et l'inférence s'exécutent chez OpenAI. Le pilote
ne contient aucune commande d'envoi d'offre, de message ou d'achat. Les requêtes
IA utilisent le quota du forfait autorisé, sans clé API et sans repli vers une
facturation API.

## Résultats et identifiants

- `test-results/chatgpt-local/report.json` : état, modèle, nombre d'annonces,
  erreur éventuelle, identifiant de requête et résultat. Seul un événement
  `response.completed` avec du texte non vide produit l'état `passed`.
- `test-results/chatgpt-local/verification.json` : identité du code testé,
  commande de relance, vérifications et incidents observés pendant la qualification.
- `test-results/chatgpt-local/private/` : identifiant stable du poste,
  inscription OAuth et jetons. Répertoire privé `0700`, fichiers `0600`,
  ignorés par Git. Ne pas partager ce dossier.

Le pilote réutilise les identifiants après un redémarrage et renouvelle les
jetons expirés en sérialisant les demandes et en conservant les jetons tournants.
Un accès révoqué nécessite une nouvelle connexion. Une inscription reste liée
à son compte initial ; ce prototype ne
propose pas de changement de compte. Pour révoquer l'accès, utiliser les réglages
ChatGPT → Sécurité et connexion → Se connecter avec ChatGPT. Arrêter le serveur
avec Ctrl+C ne révoque pas cette autorisation.

## Qualification du parcours intégré

Le test suivant crée puis nettoie un utilisateur et une annonce fictifs. Il
consomme **une comparaison réelle** du forfait ChatGPT ; aucun modèle n'est
appelé pour piloter le navigateur. Il exige un connecteur démarré avec un profil
autorisé et encore sans association ClawDeals. Exécuter un seul viewport par
processus du connecteur : chaque fixture crée un propriétaire différent, que
l'isolation du profil doit refuser après la première association.

```sh
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
TESTERARMY_CHATGPT_LOCAL=1 TESTERARMY_REDIS_FIXTURE=local-mock \
E2E_BASE_URL=http://127.0.0.1:4327 PARITY_OUTPUT=.e2e/validation/chatgpt-local-UNIQUE \
mise exec node@24.22.1 -- npm run test:mission -- \
  e2e/testerarmy/mission-live/chatgpt-local.e2e.ts --target desktop
```

Après ce test, arrêter le connecteur et retirer seulement `ownerId` de
`test-results/chatgpt-local/private/registration.json`, puis le redémarrer.
Cela libère l'association au propriétaire QA supprimé ; ne pas remplacer les
jetons par une ancienne copie et ne pas supprimer le profil personnel.
Utiliser `--target mobile` dans une invocation séparée pour le second viewport.

## Régression de reconnexion sans accès personnel

Le panneau doit permettre une nouvelle connexion après la déconnexion, même si
le rafraîchissement du statut échoue. Cette régression utilise la vraie page de
mission avec Auth, missions et réponses ChatGPT simulées dans le navigateur :
aucune requête ne rejoint le connecteur ou OpenAI, et aucun jeton n'est révoqué.
Après démarrage de `npm run dev:chatgpt`, lancer :

```sh
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
TESTERARMY_CHATGPT_UI=1 TESTERARMY_AI=0 E2E_BASE_URL=http://127.0.0.1:4327 \
PARITY_OUTPUT=.e2e/validation/chatgpt-recovery-UNIQUE \
mise exec node@24.22.1 -- npm run test:testerarmy -- \
  e2e/testerarmy/chatgpt-local-recovery.e2e.ts
```

Sans l'opt-in UI, ces cas sont ignorés : le panneau expérimental est absent du
serveur de tests standard. Les parcours OAuth réels restent qualifiés séparément.

## Références

- [Inscription et OAuth local](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Modèles et inférence](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Limitations de la préversion](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Conditions d'accès](https://developers.openai.com/siwc/token-sharing-open-source)
