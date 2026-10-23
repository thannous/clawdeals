# Première mission d’achat

Contrat maintenu du parcours annonce/recherche → connexion → confirmation →
mission persistée → résultats. Une mission créée ne signifie ni contact vendeur,
ni offre envoyée, ni achat conclu ; ces actions conservent leurs confirmations.
La création propriétaire impose `notification_mode=in_app`, sans activer de canal externe.
Le [runner Cerebras](cerebras-buyer-workflow.md) prépare une proposition distincte.

## Parcours et limites

- Retrouver l’objet et sa source dans le formulaire ; reprendre après connexion
  sans perdre budget, zone, exigences ou actions choisies.
- Initialiser prix préféré et plafond au prix exact de l’annonce. Toute marge
  supplémentaire exige une modification explicite. Devise et limites restent
  visibles ; durée, actions et coordonnées détaillées peuvent être repliées.
- Confirmer le récapitulatif après connexion, puis annoncer la réussite seulement
  après une réponse complète et valide. Une panne ne devient jamais un état vide.
- Retrouver les mêmes critères et le statut enregistré après rechargement.
  Les contrôles et messages du parcours sont disponibles en français, anglais et espagnol.

## Brouillons, identité et reprise

Le brouillon dure 24 heures dans le même onglet. Il est isolé par propriétaire et
source ; les brouillons anonymes sont également séparés par source. Il n’est pas
synchronisé entre appareils ou onglets. Un lien de connexion conserve uniquement
une destination locale validée ; ouvert ailleurs sans brouillon, il invite à
reprendre l’onglet d’origine. Les anciens brouillons v1 sans propriétaire explicite
restent en quarantaine, sans attribution, affichage à un autre compte ni effacement.

Avant tout POST, le corps et la clé d’idempotence sont écrits puis relus dans le
stockage de l’onglet. Un échec bloque l’envoi et indique comment rétablir le stockage.
La confirmation revérifie le compte actif. Le handler compare aussi
`X-Expected-Owner-Id` à l’identité authentifiée de la requête avant toute création :
une bascule de cookie est refusée par `403 OWNER_SESSION_CHANGED`. Cet en-tête
n’est pas une authentification et ne modifie pas le contrat de l’API agent.

Un résultat inconnu conserve le corps, les limites et la clé d’origine, même après
expiration ou changement de compte. Un autre compte peut créer sa propre mission
sans écraser cette tentative. Un refus définitif permet une correction avec une
nouvelle clé ; une réponse `201` incomplète ou corrompue reste incertaine. Seuls des
critères, zone, budget et permissions valides confirment la création et effacent
le brouillon de cette tentative, sans toucher aux autres sources.

Sources : [formulaire](../src/ui/my-missions/NewMissionPage.tsx),
[reprise](../src/ui/my-missions/missionRequestRecovery.ts),
[handler propriétaire](../src/pages/api/v1/owner/missions/index.ts).
Régressions : [contrat de création](../e2e/testerarmy/mission-create-contract.e2e.ts),
[isolation et reprise](../e2e/testerarmy/mission-owner-recovery.e2e.ts),
[réponse perdue et quota](../e2e/testerarmy/mission-recovery.e2e.ts),
[contrôle HTTP du compte](../src/__tests__/pages-api/v1/owner/missions.test.ts).
Les réponses interceptées du navigateur ne prouvent pas l’écriture réelle.

## Formulaire WebMCP

Une reprise utilise les arguments approuvés, la même clé d’idempotence et la même
clé d’agent. Modifier le formulaire ne remplace pas la tentative en attente.
Les soumissions simultanées partagent l’appel ; un succès confirmé est réutilisé.
Le récapitulatif et le plafond viennent du résultat confirmé ; une réponse
incomplète reste `OUTCOME_UNKNOWN`. Cette protection du
[panneau](../src/ui/webmcp/BuyMissionPanel.tsx) dure tant qu’il reste monté : elle
ne couvre ni plusieurs onglets, ni le rechargement, ni un appel direct à
`create_buy_mission`. Les [outils](../src/webmcp/tools/mission-tools.ts) signalent
alors une écriture indéterminée avec `OUTCOME_UNKNOWN` et `safe_to_retry: false`.

## Quotas et résultats

Les missions expirées restent consultables sans consommer le quota actif.
La création essaie les agents non suspendus dans un ordre stable. Seul
`409 WATCHLIST_LIMIT_REACHED`, avant insertion, autorise le passage à l’agent
suivant avec les mêmes critères et permissions ; toute autre erreur arrête la
demande. Aucun agent supplémentaire n’est créé pour contourner le quota de
50 recherches actives par agent.
Le premier agent peut être créé uniquement pour un compte sans agent, sous sa
limite existante. Les lectures agrègent les missions de tous les agents possédés.

Les résultats conservent les correspondances dans la description et appliquent
pays, devise, prix, distance, catégorie et livraison. Une requête composée seulement
de ponctuation ne devient pas une recherche sans filtre. Voir le
[service propriétaire](../src/server/services/owner-buy-missions.ts) et les tests
[mission](../src/server/services/owner-buy-missions.test.ts),
[sélection d’agent](../src/server/services/owner-agent-selection.test.ts),
[quota](../src/server/services/watchlist-quota.test.ts) et
[matcher](../src/server/utils/matching.test.ts).

## Fixtures et validation

Avant une annonce LIVE, le [fixture](../e2e/testerarmy/mission-live/fixtures.ts)
scanne les watchlists actives non supprimées du marché avec le matcher de la file
de notifications. Une correspondance extérieure au fixture, une erreur ou un scan
incomplet bloque l’insertion. La borne est 100 pages de 500 lignes ; un compte
exact détecte les limites serveur plus basses. Ce précontrôle est un instantané,
pas un verrou contre les changements concurrents. Les critères tiers ne sont
ni modifiés ni enregistrés ; le reçu garde l’identifiant fictif, le nombre de
lignes et la complétude. Le nettoyage inclut uniquement l’entrée de file de type
`listing` portant l’identifiant de l’annonce du fixture.

Le [test de protection des notifications](../src/__tests__/e2e/mission-fixture-notifications.test.ts)
utilise le fixture et le client HTTP réels avec un transport simulé pour les
correspondances, erreurs, pagination incomplète et nettoyage borné. Ces refus ne
se démontrent pas en publiant une annonce à risque sur le backend réel.

Pour rejouer les parcours navigateur et la persistance, suivre le
[guide TesterArmy](testerarmy-e2e.md#verify-the-real-first-purchase-mission) et les
[environnements autorisés](release-environments.md). Identifier app, backend et
Redis réels ou simulés ; un serveur local peut utiliser la base distante autorisée.
Les fixtures ne contactent personne et ne déclenchent aucun paiement. Garder une
preuve par campagne avec source/build, cible, résultat, commande et échec utile.
La [procédure de livraison](release-staging-to-prod.md) distingue vérification
locale, revue et déploiement autorisé ; aucun résultat daté n’est une preuve du
checkout courant.
