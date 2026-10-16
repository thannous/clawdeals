# Dogfooding connecté acheteur et vendeur — 16 octobre 2026

Cette passe exerce directement `https://app.clawdeals.com` et le marketing
canonique, avec des comptes, agents et annonces synthétiques isolés. Les requêtes
atteignent le runtime Vercel et les véritables services Supabase Auth/Postgres et
Redis. Il n'y a ni paiement ni envoi d'email, de SMS ou de message à un tiers.

## Version et méthode

- Déploiement initial : `dpl_7CBGquiPWXi5WkbCEPXvH3Covk4e`, SHA
  `1e5fdba52161e5a72a87cdc467405fa20dec9315`.
- Build app et marketing : `Jt1YBImxZfvN8e-KGiKlm`, contrôlé avant et après
  chaque fixture. Les résultats ci-dessous ne décrivent pas encore un correctif
  publié.
- Node 24.19.0, TesterArmy `e2e` 0.21.0, `@e2e-dev/web` 0.13.0 ; assertions
  exactes, sans appel modèle. Les traces réseau et vidéos privées sont désactivées.
- Le cycle initial utilise les vrais formulaires de connexion. Les scénarios
  de dogfooding supplémentaires obtiennent de véritables cookies de session via
  Supabase et le bridge propriétaire, ce qui permet les captures sans saisir de
  secret dans la page. Cela ne remplace pas un test de saisie du formulaire.
- Chaque fixture prouve que ses clés d'agent nouvellement allouées remplissent le
  cache du Redis configuré depuis le runtime déployé. Aucun contenu de cache,
  mot de passe, cookie ou token n'est exporté.

## Observations sur la production initiale

| Parcours | Observation vérifiée |
| --- | --- |
| Mission, négociation et transaction | Cycle connecté complet réussi, y compris session propriétaire expirée, montant approuvé à 129 EUR, consentements bilatéraux et clôture. |
| Reprise d'une mission acheteur | L'acheteur retrouve sa mission et repart avec un plafond réduit ; les deux missions restent distinctes et les résultats respectent le nouveau plafond. |
| Historique des approbations | Après approbation budgétaire et refus du partage de coordonnées, « Tous » affiche zéro ligne au lieu des deux décisions résolues. |
| Annonces vendeur | Recliquage sur « Tous » déjà actif : l'annonce disparaît, sans changement de filtre ni rechargement. |
| Conversations vendeur | Le même recliquage fait disparaître la conversation de la vente. |
| Offre acceptée vendeur | Après réservation, la liste ne propose plus de lien vers l'annonce ; le vendeur ne peut pas ouvrir sa fiche privée depuis l'offre. |
| Lisibilité des décisions | Les codes `offer_over_budget` et `contact_reveal_consent` sont affichés comme libellés principaux ; les captures montrent aussi des actions débordantes avec les colonnes secondaires. |
| Mobile, textes longs | Les captures du runtime local montrent le prix hors écran dans la liste vendeur, le badge de la fiche privée repoussé par le titre et les titres de missions débordant de leurs cartes. |

Le refus du partage de coordonnées est vérifié des deux côtés : l'état devient
`DENIED` et aucune coordonnée de l'autre partie n'est révélée. Les écritures de
négociation sont effectuées par les API agents ; les décisions humaines et la
navigation sont jouées dans le navigateur. Aucune page propriétaire de transaction
n'est supposée par ces tests.

## Reproductions conservées

Les rapports privés restent dans `.e2e/validation/production-connected-20261016/`.
Ils conservent la commande, le résultat principal, les captures pertinentes,
l'identité du déploiement et les reçus de nettoyage.

- `pilot-lifecycle` : **1/1 réussi**, run
  `01a14528-979e-7db7-ade2-9d5089958a13`, 42,72 s.
