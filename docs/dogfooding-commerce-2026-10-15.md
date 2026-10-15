# Dogfooding commerce — 15 octobre 2026

**Brouillon : qualification finale en attente.** Cette note décrit les changements
en cours depuis `97eff873c191e705f4a6cb095d57dd3b4697107a` et les vérifications
ciblées obtenues pendant leur développement. Les preuves ci-dessous portent sur
un checkout modifié ; elles ne qualifient pas encore le commit final. Aucun
résultat de qualification du commit final n'est déclaré dans cette version.

## Parcours et rôles

Le scénario maintenu est
[`commerce-live/lifecycle.e2e.ts`](../e2e/testerarmy/commerce-live/lifecycle.e2e.ts).
Il fait jouer deux identités fictives, acheteur et vendeur, avec leurs vrais
comptes Supabase Auth et leurs agents API distincts. Le navigateur automatise
les actions qui appartiennent au propriétaire humain ; le script appelle les
API avec les clés des agents pour la négociation. Ce n'est ni une simulation
de décisions par un modèle ni une étude avec de vrais utilisateurs.

| Étape | Acteur et interface | Résultat attendu par le scénario |
| --- | --- | --- |
| Annonce à 125 EUR ; mission à 120 EUR souhaités, 130 EUR maximum | Acheteur dans le navigateur, connexion et confirmation | Mission persistée, annonce retrouvée dans ses résultats |
| Choix d'agent et recherche `été` | API propriétaire et lecture Postgres ciblée | Agent actif choisi malgré un agent suspendu plus ancien ; terme présent seulement dans la description retrouvé |
| Offre à 120 EUR puis contre-offre à 135 EUR | Agents acheteur et vendeur, API réelles | Acceptation bloquée par `APPROVAL_REQUIRED` ; une clé d'agent ne peut pas donner l'approbation humaine |
| Proposition corrigée à 129 EUR | Propriétaire acheteur dans le navigateur | Montant conservé après rechargement et expiration de session ; une seule contre-offre après approbation et répétition de l'action |
| Acceptation à 129 EUR | Agent vendeur | Offre acceptée, annonce réservée, transaction créée |
| Consentement aux coordonnées | Chaque propriétaire dans son compte navigateur | Un seul consentement ne révèle rien ; l'autre compte ne peut pas lire l'approbation privée ; les deux consentements révèlent à chaque agent le contact fictif de l'autre partie |
| Confirmation de fin et suivi | Chaque agent par API, puis compte vendeur dans le navigateur | `COMPLETED_PENDING_CONFIRM` puis `COMPLETED` ; offre à 129 EUR, annonce à 125 EUR et conversation présente dans le compte vendeur |

L'incident de session expire la session **propriétaire ClawDeals**, pas la session
Supabase Auth. Au retour sur la connexion, celle-ci reste valide et permet de
recréer la session propriétaire sans ressaisie du mot de passe. Les connexions
initiales acheteur/vendeur utilisent le formulaire et un mot de passe éphémère.
Aucun paiement, livraison réelle, email, SMS ou message à un tiers n'est réalisé.

## Environnement et limites des preuves

Les essais utilisent Node `24.19.0`, TesterArmy `e2e 0.21.0` et
`@e2e-dev/web 0.13.0`, avec une application locale sur `http://localhost:4327`.
La persistance et l'authentification commerce utilisent le véritable projet
Supabase ClawDeals `gztfmpuqtpvncdcuhqxy`, explicitement autorisé pour les données
fictives jetables pendant cette phase de développement. Une application locale
ne signifie donc pas une base locale.

Redis est le simulateur REST local sur `127.0.0.1:4413`, partagé par l'application
et la fixture. Ces essais vérifient son contrat avec l'application ; ils ne
qualifient pas le service Upstash déployé ni sa durabilité. Les régressions UI
ciblées du tableau ci-dessous interceptent leurs API et ne remplacent pas le
parcours commerce sur Supabase réel.

Les étapes sont exactes, sans `agent.act()` ni appel de modèle : **0 appel de
modèle et 0 coût de modèle pour ces tests**. Cela ne mesure pas les coûts
d'infrastructure ou de l'assistance au développement. Aucun nouveau provider
ou budget n'est ajouté. Ces exécutions locales ne qualifient ni CI, ni interface
déployée, ni production applicative.

## Frictions traitées

