# Plan éditorial SEO — France, Royaume-Uni, Espagne

Dernière mise à jour : 2026-07-18

## Objectif

Acquérir une audience qualifiée autour des agents IA capables de chercher des deals, d'utiliser MCP et d'agir sous contrôle humain. La même intention doit être traitée avec un contenu réellement localisé en français, anglais britannique et espagnol, pas avec une traduction partielle autour d'une page anglaise.

## Vague 1 — implémentée dans ce lot

| Cluster | Requête principale | Page | Conversion attendue |
| --- | --- | --- | --- |
| OpenClaw | OpenClaw Skill URL vs MCP vs ClawHub | `/guides/openclaw-skill-vs-mcp-vs-clawhub` | Consulter l'intégration OpenClaw |
| Sécurité MCP | MCP security checklist | `/guides/mcp-security-checklist` | Consulter les contrôles MCP ClawDeals |
| Gouvernance | AI agent spending human approval | `/guides/ai-agent-human-approval-spending` | Découvrir Policy Control |
| Marketplace | AI agent marketplace comparison | `/guides/ai-agent-marketplace` | Explorer la marketplace |

Les hubs `/guides` et `/integrations` servent de points d'entrée et de maillage. Les guides historiques DealWatch et MCP Marketplace Safety restent dans le cluster et doivent être reliés aux nouveaux contenus.

## Vague 2 — prochaines priorités

1. **Trust Score ClawDeals : calcul, quarantaine et signaux à vérifier**
   Intention : comprendre comment évaluer un agent ou un vendeur avant une action.

2. **OAuth 2.1 et device flow pour connecter un agent MCP sans copier sa clé**
   Intention : sécuriser l'installation et la rotation des accès.

3. **Créer des alertes de deals automatisées en France**
   Exemples en EUR, `market_code=FR`, géographie et vocabulaire français.

4. **Build automated deal alerts in the UK**
   Exemples en GBP, `market_code=GB`, terminologie et cas d'usage britanniques.

5. **Crear alertas de ofertas automatizadas en España**
   Exemples en EUR, `market_code=ES`, villes et formulations espagnoles.

6. **Audit trail d'un agent IA : reconstruire une décision de bout en bout**
   Intention : exploitation, conformité et réponse à incident.

Les trois guides marché ne doivent pas être des duplications traduites. Chaque page doit utiliser la devise, les exemples, la géographie et les questions propres au pays.

## Règles de publication

- Une intention principale par page, alignée entre le title, le H1 et l'introduction.
- Répondre à la question dès le premier écran, puis proposer une table des matières et des sections actionnables.
- Vérifier chaque endpoint, payload, limite et nombre d'outils contre le code ou l'OpenAPI avant publication.
- Afficher auteur, date de publication et date de mise à jour ; reporter les mêmes valeurs dans le JSON-LD.
- Fournir canonical, alternates `en`/`fr`/`es`, `x-default`, Open Graph et une image existante.
- Ajouter au moins deux liens contextuels vers des guides liés et un CTA vers une page produit ou d'intégration.
- N'ajouter aucun chiffre de performance, classement, témoignage ou durée d'installation sans preuve vérifiable.
- Ne publier une locale que lorsque son corps, ses metas, ses CTA et ses libellés sont réellement localisés.

## Distribution après publication

- Vérifier l'URL dans Google Search Console et demander l'indexation après le déploiement public.
- Contrôler que le sitemap public expose la bonne date `lastmod` et que les alternates retournent 200.
- Relier le nouveau guide depuis le hub, le footer, une page produit pertinente et deux contenus existants.
- Transformer chaque guide en une démonstration courte ou une checklist partageable pour les communautés OpenClaw/MCP, sans copier l'article complet.
- Rechercher des liens éditoriaux auprès de documentations, annuaires MCP et comparatifs d'outils uniquement lorsque la page apporte une ressource utile à leur audience.

## Mesure

Suivre par pays, locale et page :

- pages découvertes puis indexées ;
- impressions et clics non liés à la marque ;
- CTR par requête et position moyenne, sans conclure sur un échantillon trop court ;
- entrées vers `/guides` et passages guide → intégration/marketplace ;
- créations de compte ou connexions d'agent assistées par un guide ;
- requêtes qui gagnent des impressions mais restent sans page dédiée.

Faire une première revue après quatre semaines d'indexation, puis une revue mensuelle. Corriger d'abord les problèmes d'indexation et d'intention avant d'augmenter le volume de publication.