- `red-connected-desktop` : cinq échecs initiaux. Un défaut produit sur
  l'historique ; quatre problèmes de ciblage/casse des assertions ont été corrigés
  dans les tests, sans changement produit pour ceux-ci. Run
  `01a14529-925d-7383-b61e-c8cf58f6d2ba`.
- `red-confirmed-desktop` : reprise de mission **1/1 réussie** ; trois échecs
  vendeur reproduisant précisément les deux listes vidées et le lien absent.
  Run `01a1452d-7bd4-7699-a896-2e000d207868`, 85,01 s au total.

Les trois campagnes ont des entrées stables et aucune erreur du collecteur.
Les dix fixtures cumulées rapportent un graphe isolé, aucune erreur de nettoyage
et zéro résidu dans les compteurs contrôlés. Cette vérification porte sur leurs
propres données ; elle ne décrit pas les autres données du projet.

## Rejeu

Le prérequis est le projet ClawDeals jetable explicitement autorisé, avec les
credentials serveur et Redis configurés localement. Le lanceur sélectionne les
services réels en mémoire ; il ne réécrit pas les fichiers d'environnement.

```bash
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
PARITY_OUTPUT=.e2e/validation/commerce-production-UNIQUE \
  mise exec node@24.19.0 -- npm run test:commerce:production
```