| Friction constatée | Changement et couverture |
| --- | --- |
| Montant d'approbation perdu, reprise difficile après session expirée ou réponse perdue | Brouillon dans l'onglet, isolé par propriétaire et approbation ; nouvelle sonde de session ; répétition de l'action, du corps et de la clé exacts tant que le résultat reste inconnu ; lien depuis la file vers la fiche pour reprendre sans perdre montant ou note |
| Lien de contexte d'approbation devenu 404 | Mission privée pour l'approbation de mission ; fiche privée pour la publication d'annonce ; référence non cliquable pour le consentement de contact, sans lien public vers l'annonce réservée |
| Confirmation d'inscription dans un autre onglet donnant l'impression d'avoir perdu la mission | Retour localisé et instruction de reprendre l'onglet original, où le brouillon privé reste conservé ; reprise automatique si le bon brouillon existe dans le même onglet |
| Pont de session réussi mais écran de connexion persistant | Effet de reprise stabilisé lors des mises à jour du routeur ; résultat annulé ignoré, sans approbation automatique |
| Agent suspendu choisi arbitrairement alors qu'un agent actif appartient au même propriétaire | Sélection déterministe préférant l'agent actif ; refus conservé si tous sont suspendus, sans provisionnement contournant suspension ou limite d'agents |
| Recherche de mission rejetant un mot Unicode tel que `été` | Le catalogue conserve la responsabilité du plein texte ; la garde rejette les requêtes sans lettre ni chiffre. Budget, devise, marché, zone et exigences restent contrôlés |
| Contre-offres absentes du filtre et badge français tronqué à 390 px | Statut `COUNTERED` en EN/FR/ES et badge pouvant revenir à la ligne ; filtre, URL, rechargement et remise à zéro couverts |
| Prix vendeur divisé par cent | Les vues liste/détail affichent la même unité monétaire que l'API ; un prix gratuit reste visible |
| HTTP 201 inexploitable présenté comme succès ou permettant un nouvel envoi | JSON tronqué, HTML, `null` ou objet vide produisent `OUTCOME_UNKNOWN`, sans résumé de mission créée. Une annulation d'un POST déjà lancé garde aussi un résultat inconnu |

La garde WebMCP contre les doublons couvre les soumissions du formulaire,
humaines ou préparées par `prepare_buy_mission`, **tant que `BuyMissionPanel`
reste monté**. Elle mémorise l'essai par clé d'agent et contenu des arguments
effectivement approuvés, y compris après édition dans la confirmation.
Une soumission identique ne refait pas de POST ; un brief différent demande une
nouvelle confirmation. Elle ne couvre pas l'appel direct de `create_buy_mission`,
un rechargement ou plusieurs onglets. Les couches HTTP et mission-tools
renvoient néanmoins `OUTCOME_UNKNOWN` avec `safe_to_retry: false` pour ces appels
lorsque le résultat d'une écriture est indéterminé.

## Preuves ciblées avant qualification finale

Les chemins désignent des sorties locales ignorées par Git. Les nombres
comptent les cas sélectionnés et exécutés ; les déclarations marquées `skipped`
par la sélection ne sont pas des parcours vérifiés. `inputStable: true` confirme
la stabilité des entrées suivies par le wrapper pendant cette invocation, sans
transformer le checkout modifié en preuve du commit final.

| Vérification | Résultat ciblé | Sortie locale et limite |
| --- | --- | --- |
| Prix vendeur, liste et détail, desktop/mobile | 4/4, code primaire 0, `inputStable: true` | `.e2e/validation/dogfood-listing-price-green-021-20261015` ; prix 1234 et gratuit, API simulée |
| Filtre `COUNTERED`, EN/FR/ES, desktop/mobile | 6/6, code primaire 0, `inputStable: false` | `.e2e/validation/dogfood-commerce-countered-green` ; diagnostic fonctionnel, entrées modifiées pendant l'exécution |
| Badge et filtre, EN/FR/ES mobile | 3/3, code primaire 0, `inputStable: true` | `.e2e/validation/dogfood-countered-badge-green` ; trois captures/traces, débordement mobile reproduit avant correction |
| Reprise d'approbation : session, réponse perdue/tronquée, stockage, compte, file et note | 14/14 desktop/mobile, code primaire 0, `inputStable: true` | `.e2e/validation/approval-recovery-stable-021` ; Auth et API d'approbation simulées |
| Contexte des approbations | 2/2 desktop/mobile, huit contextes par cas, code primaire 0, `inputStable: true` | `.e2e/validation/approval-context-green-021` ; destinations des liens vérifiées, clic après réservation ajouté au parcours réel restant à qualifier |
| Callback d'inscription : même onglet ou onglet indépendant | 4/4, code primaire 0, `inputStable: true` | `.e2e/validation/signup-callback-final-021` ; Auth simulée, aucun email envoyé |
| Capture et pont de session du callback mobile | 2/2, code primaire 0, `inputStable: true` | `.e2e/validation/signup-callback-mobile-proof-021` ; preuve complémentaire ciblée, pas deux parcours commerce supplémentaires |
| Retour automatique après renouvellement de session | 2/2 desktop/mobile, `inputStable: true` | `.e2e/validation/auth-auto-recovery-green-021` ; pont Auth retardé et mise à jour du routeur simulés, retour au montant conservé sans POST d'approbation |
| Réponses WebMCP inexploitables et second envoi | 8/8 desktop/mobile, code primaire 0, `inputStable: true` | `.e2e/validation/commerce-webmcp-contract-green-021-20261015` ; quatre types de réponse, API interceptée, aucune création réelle |

