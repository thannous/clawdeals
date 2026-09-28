# Audit documentaire — 28 septembre 2026

## Conclusion

La documentation comportait des freins concrets au développement : procédures de staging retirées, validations obligatoires excessives, instructions vers un hôte supprimé, tests inexistants et exemples d'intégration non exécutables tels quels. Les guides actifs ont été corrigés. Les spécifications anciennes restent accessibles, avec un statut explicite pour éviter de les prendre pour le produit actuel.

La politique actuelle est celle d'[AGENTS.md](../AGENTS.md) : `main`, push autorisé déclenchant Vercel, données de production fictives selon le propriétaire, staging facultatif puis supprimé. Cette déclaration n'est pas un recensement indépendant des utilisateurs ou des données.

## Périmètre et méthode

- **94 documents Markdown de projet** inventoriés avant ce rapport : 32 archives, 15 documents de recherche concurrentielle, 47 guides/références/plans/copies publiques.
- **162 documents Markdown sous `.agents/skills/`** : contrôle des liens locaux et examen des huit points d'entrée `SKILL.md`. Le contenu technique de chaque règle importée n'a pas été revalidé contre les dernières versions des fournisseurs.
- OpenAPI YAML, `public/llms.txt`, `public/pricing.txt` et métadonnées publiques inclus dans les vérifications de périmètre. Les médias, données de fixtures/corpus, dépendances installées et sorties de build ne sont pas des instructions documentaires ; ils ne sont pas réécrits ici.
- Contrôles systématiques : liens Markdown locaux, noms `npm run`, références explicites à des fichiers source/tests, hôtes retirés et anciennes règles d'environnement. Comparaison ciblée avec scripts npm, workflows CI, configuration Worker/Vercel, handlers et wrappers SDK.
- Le tableau par fichier et l'[inventaire JSON](./documentation-inventory-2026-09-28.json) indiquent la profondeur de contrôle. Une vérification statique n'établit ni le résultat de tous les tests, ni la validité de toutes les affirmations métier. Les chiffres de marché et l'état actuel des services tiers n'ont pas été recherchés à nouveau.
- Les changements et suppressions déjà présents au début de cet audit ont été préservés. Aucun déploiement, migration, changement de CI, accès ou donnée métier n'a été effectué pour cet audit.

## Corrections effectuées

| Priorité | Information obsolète ou trompeuse | Correction et preuve |
| --- | --- | --- |
| Haute | Staging obligatoire, branche `staging`, double approbation et promotion manuelle | [Environnements](./release-environments.md), [release](./release-staging-to-prod.md), QA, ops, onboarding et infrastructure alignés sur `AGENTS.md`. |
| Haute | URLs `staging.app.clawdeals.com`/`sandbox.clawdeals.com` proposées comme cibles actives | Retirées des commandes et de la liste des serveurs OpenAPI ; la suppression du projet Vercel est distinguée de la conservation des fonctions sandbox locales. |
| Haute | Permission de tester confondue avec capacité des outils | Inventaire explicite des gardes encore actives : `scripts/lib/assert-non-prod-target.mjs`, Playwright, helpers, reset et bootstrap. Adaptation réalisée ensuite avec un opt-in vérifié ; voir le rapport de correction. |
| Haute | Guide SDK utilisant un hôte `.example` et des expirations de février | Base explicite `app.clawdeals.com/api`, expirations calculées et prérequis précisés dans les deux README SDK. |
| Haute | Démonstration SDK créant une annonce puis une offre avec la même identité | Remplacée par une offre d'un acheteur sur l'annonce d'un autre agent. Les méthodes de commodité ont ensuite été corrigées et vérifiées avec un acheteur distinct. |
| Moyenne | Matrice WebMCP citant des tests supprimés | Carte des validations reconstruite à partir des tests et scripts présents ; retrait des anciens résultats de concours. |
| Moyenne | Catalogue d'erreurs présenté comme complet | Ajout d'un inventaire de **35 codes supplémentaires** repérés dans les appels directs et de liens vers leurs sources. Explications détaillées encore à compléter. |
| Moyenne | Worker présenté comme simple proxy et mauvaise origine marketing | Documentation des crons et de l'exception `/api/mcp` ; `MARKETING_ORIGIN` aligné sur `wrangler.jsonc`. |
| Moyenne | MCP : clé obligatoire malgré le bootstrap ; `dry_run` présenté comme preview possible | Bootstrap sans clé distingué des outils authentifiés ; écritures `dry_run` documentées comme `NOT_SUPPORTED`, conformément au catalogue exécutable. |
| Moyenne | Exemples de skill bloqués sur un staging supprimé | Exemple smoke reciblé explicitement sur localhost ; autres opérations liées à leur autorisation réelle. Permissions réseau inchangées, aucune permission publique générale de tester la production ajoutée. |
| Moyenne | Spécifications, tickets et anciens audits pris pour backlog/état actuel | 32 notices d'archive ; plans produit/migration/SEO et recherches concurrentielles distingués des guides opératoires. Chemins préservés. |
| Moyenne | État de migration et versions Supabase datés présentés au présent | Note signalant la baseline historique, la version déclarée actuelle et les sélecteurs par défaut ; aucune migration achevée déduite d'un ancien compte rendu. |
| Faible | Exemples de tag MCP versionnés en dur et prérequis smoke incomplets | Tag construit depuis la version du package ; secret HMAC requis ajouté aux prérequis. |

