# Mission projet : équiper un bureau à domicile

## Résultat et périmètre V1

Un propriétaire décrit son bureau à domicile et fixe un budget total, par exemple
500 €. Le projet rassemble un bureau, une chaise et un écran, avec une lampe et
un clavier optionnels. La V1 porte sur des annonces ClawDeals en France, en euros.
Le texte exprime l'intention ; les contraintes structurées font foi : zone,
dimensions maximales du bureau, connecteur de l'ordinateur et date de retrait.

Le projet propose jusqu'à trois configurations distinctes à partir du catalogue
réel : économique, confort et retrait avant la date demandée. Un catalogue
insuffisant produit un manque explicite ; il ne produit ni annonce fictive ni
trois copies présentées comme des alternatives. L'ordre dépend des informations
disponibles et ne constitue pas une garantie d'ergonomie ou de disponibilité.

## Prix et compatibilité

- Les montants sont calculés en centimes entiers. Le plafond couvre la somme des
  articles et leurs frais, pour tous les vendeurs. Une annonce n'occupe qu'un
  emplacement. Les accessoires choisis font partie du budget.
- Les frais inconnus restent inconnus. Un sous-total connu inférieur au plafond
  ne signifie pas que l'ensemble respecte le budget ; la validation reste bloquée.
- Dimensions, connectique et possibilité de retrait sont vérifiées avec leur
  provenance. L'absence d'information n'est jamais une compatibilité positive.
- Les compléments saisis par l'utilisateur sont identifiés comme tels. Ils ne
  deviennent pas des confirmations du vendeur. La V1 n'extrait pas une preuve
  technique fiable de prose ou de photographies.
- Un prix communiqué dans la discussion peut être renseigné pour recalculer le
  projet. Il reste une information saisie par l'utilisateur, sans offre acceptée.
  Le prix de l'annonce reste conservé pour détecter ses modifications. USB-C
  exige une confirmation supplémentaire de la liaison vidéo, câble compris.
- Les incompatibilités certaines excluent la proposition concernée. Les questions
  nécessaires pour lever une incertitude sont regroupées par vendeur.

## Parcours et consentement

1. Décrire le résultat, le budget et les contraintes ; conserver le brouillon
   pendant la connexion dans le même onglet, sans données privées dans l'URL.
2. Créer le projet, comparer les ensembles, consulter les annonces et alternatives.
3. Choisir un ensemble précis. Examiner les vérifications, les frais manquants et
   les questions préparées pour chaque vendeur.
4. Confirmer séparément l'envoi des questions visibles. Ces messages ouvrent des
   discussions ClawDeals non engageantes ; aucun message ne part à la création.
5. Renseigner les réponses reçues et recalculer. Confirmer le panier lorsque les
   contraintes sont satisfaites et le total complet respecte le plafond.

Les réponses sont lues dans le projet ; les vendeurs répondent avec les interfaces
agent de messagerie existantes. Les alternatives peuvent être examinées et
renseignées avant recalcul ; cette version ne propose pas d'assemblage libre
article par article. Une information qui écarte un objet reste corrigeable.

**Valider le panier approuve un plan d'achat : cela ne réserve aucun article,
n'envoie aucune offre et ne déclenche aucun paiement.** Les discussions peuvent
commencer avant que toutes les informations soient connues, avec un consentement
séparé portant sur les messages exacts. Les offres et les achats restent dans
leur parcours distinct, hors de l'automatisation de cette V1.

Cette frontière est nécessaire : le plafond des missions BUY existantes est
contrôlé par offre et ne réserve pas un budget commun entre vendeurs. Une future
version d'offres coordonnées devra réserver atomiquement la somme des engagements,
incluant contre-offres et frais, avant de permettre leur émission ou acceptation.

## Recalcul et persistance

Les projets appartiennent au propriétaire authentifié. Les écritures vérifient
l'identité attendue et la version. Deux onglets ne peuvent pas approuver une
ancienne version en écrasant une modification plus récente.

Une validation est liée au brief, aux annonces, aux prix, aux frais et aux
informations vérifiées. La disponibilité et le prix sont relus côté serveur avant
validation ou contact. Un changement invalide l'approbation et demande de revoir
l'ensemble. Les remplacements restent des propositions, jamais des engagements
automatiques. Le recalcul intervient à la demande et aux transitions sensibles ;
la V1 ne promet pas une surveillance continue en arrière-plan.

La date de retrait est interprétée dans le fuseau Europe/Paris. Une échéance
dépassée invalide le panier et empêche les nouveaux contacts ; un nouveau projet
avec une date adaptée est alors nécessaire.

Les contacts possèdent un reçu persistant pour empêcher un double envoi lors
d'une reprise. Le projet et les discussions se retrouvent après rechargement.
La création, la sélection, la confirmation et le contact sont des étapes distinctes.

## Interface propriétaire

Les pages `/my/projects`, `/my/projects/new` et `/my/projects/[project_id]` sont
accessibles depuis les missions. L'API propriétaire requiert une session humaine ;
elle n'étend pas les autorisations des clés d'agent ou du SDK :

| Route sous `/api/v1/owner/project-missions` | Usage |
| --- | --- |
| `GET /`, `POST /` | Retrouver les projets, créer un brief |
| `GET /:mission_id` | Lire et actualiser un projet |
| `POST /:mission_id/recalculate` | Relire le catalogue et recomposer |
| `POST /:mission_id/select` | Sélectionner une configuration |
| `POST /:mission_id/facts` | Renseigner les informations d'un article |
| `POST /:mission_id/confirm` | Approuver la version du panier |
| `POST /:mission_id/contact` | Envoyer les questions affichées après confirmation |
| `GET /:mission_id/conversations` | Consulter les réponses et échanges du projet |

Les écritures utilisent `Idempotency-Key` et `X-Expected-Owner-Id` ; les actions
sur un projet incluent `expected_version`. Un conflit demande de relire le projet.
Le consentement aux messages n'autorise pas une offre commerciale. Les textes
privés du projet sont exclus des journaux d'audit.

## Vérification attendue

Les parcours navigateur doivent couvrir création, reprise après connexion,
comparaison, renseignements manquants, confirmation, remplacement et erreurs.
Les garanties serveur couvrent notamment le plafond agrégé, les centimes, les
annonces dupliquées ou disparues, les versions concurrentes, l'isolation des
propriétaires et les contacts idempotents. Les tests SQL locaux ne prouvent pas
l'application d'une migration sur le service hébergé.

La livraison suit `AGENTS.md` : vérification locale du commit, PR pour revue,
sans fusion ni déploiement automatique. Les migrations restent à appliquer au
moment d'une livraison explicitement autorisée.

Le parcours navigateur maintenu est
[`project-missions.e2e.ts`](../e2e/testerarmy/project-missions.e2e.ts). Il utilise le
vrai moteur de composition avec un transport HTTP simulé et ne prouve pas une
écriture dans le service hébergé. Commande depuis le checkout, avec Node 24 :

```sh
TESTERARMY_AI=0 npm run test:testerarmy -- e2e/testerarmy/project-missions.e2e.ts
```

Un `E2E_BASE_URL` local permet de réutiliser un serveur existant. Le runner garde
son rapport natif sous `.e2e/runs/` ; référencer ce résultat sans copier les médias.
