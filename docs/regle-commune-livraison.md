# Règle commune de livraison

Autorisation du propriétaire (2026-10-11) : dans le cadre du travail demandé sur
ClawDeals, l’agent peut créer les commits nécessaires sans nouvelle confirmation.
Il peut ensuite, après réussite de `npm run verify:pr` sur le commit à publier,
pousser sa branche de travail et ouvrir ou mettre à jour la PR sans redemander
l’accord du propriétaire. La fusion et la production suivent les étapes ci-dessous.

1. Avant de push, l'agent lance `npm run verify:pr` sur sa machine. Si ça échoue, il ne pousse pas.
2. La PR indique le commit vérifié et le résultat.
3. Le CTO relit et merge quand les commentaires sont réglés et que rien ne bloque.
4. Rien ne part en prod sans le go de thanh.