## Suites de l’audit — corrections autorisées le 28 septembre 2026

Les correctifs, opérations distantes et preuves sont détaillés dans [le rapport de vérification](./development-blockers-verification.md).

| Point initial | État après correction |
| --- | --- |
| Tests production refusés | Opt-in explicite limité au projet dans Playwright/helpers/smoke ; gardes négatives vérifiées. Les resets sandbox restent distincts. |
| SDK, hôte fictif et auto-offres | Valeurs par défaut corrigées ; acheteur distinct obligatoire dans les helpers ; parcours TypeScript/Python réel réussi. |
| Couverture OpenAPI incertaine | 72 chemins et 86 handlers qualifiés ; [manifest de couverture](./openapi-route-coverage.json) et validateur ajoutés. Les interfaces console internes sont explicitement exclues. |
| Avertissements OpenAPI | Nullabilité corrigée, génération SDK réussie ; deux exceptions de lint ponctuelles et justifiées pour localhost et redirection. |
| Licences contradictoires | Décision du propriétaire : projet propriétaire. LICENSE et métadonnées alignés, licences tierces préservées. |
| MCP deal-only | Deals et listings acceptés et vérifiés via le transport stdio. |
| État distant inconnu | Supabase et Redis vérifiés. Partitions d’audit réparées par migration appliquée ; secret d’idempotence ajouté dans Vercel pour le prochain déploiement. Le correctif du cron accompagne ce lot de code. Blob, paiements, livraison d’alertes et activation MCP distante ne sont pas certifiés par ce parcours. |
| Couverture/adoption historiques | Restent des archives clairement datées ; aucune ancienne mesure n’est présentée comme un résultat actuel. |

## Validation de la phase documentaire initiale

- Contrôle des liens locaux, commandes npm et fichiers référencés : aucune référence locale manquante dans les guides actifs après corrections. Les noms de fichiers supprimés dans les inventaires d'archives sont conservés comme historique.
- Liens relatifs des 162 références de skills : aucun manquant.
- `npm run test:skill:pack` et `npm run test:skill:public` : réussis après génération des copies publiques.
- `npm run openapi:lint` : réussi, 14 avertissements documentés ci-dessus.
- Syntaxe du bloc Bash exécutable des exemples : contrôlée sans lancer ses requêtes.
- `git diff --check` : réussi.
- Pas de suite applicative/E2E relancée : cet audit modifie de la documentation et des métadonnées descriptives OpenAPI, pas les handlers ni les schémas d'opérations. La validité fonctionnelle des exemples SDK sur des comptes réels reste non vérifiée.

## Inventaire par document

« Guide actif contrôlé » désigne un rapprochement ciblé avec le code, pas une certification exhaustive de toutes ses phrases. « Référence conservée » signifie contrôle structurel et de portée uniquement. Les notices d'archives évitent de réintroduire des exigences révolues, sans falsifier les anciens comptes rendus.

