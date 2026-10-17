# Dépendances locales — 17 octobre 2026

Mise à jour compatible demandée par le propriétaire, sans déploiement.

| Paquet | Avant | Après |
| --- | --- | --- |
| Next.js / analyseur | 16.4.0 | 16.4.2 |
| TesterArmy `e2e` | 0.21.0 | 0.21.2 |
| `@e2e-dev/web` | 0.13.0 | 0.15.2 |
| Playwright | 1.63.0 | 1.64.1 |
| Supabase JS | 2.112.4 | 2.118.0 |
| MCP SDK | 1.30.0 | 1.32.1 |
| MCP client / serveur | 2.0.0 | 2.3.1 |
| next-intl | 4.9.2 | 4.14.9 |
| OpenNext Cloudflare | 1.17.1 | 1.20.12 |

Le lockfile actualise aussi les paquets dans leurs plages existantes, notamment
React/React DOM 19.3.1, Tailwind 4.3.3, Redis 1.39.0 et Zod 4.6.7. Node reste
24.19.0. Aucun fournisseur ni budget supplémentaire n'est configuré.

Le couple de lint existant `eslint-config-next` 16.3.3 / React Hooks 7.0.1 est
conservé. Le pilote 16.4.2 / 7.1.1 produit 72 erreurs sur les composants existants ;
la comparaison avec le même code et le plugin 7.0.1 passe. L'override imbriqué
conserve cette version dans la plage `^7.0.0` du preset existant. Aucune règle
n'est désactivée. La migration du compilateur React demanderait un travail
distinct sur ces composants. Les migrations majeures TypeScript, ESLint et
Vitest sont également laissées hors de cette mise à jour compatible.

Hono et le glob de l'outil OpenNext ont reçu leurs correctifs compatibles.
Les cinq alertes restantes provenaient d'une seule chaîne de dépendances :
Next ESLint → fast-glob → micromatch → braces. Le déclencheur de récursion
excessive a été reproduit via le véritable `getRootDirs` de Next.

Faute de version amont corrigée, un fork privé MIT de `braces` conserve son
comportement ordinaire et borne la profondeur du parseur et de chaque parcours
récursif à 128. L'override est limité à la dépendance de `micromatch` ; aucune
règle ESLint n'est retirée. Les AST directs, cycles et conteneurs itérables sont
également couverts. Voir [le fork](../tools/braces/README.md) et les
[régressions](../src/__tests__/tooling/braces-security.test.ts).
Le nouvel `npm audit --json` complet retourne **zéro vulnérabilité**. Aucun
`audit fix --force` ni retour à Next.js 14 proposé par l'audit n'est appliqué.
Ce fork devra être remplacé lorsqu'un correctif amont passera ces régressions.

Après une nouvelle installation propre avec `npm ci`, la copie isolée du code
courant passe `npm run test:ci` (227 fichiers, 919 tests réussis, un ignoré),
`npm run lint` et la compilation Next. Les 13 cas ajoutés vérifient le
déclencheur, les variantes d'AST, les usages ordinaires, le maintien de la règle
Next sur les liens internes et l'identité des sources réellement installées.

Le [dogfooding du 17 octobre](dogfooding-2026-10-17.md) passe six scénarios E2E
sur ordinateur et mobile, dont deux comparaisons réelles `gpt-6.1-sol`, ainsi
que deux sessions exploratoires du catalogue FR/ES. Les données fictives sont
nettoyées et l'association du profil personnel au propriétaire QA est libérée.

Les parcours et commandes sont décrits dans
[le pilote local](../scripts/agents/chatgpt-local/README.md). Le rapport local
ignoré par Git est `test-results/chatgpt-local/integration-verification.json`.
Ils réutilisent le consentement OAuth personnel déjà obtenu, avec Auth/Postgres
réels et Redis simulé ; cela ne constitue pas une validation déployée.