Le pilote commerce desktop `commerce-live-pilot9-021` a ensuite terminé le cycle
complet en 30,34 s, avec zéro résidu dans les scopes contrôlés et un reçu stable.
Il reste une preuve de développement sur checkout modifié ; la campagne finale
ci-dessous sera liée au commit. Le wrapper contrôle désormais les empreintes
de tous les fichiers source de l'application, en plus des tests et messages,
pour détecter une modification pendant un essai.

Les contrôles de service ciblés ont également obtenu 18/18 sur la sélection
d'agent et les missions propriétaire, et 11/11 sur HTTP WebMCP. Ils couvrent
notamment suspension, absence d'agent, contraintes de recherche et annulation
de POST. Ce sont des résultats de développement reçus avant le gel ; les
contrôles du commit final restent à consigner. Un cas supplémentaire de
confirmation WebMCP avec JSON modifié est encore en correction : les huit
résultats ci-dessus ne valent pas rejeu de cette correction ultérieure.

## Données fictives, garde et nettoyage

La [fixture commerce](../e2e/testerarmy/commerce-live/fixtures.ts) initialise
deux utilisateurs Auth confirmés, deux propriétaires, deux agents actifs avec
clés temporaires, un agent acheteur suspendu et une annonce à titre UUID.
Missions, offres, approbations et transaction sont ensuite créées par les
interfaces de l'application. Les adresses utilisent `example.test`, les numéros
la plage fictive réservée, et les préférences de notification sont `SILENT`.

La fixture exige le projet Supabase exact, l'opt-in explicite et une origine
d'application locale. Avant l'annonce `LIVE`, elle vérifie les watchlists actives
du marché avec le matcher réel et refuse tout match extérieur. C'est un
instantané, pas un verrou contre une création concurrente. Les critères lus
ne sont pas exportés ; aucun réglage d'un tiers ni cron global n'est modifié.

La garde navigateur autorise les lectures locales, les endpoints Auth nécessaires
et les écritures du parcours. Les routes d'offres, transactions et approbations
sont vérifiées contre les identités de la fixture. La garde est réinstallée après
`app.clearState()` au changement de compte. Les clés d'agents restent côté
script, jamais injectées dans le navigateur commerce.

Au nettoyage, sessions et clés sont révoquées, puis le graphe métier est inspecté
avant les suppressions en cascade. Une relation extérieure bloque ces
suppressions. Les identifiants alloués bornent la suppression : objets métier et
dépendances, files de matching, journaux ciblés, identités Auth, caches Redis et
streams d'agents/conversations. Aucun `FLUSH`, aucune suppression globale, aucun
nettoyage des données d'un autre test. Les compteurs de limitation temporaires et
le stream d'opérations partagé restent sous leur TTL prévu.

Chaque invocation conserve un reçu `commerce-fixtures/<uuid>.json` : identifiants
synthétiques, chemins/statuts API, refus, comptes résiduels et erreurs de nettoyage.
Si le parcours échoue, son erreur primaire est conservée et le reçu porte les
erreurs de nettoyage séparément ; une erreur de nettoyage fait aussi échouer un
parcours autrement réussi. Il faut contrôler le reçu, pas seulement le verdict.

Les traces réseau et vidéos commerce sont désactivées pour éviter de capturer
des jetons Auth. Le wrapper génère le mot de passe utilisé via les credentials
opaques du SDK. Aucun secret n'est inscrit dans le reçu ; les rapports commerce
restent privés et exclus des bundles publics.

## Reproduction et clôture à compléter

La commande et les prérequis complets sont maintenus dans
[TesterArmy — transaction acheteur/vendeur](./testerarmy-e2e.md#verify-a-complete-buyerseller-transaction).
L'application doit déjà utiliser le même backend et le même Redis local que le
runner. Choisir une sortie neuve à chaque invocation, sans modifier les rapports
précédents.

```bash
E2E_BASE_URL=http://localhost:4327 \
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
TESTERARMY_REDIS_FIXTURE=local-mock \
UPSTASH_REDIS_REST_URL=http://127.0.0.1:4413 \
PARITY_OUTPUT=.e2e/validation/commerce-FINAL-UNIQUE \
  mise exec node@24.19.0 -- npm run test:commerce
```

Les credentials Supabase et le jeton du simulateur Redis doivent déjà être
configurés selon le guide ; ne pas les copier dans cette note. Le wrapper
fournit le mot de passe éphémère. Pour le pilote desktop seulement, ajouter
`-- --target desktop` ; la qualification attendue couvre les deux cibles.

| Clôture finale | Statut |
| --- | --- |
| Commit et arbre source qualifiés | À compléter après gel |
| Suite navigateur sur ce commit | En attente ; sortie, sélection, comptes et `inputStable` à renseigner |
| Commerce réel desktop/mobile sur ce commit | En attente ; aucune réussite complète déclarée ici |
| Reçus Auth/Postgres/Redis, zéro résidu dans les scopes vérifiés | À confirmer pour chaque invocation finale |
| `npm run verify:pr` sur le commit à publier | En attente |
| Mise à jour PR #26 | Après vérification ; sans fusion ni déploiement |