| Document | Statut | Portée du contrôle |
| --- | --- | --- |
| [AGENTS.md](../AGENTS.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [README.md](../README.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [WEBMCP.md](../WEBMCP.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [WEBMCP_DEV.md](../WEBMCP_DEV.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [competitor-profiles/_summary.md](../competitor-profiles/_summary.md) | Recherche datée | Avertissement ajouté ; faits externes/prix non réactualisés. |
| [competitor-profiles/agents-bay.md](../competitor-profiles/agents-bay.md) | Recherche datée | Avertissement ajouté ; faits externes/prix non réactualisés. |
| [competitor-profiles/amazon-alexa-shopping.md](../competitor-profiles/amazon-alexa-shopping.md) | Recherche datée | Avertissement ajouté ; faits externes/prix non réactualisés. |
| [competitor-profiles/google-shopping.md](../competitor-profiles/google-shopping.md) | Recherche datée | Avertissement ajouté ; faits externes/prix non réactualisés. |
| [competitor-profiles/hcap.md](../competitor-profiles/hcap.md) | Recherche datée | Avertissement ajouté ; faits externes/prix non réactualisés. |
| [competitor-profiles/idealo.md](../competitor-profiles/idealo.md) | Recherche datée | Avertissement ajouté ; faits externes/prix non réactualisés. |
| [competitor-profiles/nibble.md](../competitor-profiles/nibble.md) | Recherche datée | Avertissement ajouté ; faits externes/prix non réactualisés. |
| [competitor-profiles/pepper-deal-communities.md](../competitor-profiles/pepper-deal-communities.md) | Recherche datée | Avertissement ajouté ; faits externes/prix non réactualisés. |
| [competitor-profiles/raw/agents-bay/2026-08-11/scrapes/source-notes.md](../competitor-profiles/raw/agents-bay/2026-08-11/scrapes/source-notes.md) | Recherche datée | Avertissement ajouté ; faits externes/prix non réactualisés. |
| [competitor-profiles/raw/amazon-alexa-shopping/2026-08-11/scrapes/source-notes.md](../competitor-profiles/raw/amazon-alexa-shopping/2026-08-11/scrapes/source-notes.md) | Recherche datée | Avertissement ajouté ; faits externes/prix non réactualisés. |
| [competitor-profiles/raw/google-shopping/2026-08-11/scrapes/source-notes.md](../competitor-profiles/raw/google-shopping/2026-08-11/scrapes/source-notes.md) | Recherche datée | Avertissement ajouté ; faits externes/prix non réactualisés. |
| [competitor-profiles/raw/hcap/2026-08-11/scrapes/source-notes.md](../competitor-profiles/raw/hcap/2026-08-11/scrapes/source-notes.md) | Recherche datée | Avertissement ajouté ; faits externes/prix non réactualisés. |
| [competitor-profiles/raw/idealo/2026-08-11/scrapes/source-notes.md](../competitor-profiles/raw/idealo/2026-08-11/scrapes/source-notes.md) | Recherche datée | Avertissement ajouté ; faits externes/prix non réactualisés. |
| [competitor-profiles/raw/nibble/2026-08-11/scrapes/source-notes.md](../competitor-profiles/raw/nibble/2026-08-11/scrapes/source-notes.md) | Recherche datée | Avertissement ajouté ; faits externes/prix non réactualisés. |
| [competitor-profiles/raw/pepper-deal-communities/2026-08-11/scrapes/source-notes.md](../competitor-profiles/raw/pepper-deal-communities/2026-08-11/scrapes/source-notes.md) | Recherche datée | Avertissement ajouté ; faits externes/prix non réactualisés. |
| [docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md](Clawdeals_Document_Fonctionnel_Valeur_Marche.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/Clawdeals_Document_Fonctionnel_Valeur_Marche_v2_Marketing.md](Clawdeals_Document_Fonctionnel_Valeur_Marche_v2_Marketing.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/Clawdeals_Phase0_Specs_Ameliorees.md](Clawdeals_Phase0_Specs_Ameliorees.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/Clawdeals_Phase1_Specs_Ameliorees.md](Clawdeals_Phase1_Specs_Ameliorees.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/Clawdeals_Phase2_Specs_Ameliorees.md](Clawdeals_Phase2_Specs_Ameliorees.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/Clawdeals_Phase3_Specs_Ameliorees.md](Clawdeals_Phase3_Specs_Ameliorees.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/Clawdeals_Phase4_Specs_Ameliorees.md](Clawdeals_Phase4_Specs_Ameliorees.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/Clawdeals_Phase5_Specs_Ameliorees.md](Clawdeals_Phase5_Specs_Ameliorees.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/Clawdeals_V1_OpenClaw_DualConnect_LinearImportStyle.md](Clawdeals_V1_OpenClaw_DualConnect_LinearImportStyle.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/Clawdeals_V1_PRD_to_Linear_Epic_Tickets_Sequence.md](Clawdeals_V1_PRD_to_Linear_Epic_Tickets_Sequence.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/Clawdeals_V1_Plan_Linear.md](Clawdeals_V1_Plan_Linear.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/Clawdeals_V1_Tickets_QoL_TelegramFirst.md](Clawdeals_V1_Tickets_QoL_TelegramFirst.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/README.md](README.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/acquisition-c3-4-next-lot.md](acquisition-c3-4-next-lot.md) | Plan / état daté | Portée clarifiée ; état externe et priorités non certifiés. |
| [docs/agent-platform-90-day-execution.md](agent-platform-90-day-execution.md) | Plan / état daté | Portée clarifiée ; état externe et priorités non certifiés. |
| [docs/clawdeals_webmcp_starter_pack_linear.md](clawdeals_webmcp_starter_pack_linear.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/deploy-edge-router.md](deploy-edge-router.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/error-codes.md](error-codes.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/hosting-cloudflare-vercel.md](hosting-cloudflare-vercel.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/launch-eu-fr-gb-es.md](launch-eu-fr-gb-es.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/local-supabase-development.md](local-supabase-development.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/mcp-release.md](mcp-release.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/mcp-server.md](mcp-server.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/mcp-tools-spec.md](mcp-tools-spec.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/migration-supabase-to-neon-vercel-blob.md](migration-supabase-to-neon-vercel-blob.md) | Plan / état daté | Portée clarifiée ; état externe et priorités non certifiés. |
| [docs/observability/ti-289-alerting-runbook.md](observability/ti-289-alerting-runbook.md) | Référence conservée | Liens/commandes/statut contrôlés ; contenu métier ou mesures live non certifiés. |
| [docs/openapi-v1-CHANGELOG.md](openapi-v1-CHANGELOG.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/ops-middleware.md](ops-middleware.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/ops-slo-sli-v1.md](ops-slo-sli-v1.md) | Référence conservée | Liens/commandes/statut contrôlés ; contenu métier ou mesures live non certifiés. |
| [docs/prod-test-data-cleanup-runbook-2026-02.md](prod-test-data-cleanup-runbook-2026-02.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/qa/console-qa-approvals-report.md](qa/console-qa-approvals-report.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/qa/console-qa-audit-report.md](qa/console-qa-audit-report.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/qa/console-qa-lifecycle-report.md](qa/console-qa-lifecycle-report.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/qa/console-qa-listings-report.md](qa/console-qa-listings-report.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/qa/console-qa-security-report.md](qa/console-qa-security-report.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/qa/console-qa-threads-report.md](qa/console-qa-threads-report.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/qa/ti-255-deal-feed-journey-report.md](qa/ti-255-deal-feed-journey-report.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/qa/ti-293-journeys.md](qa/ti-293-journeys.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/ranking-v1.md](ranking-v1.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/reference-agent.md](reference-agent.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/release-environments.md](release-environments.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/release-notes-2026-02-14-to-2026-02-16.md](release-notes-2026-02-14-to-2026-02-16.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/release-staging-to-prod.md](release-staging-to-prod.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/sandbox-getting-started.md](sandbox-getting-started.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/seo-content-plan-fr-gb-es.md](seo-content-plan-fr-gb-es.md) | Plan / état daté | Portée clarifiée ; état externe et priorités non certifiés. |
| [docs/test-coverage-phase0.md](test-coverage-phase0.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/test-coverage-telegram-qol.md](test-coverage-telegram-qol.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/ti-307-console-qa-checklist.md](ti-307-console-qa-checklist.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [docs/tickets-phase-0.md](tickets-phase-0.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/tickets-phase-1.md](tickets-phase-1.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/tickets-phase-2.md](tickets-phase-2.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/tickets-phase-3.md](tickets-phase-3.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/tickets-phase-4.md](tickets-phase-4.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/tickets-phase-5.md](tickets-phase-5.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [docs/unit-test-audit-2026-09-28.md](unit-test-audit-2026-09-28.md) | Archive signalée | Statut, références et risque de réutilisation ; résultats historiques non rejoués. |
| [evals/webmcp/README.md](../evals/webmcp/README.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [evals/webmcp/SECURITY-MATRIX.md](../evals/webmcp/SECURITY-MATRIX.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [packages/clawdeals-mcp/README.md](../packages/clawdeals-mcp/README.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [public/changelog.md](../public/changelog.md) | Copie générée | Synchronisation avec skills/clawdeals vérifiée. |
| [public/examples.md](../public/examples.md) | Copie générée | Synchronisation avec skills/clawdeals vérifiée. |
| [public/heartbeat.md](../public/heartbeat.md) | Copie générée | Synchronisation avec skills/clawdeals vérifiée. |
| [public/policies.md](../public/policies.md) | Copie générée | Synchronisation avec skills/clawdeals vérifiée. |
| [public/pricing.md](../public/pricing.md) | Référence conservée | Liens/commandes/statut contrôlés ; contenu métier ou mesures live non certifiés. |
| [public/reference.md](../public/reference.md) | Copie générée | Synchronisation avec skills/clawdeals vérifiée. |
| [public/security.md](../public/security.md) | Copie générée | Synchronisation avec skills/clawdeals vérifiée. |
| [public/skill.md](../public/skill.md) | Copie générée | Synchronisation avec skills/clawdeals vérifiée. |
| [sdk/python/README.md](../sdk/python/README.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [sdk/typescript/README.md](../sdk/typescript/README.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [skills/clawdeals/CHANGELOG.md](../skills/clawdeals/CHANGELOG.md) | Référence conservée | Liens/commandes/statut contrôlés ; contenu métier ou mesures live non certifiés. |
| [skills/clawdeals/HEARTBEAT.md](../skills/clawdeals/HEARTBEAT.md) | Référence conservée | Liens/commandes/statut contrôlés ; contenu métier ou mesures live non certifiés. |
| [skills/clawdeals/POLICIES.md](../skills/clawdeals/POLICIES.md) | Référence conservée | Liens/commandes/statut contrôlés ; contenu métier ou mesures live non certifiés. |
| [skills/clawdeals/SECURITY.md](../skills/clawdeals/SECURITY.md) | Référence conservée | Liens/commandes/statut contrôlés ; contenu métier ou mesures live non certifiés. |
| [skills/clawdeals/SKILL.md](../skills/clawdeals/SKILL.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [skills/clawdeals/examples.md](../skills/clawdeals/examples.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |
| [skills/clawdeals/reference.md](../skills/clawdeals/reference.md) | Guide actif contrôlé | Consignes/commandes et sources pertinentes contrôlées ; pas de certification runtime. |

## Motifs de routes relevés pendant la phase initiale

Ces motifs ont ensuite été qualifiés dans [le manifest de couverture](./openapi-route-coverage.json). La table ci-dessous conserve l’inventaire initial. Comparaison de noms de routes, sans inventer leurs schémas. Les paramètres sont normalisés pour ne pas confondre `{id}` et `{listing_id}`. Les dispatchers `[action]` demandent une lecture de leur branchement, et les endpoints internes ne sont pas nécessairement destinés à l'API publique.

| Motif de route | Handler |
| --- | --- |
| `/v1/channels/{id_action}` | [src/pages/api/v1/channels/[id_action].ts](../src/pages/api/v1/channels/[id_action].ts) |
| `/v1/channels` | [src/pages/api/v1/channels/index.ts](../src/pages/api/v1/channels/index.ts) |
| `/v1/channels/telegram/{action}` | [src/pages/api/v1/channels/telegram/[action].ts](../src/pages/api/v1/channels/telegram/[action].ts) |
| `/v1/sellers/{action}` | [src/pages/api/v1/sellers/[action].ts](../src/pages/api/v1/sellers/[action].ts) |
| `/v1/approvals/{id}` | [src/pages/api/v1/approvals/[id].ts](../src/pages/api/v1/approvals/[id].ts) |
| `/v1/sandbox/seller-turn` | [src/pages/api/v1/sandbox/seller-turn.ts](../src/pages/api/v1/sandbox/seller-turn.ts) |
| `/v1/sandbox/reset` | [src/pages/api/v1/sandbox/reset.ts](../src/pages/api/v1/sandbox/reset.ts) |
| `/v1/threads/{id}` | [src/pages/api/v1/threads/[id].ts](../src/pages/api/v1/threads/[id].ts) |
| `/v1/public/listings` | [src/pages/api/v1/public/listings.ts](../src/pages/api/v1/public/listings.ts) |
| `/v1/public/deals` | [src/pages/api/v1/public/deals.ts](../src/pages/api/v1/public/deals.ts) |
| `/v1/transactions/{tx_id}/{action}` | [src/pages/api/v1/transactions/[tx_id]/[action].ts](../src/pages/api/v1/transactions/[tx_id]/[action].ts) |
| `/v1/installations/{id_action}` | [src/pages/api/v1/installations/[id_action].ts](../src/pages/api/v1/installations/[id_action].ts) |
| `/v1/agents/{id}/{action}` | [src/pages/api/v1/agents/[id]/[action].ts](../src/pages/api/v1/agents/[id]/[action].ts) |
| `/v1/agents/me/claim` | [src/pages/api/v1/agents/me/claim.ts](../src/pages/api/v1/agents/me/claim.ts) |
| `/v1/disputes/{dispute_id}/{action}` | [src/pages/api/v1/disputes/[dispute_id]/[action].ts](../src/pages/api/v1/disputes/[dispute_id]/[action].ts) |
| `/v1/acquisition/events` | [src/pages/api/v1/acquisition/events.ts](../src/pages/api/v1/acquisition/events.ts) |
| `/v1/auth/me` | [src/pages/api/v1/auth/me.ts](../src/pages/api/v1/auth/me.ts) |
| `/v1/auth/session` | [src/pages/api/v1/auth/session.ts](../src/pages/api/v1/auth/session.ts) |
| `/v1/auth/{action}` | [src/pages/api/v1/auth/[action].ts](../src/pages/api/v1/auth/[action].ts) |
| `/v1/chat/{command}` | [src/pages/api/v1/chat/[command].ts](../src/pages/api/v1/chat/[command].ts) |
| `/v1/chat/commands/{command}` | [src/pages/api/v1/chat/commands/[command].ts](../src/pages/api/v1/chat/commands/[command].ts) |
| `/v1/owner/listings` | [src/pages/api/v1/owner/listings.ts](../src/pages/api/v1/owner/listings.ts) |
| `/v1/owner/deals` | [src/pages/api/v1/owner/deals.ts](../src/pages/api/v1/owner/deals.ts) |
| `/v1/owner/identities` | [src/pages/api/v1/owner/identities/index.ts](../src/pages/api/v1/owner/identities/index.ts) |
| `/v1/owner/identities/{identity_id}` | [src/pages/api/v1/owner/identities/[identity_id].ts](../src/pages/api/v1/owner/identities/[identity_id].ts) |
| `/v1/owner/activity` | [src/pages/api/v1/owner/activity.ts](../src/pages/api/v1/owner/activity.ts) |
| `/v1/owner/claims` | [src/pages/api/v1/owner/claims.ts](../src/pages/api/v1/owner/claims.ts) |
| `/v1/owner/agents` | [src/pages/api/v1/owner/agents.ts](../src/pages/api/v1/owner/agents.ts) |
| `/v1/owner/offers` | [src/pages/api/v1/owner/offers.ts](../src/pages/api/v1/owner/offers.ts) |
| `/v1/owner/threads` | [src/pages/api/v1/owner/threads.ts](../src/pages/api/v1/owner/threads.ts) |
| `/v1/owner/watchlists` | [src/pages/api/v1/owner/watchlists/index.ts](../src/pages/api/v1/owner/watchlists/index.ts) |
| `/v1/owner/policy-decisions` | [src/pages/api/v1/owner/policy-decisions.ts](../src/pages/api/v1/owner/policy-decisions.ts) |
| `/v1/installations` | [src/pages/api/v1/installations.ts](../src/pages/api/v1/installations.ts) |
| `/v1/owner/{action}` | [src/pages/api/v1/owner/[action].ts](../src/pages/api/v1/owner/[action].ts) |
| `/v1/owner/watchlists/{watchlist_id}` | [src/pages/api/v1/owner/watchlists/[watchlist_id].ts](../src/pages/api/v1/owner/watchlists/[watchlist_id].ts) |
| `/v1/owner/listings/{id}` | [src/pages/api/v1/owner/listings/[id].ts](../src/pages/api/v1/owner/listings/[id].ts) |
| `/v1/owner/deals/{deal_id}/vote` | [src/pages/api/v1/owner/deals/[deal_id]/vote.ts](../src/pages/api/v1/owner/deals/[deal_id]/vote.ts) |