Ajouter `-- --target desktop` pour un pilote. Chaque répertoire de sortie doit
être neuf. Les scénarios et leur cible sont documentés dans
[le guide TesterArmy](testerarmy-e2e.md#connected-buyer-and-seller-journeys-on-the-deployed-app).

## Validation des corrections avant publication

`local-green` : **12/12 réussis**, six parcours sur ordinateur et les six mêmes
sur navigateur mobile, run `01a14535-2f9c-701d-b04d-cb48c67e9f91`, 183,53 s.
Le frontend et le runtime corrigés tournent sur `http://localhost:4327`, avec
Supabase et Redis réels ; cela ne prouve pas encore leur publication sur Vercel.
Les entrées sont restées stables, sans erreur de collecte. Les douze fixtures
rapportent zéro résidu et aucune erreur de nettoyage. Le code produit vérifié
est celui de cette PR ; après cette exécution, seule la prise de capture de
l'historique a été déplacée après les assertions de chargement, car la première
capture montrait encore le squelette.

Les résultats couvrent la persistance des filtres après rechargement et retour,
les décisions approuvée/refusée visibles ensemble, les clics répétés sur « Tous »,
l'accès du vendeur à sa fiche réservée et le refus d'accès de l'acheteur à cette
fiche privée. Les actions des approbations sont lisibles sur mobile. Les tests
du harnais vérifient aussi les refus de cible, les cookies et la pagination du
précontrôle de notifications ; ils ne sont pas une preuve d'exécution en prod.

L'identité et le rejeu de la version publiée seront ajoutés au compte rendu de
livraison. Les reproductions initiales restent conservées avec leurs résultats
d'origine.

### Contrôle visuel mobile et reprise finale

Les captures ont conduit à renforcer les assertions sur les dimensions réellement
rendues. `seller-mobile-layout-red-real`, run
`01a1453f-d884-7eed-bcec-7b57f3c21844`, reproduit deux débordements à 555 et
450 px pour une largeur de 390 px. Le parcours conversation réussit ses assertions
mais échoue au nettoyage ; les trois fixtures ont un contrôle Redis inconnu et
tous leurs compteurs Auth/Postgres à zéro. Le runner utilisait l'ancien Redis
local arrêté, sans la surcharge KV distante de l'application. Un premier essai
`seller-mobile-layout-red` avait seulement échoué au lancement du navigateur
dans le sandbox ; ce n'est pas une preuve produit.

Une récupération distincte a supprimé quatre streams parmi les onze clés
agent/conversation exactement identifiées : `EXISTS` après suppression vaut zéro,
sans `SCAN` ni opération sur les clés partagées. Les préfixes des caches API
n'étant pas conservés, leur absence n'a pas été observée. Leur expiration est
attendue selon le TTL par défaut de 60 s ; la valeur effective héritée par le
runtime n'a pas été vérifiée. Les reçus SDK initiaux n'ont pas été réécrits.
Le reçu de récupération est dans
`.e2e/validation/release-connected-20261016/redis-recovery.json`.

Les titres, descriptions et badges se replient désormais dans la fiche vendeur ;
la liste mobile garde le prix et le statut à l'écran et les missions acceptent
les titres sans espaces. `local-final-green`, run
`01a14542-650b-7d92-ac31-774a33c11db4`, valide le résultat : **12/12 réussis en
186,86 s**, entrées stables, captures remplies inspectées, douze fixtures sans
erreur de nettoyage et tous leurs compteurs contrôlés à zéro. Le runner et
l'application utilisent cette fois explicitement la même paire Redis distante.
Ce résultat reste une preuve locale avec services réels, avant publication.

## Publication et dogfooding du correctif

La [PR #27](https://github.com/thannous/clawdeals/pull/27) a été fusionnée en
`f59df5ffdc7bf555f3881c8f5025cd588aa43c6d`, après revue automatique sans finding
et deux relectures indépendantes. `verify:release` a exécuté **16/16 contrôles**
sans réutilisation sur ce SHA, dont 906 tests unitaires réussis (1 ignoré) et
181/181 tests du corpus navigateur. Le déploiement Vercel
`dpl_9nCkyYqdtKuj8CJUYsipyfxnXXKm`, région `dub1`, sert ce SHA avec le build
`J6gTP9jqQEFcYYoecfGpz` sur l'app et le marketing.

`production-green`, run `01a14551-a1a5-76cb-b7f0-1a7ecef29f7b`, valide **12/12
parcours connectés en 177,23 s** sur le runtime Vercel publié, Auth/Postgres et
Redis réels. Les douze fixtures ont des entrées stables, la même identité de
déploiement avant/après, le cache Redis vérifié pour les deux rôles et zéro
résidu dans leurs compteurs contrôlés. Les dix parcours publics du run
`01a14551-a442-7bfc-b39b-fc8d354aca0a`, les cinq pages d'identité, les six lectures
API et les assets de huit pages sont également validés. Le reçu agrégé est
`.e2e/validation/release-connected-20261016/public-proof.json`.

La lecture des captures de cette exécution a néanmoins trouvé une régression de
lisibilité que les assertions fonctionnelles ne couvraient pas : un nom d'agent
long comprime le badge « En ligne » sur ordinateur, qui se fragmente en trois
lignes. La table des conversations conserve aussi son défilement horizontal sur
mobile, avec le statut et la date hors champ. Ces observations justifient une
passe complémentaire ciblée ; le résultat 12/12 précédent ne prouve pas leur
correction.

### Lisibilité complémentaire des listes vendeur

Le correctif borne les noms d'agents sur ordinateur sans les tronquer et garde
le badge sur une ligne. Sur mobile, la table des conversations regroupe les noms
sous l'annonce et conserve le statut et la date à l'écran. Les assertions
mesurent les lignes de texte réellement rendues et les limites du viewport.

`local-polish-final`, run `01a14559-82a3-7a83-82f2-19787eee0b00`, valide les six
parcours vendeur sur ordinateur/mobile, avec les services réels : **6/6 réussis**,
entrées stables, six fixtures sans erreur ni résidu contrôlé. Les captures de la
liste desktop et des conversations mobiles ont été relues. Les parcours acheteur
ne sont pas rejoués dans cette campagne ciblée, car leurs sources sont inchangées.

L'essai local précédent `local-polish-green` avait lui aussi six assertions de
parcours réussies, mais son enveloppe de commande appelait deux fois le runner :
le second appel a été refusé par la réservation du dossier (`EEXIST`) sans lancer
de nouvelle fixture. La commande a été corrigée pour le résultat final ci-dessus.
Cette erreur technique n'est pas une régression produit et reste dans son log.
