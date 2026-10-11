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

## Preuves

Section réservée au compte rendu de validation du parcours. À compléter avec les
résultats constatés ; les critères du tableau ne sont pas encore des preuves.

| Périmètre | Preuve attendue | Résultat / référence |
| --- | --- | --- |
| Local, navigateur réel et backend identifié | Départ annonce et recherche, brouillon conservé à la connexion, création authentifiée, relecture après rechargement, résultats et état vide/action suivante | À renseigner après exécution. |
| Régressions pertinentes | Contrats de limites/authentification, parcours WebMCP touchés et CLI Cerebras séparée | À renseigner avec commandes et résultats. |
| PR et vérification locale | SHA vérifié par `verify:pr`, résultat et statut de revue/merge | À renseigner après exécution et revue. |
| CI, si déclenchée manuellement | SHA et jobs terminés, avec échecs ou contrôles non exécutés | À renseigner, ou indiquer non déclenchée. |
| Publication autorisée | SHA fusionné vérifié par `verify:release`, go de thanh, SHA servi, identité du déploiement et parcours affecté | À renseigner après autorisation et publication. |

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

