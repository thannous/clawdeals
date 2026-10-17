# Dogfooding local — 17 octobre 2026

Résultat : aucun blocage observé dans les parcours ci-dessous. Cette campagne
qualifie le catalogue, la première mission et le pilote ChatGPT local ; elle ne
constitue pas une nouvelle validation de tous les parcours commerce ni un
déploiement.

## Parcours et preuves fraîches

| Parcours | Cibles | Résultat | Rapport local ignoré par Git |
| --- | --- | --- | --- |
| Catalogue : filtres, tri par prix, recherche sans résultat et réinitialisation | Mobile FR et ES, sessions isolées | 2/2 sessions, 56 étapes exactes, aucune erreur | `.e2e/validation/dogfood-security-20261017/host-result.json` |
| Annonce → mission → connexion avec brouillon conservé → budget/localisation → confirmation → persistance et correspondances ou état vide | Ordinateur et mobile | 4/4 tests | `.e2e/validation/dogfood-first-missions-security-20261017/summary.md` |
| Mission réelle → connexion ChatGPT → sélection du modèle → comparaison d'une annonce → rechargement | Ordinateur | 1/1 test, réponse réelle `gpt-6.1-sol` | `.e2e/validation/dogfood-chatgpt-security-20261017-desktop/summary.md` |
| Même parcours ChatGPT | Mobile | 1/1 test, réponse réelle `gpt-6.1-sol` | `.e2e/validation/dogfood-chatgpt-security-20261017-mobile/summary.md` |

Les tests ChatGPT vérifient également le refus d'une origine étrangère (403),
d'un utilisateur anonyme (401), d'un autre propriétaire (401) et d'une mission
sans annonce correspondante (409, sans appel au modèle). Aucun jeton ChatGPT
n'est placé dans le stockage local du navigateur. Les traces réseau et vidéos
de ces deux tests sont désactivées pour préserver les identifiants.

Le catalogue dispose de captures SDK et de traces d'exploration ; ses 56 étapes
ne sont pas présentées comme 56 tests CLI. Aucun appel de modèle pilote le
navigateur. Les deux comparaisons ChatGPT utilisent le consentement personnel
déjà accordé, avec un véritable appel au modèle par cible.

## Environnement et identité

- Application locale : `http://127.0.0.1:4327`, pont ChatGPT sur `127.0.0.1:4318`.
- Auth et Postgres Supabase réels, données QA jetables autorisées ; Redis REST
  local simulé. Cela ne prouve pas la durabilité d'un Redis déployé.
- Node 24.19.0, Next 16.4.2, `e2e` 0.21.2, `@e2e-dev/web` 0.15.2.
- Base Git : `b1e6e2acbfeb48b8780d1c06e969b01eeb110468`, avec les modifications
  locales non commitées. Chaque invocation conserve ses entrées et son résultat
  dans `command.json` et `completion.json` ; les trois invocations CLI ont
  `primaryCode: 0` et `inputStable: true`.
- Depuis le parcours première mission, seul le fichier de régression
  `src/__tests__/tooling/braces-security.test.ts` a changé parmi ses entrées
  suivies ; le code applicatif testé est inchangé. Les deux parcours ChatGPT
  utilisent les entrées finales. Les documents ajoutés après les tests ne
  changent pas le comportement.
- Les fixtures nettoient leurs utilisateurs, annonces et missions. Après chaque
  parcours ChatGPT, seule l'association du profil au propriétaire QA supprimé
  est retirée, serveurs arrêtés ; le consentement personnel est conservé. Le
  pilote est relancé pour l'utilisateur.

## Relancer

Prérequis : configuration `.env.local` existante, dépendances du pilote installées,
consentement ChatGPT déjà obtenu pour le test ChatGPT, profil libre d'association
à un propriétaire QA précédent. Voir le [pilote local](../scripts/agents/chatgpt-local/README.md)
et les [environnements autorisés](release-environments.md).

```sh
mise exec node@24.19.0 -- npm run dev:chatgpt
```

Dans un autre terminal, pour le catalogue :

```sh
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
E2E_BASE_URL=http://127.0.0.1:4327 \
PARITY_OUTPUT=.e2e/validation/dogfood-catalogue-rerun \
mise exec node@24.19.0 -- npm run testerarmy:dogfood
```

Pour les premières missions :

```sh
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
TESTERARMY_REDIS_FIXTURE=local-mock E2E_BASE_URL=http://127.0.0.1:4327 \
PARITY_OUTPUT=.e2e/validation/dogfood-first-missions-rerun \
mise exec node@24.19.0 -- npm run test:mission -- e2e/testerarmy/mission-live/first-mission.e2e.ts
```

Pour ChatGPT, lancer séparément chaque cible (`desktop`, puis `mobile`) et
libérer l'association QA entre les deux selon le pilote :

```sh
CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy \
TESTERARMY_CHATGPT_LOCAL=1 TESTERARMY_REDIS_FIXTURE=local-mock \
E2E_BASE_URL=http://127.0.0.1:4327 \
PARITY_OUTPUT=.e2e/validation/dogfood-chatgpt-desktop-rerun \
mise exec node@24.19.0 -- npm run test:mission -- e2e/testerarmy/mission-live/chatgpt-local.e2e.ts --target desktop
```
