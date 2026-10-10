# Règle commune de livraison

**Version commune : v6 (2026-10-10)**
**Statut** : en vigueur. La v2 a été adoptée par le propriétaire le 9 octobre 2026 ; la v3 (même jour, soir) ajoute le principe « local d'abord » (§10), l'échelle de relecture (§11), la preuve des contrôles spécialisés (§12) et la CI externe (§13) ; la v4 et la v5 (même soir) corrigent le texte commun après relecture ; la v6 (10 octobre 2026) retire toute attribution de machines et passe Dependabot aux alertes seules (§9).
**Décideur** : le propriétaire.
**Dépôts concernés** : shapier, skillcodex, clawdeals, bodylab, dreamer.
**Copies** : chaque dépôt a sa propre copie de ce fichier, à l'emplacement qu'il choisit (le chemin de la règle du dépôt, donné dans sa §13.1). Aucune copie n'est la source des autres. Tout ce qui précède la §13.1 est identique, octet pour octet, dans les cinq dépôts ; la §13.1 est propre à chaque dépôt.

## 0. Consignes aux agents relecteurs

- Commentez par numéro de section (§2.3, §7…).
- Marquez chaque remarque selon l'échelle de la §11 : **bloquant**, **à corriger** ou **détail**.
- Une correction du texte commun se fait dans les cinq copies, avec la même version (§6).

## 1. Objectif

**Payer moins et livrer plus vite.** Chaque point de la règle doit faire baisser un coût (minutes, crédits, déploiements) ou une attente. Sinon, il n'a rien à faire ici.

La règle tient en une phrase :

> **Push rapide ; contrôles locaux proportionnés avant fusion ; publication vérifiée pour la cible livrée ; CI externe seulement sur demande explicite.**

## 2. La règle

Chaque `AGENTS.md` en reprend le résumé et renvoie à la copie locale de ce fichier (§6).

1. **Push rapide.**
   - Pousser souvent ne coûte rien, et les PR en brouillon sont permises.
   - Le hook `pre-push` dure quelques secondes et ne lance aucune suite lourde (§3).
   - Il est interdit aux agents de contourner le hook ou de le désactiver.
2. **Contrôles proportionnés avant fusion.**
   - Avant de fusionner, l'auteur lance `verify:pr`. Ce contrôle est choisi selon ce qui a changé :
     - lint ciblé et mis en cache ;
     - vérification des types ;
     - tests concernés ;
     - contrôles spécialisés (base de données, navigateur, mobile, corpus) quand leurs entrées changent.
   - Le contrôle tourne sur une copie isolée du commit (`git worktree`), pas dans l'arbre de travail. Il n'oblige donc pas à ranger un travail en cours.
   - Il produit une **preuve** liée à l'**arbre vérifié** (le *tree hash* git), pas seulement au commit (§4). Il y note les contrôles lancés, leur résultat et l'environnement : versions de Node et du gestionnaire de paquets.
   - Les variables d'environnement qui réduisent ce qu'un contrôle lance sont retirées avant les contrôles : `JEST_CHANGED_SINCE`, `TURBO_SCM_BASE`, `TURBO_SCM_HEAD`, `CI_BASE_REVISION`, `GITHUB_BASE_SHA`, et celles que la config d'un dépôt ajoute dans `stripEnv`. Un contrôle qui a besoin de l'une d'elles la fixe dans son propre `env`.
   - **Contrôles spécialisés.** L'agent lance les contrôles spécialisés sur la machine où il s'exécute (§10.3). Si elle ne peut pas lancer l'un d'eux, il le dit dans `## Local proof` ; si ce contrôle est exigé avant la fusion, la PR attend sa preuve. `--external` ne vaut que pour un contrôle spécialisé qui ne peut pas tourner ici (sa sonde `requires` échoue) et cite une exécution de ce contrôle au format du moteur (§12) ou un workflow listé dans la table de CI externe du dépôt (§13, §13.1). La preuve cite exactement un commit, le commit vérifié : le SHA de tête de la PR pour `verify:pr`, le commit livré pour `verify:release` ; jamais un autre commit, même de même arbre. Une entrée externe n'est jamais réutilisée par une autre preuve.
3. **La PR et sa fusion.**
   - Avant fusion, la section `## Local proof` cite la preuve : commande, commit et arbre vérifiés, résultat, contrôles spécialisés lancés ou jugés hors périmètre. Ce titre anglais et la ligne du SHA du commit restent inchangés : le contrôle de fusion automatique des agents les lit.
   - Conditions de fusion, communes aux cinq dépôts :
     - la PR n'est plus en brouillon ;
     - le `Commit SHA` de la preuve est la tête de la PR ;
     - chaque fil de discussion a une réponse et est résolu ; aucun n'est ouvert (§11) ;
     - il n'y a pas de conflit ;
     - la relecture du CTO n'a pas de point bloquant.
   - C'est le CTO qui fusionne, en squash. Les relecteurs ne poussent jamais sur la branche de l'auteur. On ne fusionne jamais une PR Dependabot.
   - Une PR qui modifie `verify-local.config.mjs`, le moteur et ses tests, `.githooks/`, les scripts de contrôle que la config liste dans `deliveryFiles`, un `package.json` hors dépendances et version (ses `scripts`, ou la configuration d'outil qu'il porte) ou la configuration d'un outil de contrôle (ESLint, TypeScript, Jest, Vitest, Playwright, Babel, Turbo, Prettier, Deno, pytest, configs e2e, `pnpm-workspace.yaml`) change ses propres contrôles : elle demande en plus la relecture du propriétaire, et `## Local proof` le signale (« Delivery checks changed »).
4. **Intégration : recalculer, ne pas tout rejouer.**
   - Si la branche de base a avancé, l'auteur fusionne la base dans la branche et relance `verify:pr`.
   - Seuls les contrôles dont les entrées ont changé sont rejoués.
   - Si l'arbre fusionné est identique à l'arbre déjà prouvé, aucun contrôle ne tourne à nouveau ; `verify:pr` est tout de même relancé pour que la preuve cite le nouveau SHA de tête (§2.3).
5. **Publication vérifiée pour la cible livrée.**
   - Avant de publier, `verify:release` s'exécute sur le commit livré.
   - Il ne réutilise aucun résultat : chaque contrôle de publication tourne sur le commit livré, dans une copie isolée, même si la PR l'a déjà passé sur le même arbre. Les contrôles qu'une PR ne lance que si leurs chemins changent (`when`) tournent aussi. La réutilisation par entrées identiques reste réservée à `verify:pr`.
   - Il refait ce qui dépend vraiment du commit livré : l'intégration, le build de la cible, l'identité (SHA et version embarqués).
   - Ensuite, il faut vérifier la production (santé, pages touchées) et noter le SHA et le déploiement. Publier reste une décision explicite.
6. **Aperçus à la demande.** Aucun déploiement d'aperçu n'est déclenché par un push. On lance un aperçu quand on en a besoin.
7. **CI externe seulement sur demande explicite (§10, §13).**
   - Elle ne tourne jamais par défaut et ne bloque jamais rien par elle-même ; aucune fusion n'attend un lancement automatique.
   - Le signal après fusion est un `verify:pr` facultatif sur le SHA de la branche principale (S5, §10).
   - Aucune protection GitHub ne doit exiger un statut de CI : une règle écrite dans `AGENTS.md` ne retire pas un statut obligatoire côté serveur.
8. **Propre à chaque dépôt**, dans sa section de l'`AGENTS.md` et dans la §13.1 :
   - la technique, les conventions et la langue ;
   - les commandes `verify:pr` et `verify:release` et ce qu'elles lancent ;
   - les contrôles de push du dépôt ;
   - les contrôles spécialisés et le moment où ils deviennent nécessaires ;
   - les lignes de sa table de CI externe.

## 3. Contrat du hook pre-push

| Cas | Comportement exigé |
| --- | --- |
| Durée | Quelques secondes. Si c'est plus long, on optimise le contrôle ou on le déplace vers `verify:pr` ; on ne crée jamais un faux succès |
| Suppression de branche ou de tag, ou rien de nouveau | Ne rien lancer, sortie 0 |
| Contenu | Uniquement les contrôles de push du dépôt, tous quasi instantanés (le détail de chaque dépôt est dans sa §13.1) |
| Preuve | Afficher s'il existe une preuve pour l'arbre poussé. Une preuve absente n'est pas bloquante (brouillons, travail en cours) |
| Installation | Par `prepare`. Ne jamais faire échouer une installation. Ne rien faire hors d'un dépôt git (EAS, archives) |

## 4. La preuve

- **Emplacement** : `$(git rev-parse --git-common-dir)/verify-proofs/<tree>.json`. Ce dossier est hors de l'arbre, partagé par les worktrees, et jamais commité.
- **Contenu** : `version`, `sha`, `tree`, `kind` (`pr` ou `release`), `clean`, `startedAt`, `finishedAt`, `command`, `node`, `packageManager`, et `checks` (nom et résultat de chacun). Le numéro de format est `PROOF_FORMAT_VERSION` (3 depuis la garde de `--external`) ; une preuve d'un format antérieur est ignorée.
- **Identité d'une publication** : la preuve garde le commit **et** l'arbre. Seule une preuve `kind: release` satisfait une garde de publication ; une preuve `kind: pr` ne débloque jamais une publication.
- **Transmission** : la preuve locale ne survit pas à une autre session. La section `## Local proof` de la PR recopie le commit, l'arbre, la commande et le résultat, et c'est elle qui fait foi entre sessions. `node scripts/verify-local.mjs proof-block` l'imprime.
- **Pas de recul** : une exécution qui échoue ou reste incomplète ne remplace jamais une preuve réussie du même arbre, et une preuve `pr` ne remplace jamais une preuve `release` réussie. La tentative est notée à côté (`<tree>.<kind>-attempt.json`), et ses contrôles réussis restent réutilisables.
- **Entrées externes** : une entrée `--external` n'est jamais réutilisée, et la garde de publication la revérifie.
- **Confiance** : la preuve est un fichier JSON local, non signé. La confiance s'arrête à la machine qui l'a écrite ; la relecture vérifie que le `Commit SHA` est la tête de la PR.
- **Dépendances de la copie isolée** : en mode `link`, le moteur lie les `node_modules` du checkout quand le lockfile est identique (un sous-projet qui a son propre lockfile n'est lié que si ce lockfile est identique) ; en mode `install`, la copie installe. Un contrôle qui refuse les liens demande sa propre installation (`install: true`). Chaque copie a son propre `TMPDIR`, supprimé avec elle. Le mode de chaque dépôt est dans sa config.

## 5. Modèle de PR commun

Le modèle `.github/pull_request_template.md` a les sections `## Summary`, `## Local proof`, `## Specialised checks`, `## Review` et `## External CI`. Dans `## Local proof`, le titre et les lignes `Commands`, `Commit SHA` et `Result` restent tels quels, en anglais : le contrôle de fusion du CTO lit le SHA pour le comparer à la tête de la PR. Un dépôt qui teste ces chaînes change son test dans la même PR que le modèle.

```markdown
## Local proof
- Commands: `…`
- Commit SHA: `…`
- Result: …
- Tree (`git rev-parse <sha>^{tree}`): `…`
- Specialised checks (database, browser, mobile, corpus): run: … / out of scope: …
- Integration: base unchanged / base moved, checks replayed: …
```

## 6. Copies et synchronisation

- Chaque dépôt a sa copie de ce fichier, et son `AGENTS.md` contient :
  - la phrase de la §1 ;
  - un lien vers la copie locale, au chemin de la règle du dépôt (donné dans sa §13.1) ;
  - la table locale des commandes.
- La ligne **Version commune** en tête identifie le texte commun. Une correction du texte commun change cette version et se recopie dans les cinq dépôts ; un dépôt peut s'aligner plus tard, sa version dit où il en est.
- **Moteur** : `scripts/verify-local.mjs` et ses tests `scripts/test-verify-local.mjs` sont, par choix recommandé, le même fichier dans les cinq dépôts, chaque dépôt avec sa propre copie. Ils portent le hook, `verify:pr`, `verify:release`, la preuve et la garde de publication. Chaque dépôt ne décrit que ses contrôles, dans `verify-local.config.mjs`. Chaque dépôt épingle son propre `ENGINE_SHA256` et le vérifie localement, pour sa seule copie. Une correction du moteur gagne à être reportée dans chaque dépôt, mais ce report n'est jamais vérifié entre dépôts : aucun contrôle ne compare les dépôts entre eux.
- Un test de présence du texte ne prouve rien sur le comportement. Chaque dépôt teste plutôt :
  - la durée et les cas du hook (§3) ;
  - la réutilisation d'une preuve quand l'arbre est identique ;
  - le fait que `verify:pr` et `verify:release` lancent bien les contrôles annoncés.

## 7. Décisions

| Question | Réponse |
| --- | --- |
| Q1 : Arbre modifié | Vérification sur une copie isolée du commit ; on ne touche pas au travail en cours |
| Q2 : Langue | Français pour le texte commun ; chaque dépôt garde sa langue pour le reste |
| Q3 : Source du texte et du moteur | Chaque dépôt a sa copie du texte et du moteur ; aucune n'est canonique ; la ligne Version commune relie les textes. Le même fichier moteur partout est recommandé ; chaque dépôt épingle son propre `ENGINE_SHA256` et le vérifie localement ; une correction gagne à être reportée partout, sans contrôle entre dépôts |
| Q4 : Durée du hook | Quelques secondes. Un dépassement entraîne une optimisation ou un déplacement, jamais un faux succès |
| Q5 : Lint | Ciblé et mis en cache quand du code change. Pas de lint global ajouté seulement pour uniformiser |
| Q6 : Dependabot | On ne fusionne jamais une PR Dependabot ; seules les alertes Dependabot restent actives (alertes seulement, PR automatiques de correctifs de sécurité désactivées) |
| Q7 : Aperçus | À la demande ; aucun déclenchement systématique |
| Q8 : CI externe | Jamais par défaut ; seulement sur demande explicite, là où un client, un partenaire ou un registre l'exige (§13) |
| Q9 : Format de la preuve | Commun aux cinq dépôts (§4) |
| Q10 : Dépendances de la copie isolée | Lier l'installation existante quand le lockfile est identique, sinon installer ; le mode de chaque dépôt est dans sa config (§4) |
| Q11 : Publication | `verify:release` sur le commit livré, sans réutilisation ; publier reste une décision explicite |

## 8. Adoption dans un dépôt

Un dépôt applique la règle quand il a :

- sa copie de ce fichier, au chemin qu'il choisit et qu'il donne dans sa §13.1, et, dans `AGENTS.md`, la section commune qui y renvoie ;
- le moteur, sa config `verify-local.config.mjs`, les commandes `verify:pr` et `verify:release`, et le hook `.githooks/pre-push` installé par `prepare` ;
- le modèle de PR commun (§5) ;
- des `requires.hint` qui disent de lancer le contrôle là où tourne `verify:pr`, puis comment le citer avec `--external` (§12) ;
- des workflows de CI en `workflow_dispatch` seulement, et des workflows de publication gardés comme le dit la §13 ;
- sa §13.1 : le chemin de sa copie de ce fichier, ses contrôles de push et sa table de CI externe.

## 9. Historique

| Version | Date | Changement |
| --- | --- | --- |
| v1 | 9 octobre 2026 | Première proposition, relue le même jour |
| v2 | 9 octobre 2026 | Hook rapide, `verify:pr` sur copie isolée, preuve liée à l'arbre, `verify:release` sans réutilisation ; adoptée par le propriétaire |
| v3 | 9 octobre 2026, soir | Local d'abord (§10), échelle de relecture (§11), preuve des contrôles spécialisés (§12), CI externe et garde des publications (§13) ; une copie par dépôt, aucune canonique ; texte commun sans état des lieux par dépôt |
| v4 | 9 octobre 2026, soir | Fil répondu **et** résolu avant fusion (§2.3, §11, modèle de PR) ; chemin de la règle choisi par chaque dépôt et donné dans sa §13.1 ; dans le modèle de PR, l'échelle de relecture renvoie en texte simple à la §11 de la règle du dépôt, sans lien (ni lien vers la branche principale, ni lien relatif) ; même fichier moteur recommandé, chaque dépôt n'épinglant et ne vérifiant que sa copie, une correction reportée de préférence partout mais jamais vérifiée entre dépôts (§6, Q3, §10, `AGENTS.md`) ; preuve spécialisée alignée sur la §12 : machine du propriétaire par défaut, source externe seulement si elle figure dans la CI externe du dépôt (§13, §13.1), et seulement sur le SHA de tête, jamais un commit de même arbre (§2.2, §2.4, §12, `AGENTS.md`, modèle de PR) |
| v5 | 9 octobre 2026, soir | `<SHA>` d'une preuve spécialisée = le commit vérifié : tête de la PR pour `verify:pr`, commit livré pour `verify:release`, jamais un autre commit même de même arbre (§2.2, §12, `AGENTS.md`) ; condition `main` des workflows de publication jointe à une condition de cible par `&&` seulement, jamais `||` (§13) ; `ENGINE_SHA256` épinglé par chaque dépôt et vérifié localement, sans dire où (§6, Q3, §10.1, `AGENTS.md`) ; v4 et v5 sur la ligne Statut |
| v6 | 10 octobre 2026 | Décision du propriétaire : la règle commune n'attribue plus aucune machine. Les rôles de machines (§10.3, colonne Machine de la §10.4, S5, `AGENTS.md`, modèle de PR) sont remplacés par une seule règle : l'agent lance les contrôles sur la machine où il s'exécute et dit dans `## Local proof` ce qu'elle ne peut pas lancer (§2.2, §10.3, §12). Preuve `--external` décrite sans rôle de machine, au format qu'exige le moteur. Dependabot : alertes seulement, PR automatiques de correctifs de sécurité désactivées (Q6, §10.5) |

## 10. Local d'abord : processus commun, dépôts indépendants

**Décision du propriétaire du 9 octobre 2026.**

1. **Processus commun, pas code commun.** Chaque dépôt possède sa copie du moteur, sa config, ses hooks et ce document. Le même fichier moteur partout est recommandé ; chaque dépôt épingle son propre `ENGINE_SHA256` et le vérifie localement. Un dépôt se vérifie seul : aucun contrôle entre dépôts, aucune empreinte d'un autre dépôt et aucun lien vers un autre dépôt n'est nécessaire. Le texte commun est recopié à l'identique dans chaque dépôt ; seule la §13.1 change. La copie de chaque dépôt fait foi pour lui.
2. **La CI externe ne tourne jamais par défaut.** GitHub Actions, CircleCI, GitLab CI, EAS Workflows et les builds Git de Vercel ou de Cloudflare ne se lancent que sur demande explicite, et seulement là où un client, un partenaire ou un registre l'exige. Chaque cas est listé dans la table de la §13 ; sans ligne dans cette table, aucune CI externe n'est attendue.
3. **Les contrôles tournent là où l'agent s'exécute.** L'agent lance les contrôles (`verify:pr`, `verify:release`, e2e) sur la machine où il s'exécute. Si cette machine ne peut pas lancer un contrôle, il le dit dans `## Local proof`. La règle ne nomme aucune machine et ne répartit jamais le travail entre elles.
4. **Étapes communes**, chaque dépôt avec ses propres commandes :

   | Étape | Commande | Bloque |
   | --- | --- | --- |
   | S0 push | hook `pre-push` : les contrôles de push du dépôt (§3, §13.1) | le push |
   | S1 PR | `verify:pr`, preuve collée dans `## Local proof` | la fusion (SHA de la preuve = tête de la PR) |
   | S2 contrôles spécialisés | contrôles qui portent `requires` dans la config | la fusion, quand la PR touche leurs chemins (§12) |
   | S3 relecture | relecture du CTO sur l'échelle de la §11 | la fusion |
   | S4 fusion | squash par le CTO | |
   | S5 après fusion | `verify:pr` facultatif sur le SHA de `main` | rien : signal seulement |
   | S6 publication | `verify:release` sur le commit livré | la publication, qui reste une décision explicite |

5. **Ce qui n'est pas de la CI reste tel quel** : crons d'exécution (Vercel Cron, crons d'un Worker), sauvegardes, alertes Dependabot (alertes seulement, PR automatiques de correctifs de sécurité désactivées).

## 11. Échelle de relecture

Chaque remarque de relecture porte un niveau :

| Niveau | Sens | Ce que fait l'auteur |
| --- | --- | --- |
| **bloquant** (blocker) | doit être corrigé avant la fusion | corrige, puis répond sur le fil avec le SHA de la correction |
| **à corriger** (should-fix) | à traiter dans cette PR | corrige dans cette PR, ou répond avec une raison, ou avec un suivi tracé (ticket ou issue) |
| **détail** (nit) | facultatif | corrige, ou décline par une réponse courte |

Chaque fil reçoit une réponse, puis est résolu. Aucune PR n'est fusionnée avec un fil sans réponse ou non résolu.

## 12. Preuve des contrôles spécialisés

- **Là où l'agent s'exécute.** L'agent lance chaque contrôle spécialisé sur la machine où il s'exécute (§10.3). Si elle ne peut pas l'exécuter (sa sonde `requires` échoue), il le dit dans `## Local proof`. Une exécution de ce contrôle sur le commit vérifié se cite ainsi :

  ```
  --external <contrôle>="owner-machine: <hôte> <note> on <SHA>"
  ```

  `<SHA>` est le commit vérifié : le SHA de tête de la PR pour `verify:pr`, le commit livré pour `verify:release` ; jamais un autre commit, même de même arbre. Pour une PR, c'est le `Commit SHA` de `## Local proof`. Ce format est celui qu'exige le moteur : `owner-machine:` y est un mot-clé fixe, `<hôte>` le nom de la machine qui a lancé le contrôle ; il n'attribue aucun rôle à une machine.

- **Une source externe seulement si elle est retenue pour ce dépôt.** Une preuve venue d'une CI externe (le lien de son exécution) n'est valable que si ce workflow figure dans la table de CI externe du dépôt (§13, §13.1), et seulement pour une exécution sur le commit vérifié (le SHA de tête de la PR pour `verify:pr`, le commit livré pour `verify:release`).
- La PR cite chaque preuve spécialisée dans sa section `## Specialised checks`, ou y écrit « none / out of scope ».

## 13. CI externe

Ce qui peut tourner hors des machines locales, qui l'exige et comment le lancer. Par défaut : rien.

| Workflow | Qui l'exige | Déclenchement | Notes |
| --- | --- | --- | --- |
| none | personne | | aucune CI externe par défaut |

**Workflows de publication.** Tout workflow qui publie (npm, PyPI, magasin d'applications, production) se garde ainsi :

- un `if: github.ref == 'refs/heads/main'` au niveau du job (joint à une éventuelle condition de cible par `&&` seulement, jamais par `||` ; `master` pour un dépôt dont c'est la branche principale), pour que rien ne soit extrait ni lancé sur une autre référence ;
- `environment: release` sur ce job : un environnement GitHub limité à la branche principale par sa règle de branches de déploiement, et qui porte les secrets de publication (secrets d'environnement, pas de copie au niveau du dépôt) ;
- jamais de contrôle de référence dans une étape : une étape tourne après l'extraction et l'installation, alors que le job détient déjà `id-token: write` et les secrets.

Un lancement manuel exécute le fichier de workflow de sa propre référence : le `if` seul peut être retiré sur une branche. La vraie garde est la règle de branches de l'environnement, que GitHub applique côté serveur quel que soit le fichier de la branche. Les éditeurs de confiance des registres (npm, PyPI) se lient aussi à cet environnement.

### 13.1 Propre à ce dépôt (clawdeals)

Cette sous-section est la seule partie de ce document qui diffère d'un dépôt à l'autre.

**Chemin de la règle (§6).** La copie de ce dépôt est `docs/regle-commune-livraison.md`.

**Contrôles de push (§3).** Le hook `.githooks/pre-push` lance `node scripts/verify-local.mjs hook` : les contrôles du moteur sur ce que le push envoie (fichiers interdits, secrets, taille au plus 10 Mo), puis le contrat `.gitignore` de `hook.checks` dans `verify-local.config.mjs` (`gitignore-env` : `.env` et `.env.local` ignorés, `.env.example` suivi), et enfin l'existence d'une preuve pour l'arbre poussé, qui ne bloque pas. `npm ci` l'installe par `prepare`.

**CI externe (§13).** Cette table remplace la ligne « none » ci-dessus.

| Workflow | Qui l'exige | Déclenchement | Notes |
| --- | --- | --- | --- |
| `sdk-release.yml`, cible `py` | PyPI (contrainte du registre, pas d'un client) | `workflow_dispatch` seulement, entrées `target: py` et `version` ; décision explicite de publier | La publication de confiance de PyPI exige une exécution GitHub Actions : le job de publication PyPI tourne dans ce workflow avec `id-token: write` (OIDC), et PyPI lie l'éditeur de confiance à ce dépôt, à ce fichier de workflow et à son environnement. Le job n'a pas encore `id-token: write` : la publication de confiance ne peut pas aboutir avant cet ajout (suivi connu). Garde des workflows de publication (§13) : `if: github.ref == 'refs/heads/main'` au niveau du job et environnement `release`, limité à `main`. |
| `sdk-release.yml`, cible `ts` | personne | `workflow_dispatch` seulement, entrées `target: ts` et `version` ; décision explicite de publier | publication npm du SDK TypeScript, avec le secret `NPM_TOKEN`. Le déplacement de `NPM_TOKEN` vers l'environnement `release` attend l'étape de thanh dans Settings (#18) : aujourd'hui l'environnement `release` n'a aucun secret et `NPM_TOKEN` est encore un secret du dépôt. Garde des workflows de publication (§13) : `if: github.ref == 'refs/heads/main'` au niveau du job et environnement `release`, limité à `main`. |
| `mcp-release.yml` | personne | `workflow_dispatch` seulement, entrée `version` ; décision explicite de publier | publication npm de `clawdeals-mcp` (éditeur de confiance npm lié à `mcp-release.yml`). Garde des workflows de publication (§13) : `if: github.ref == 'refs/heads/main'` au niveau du job et environnement `release`, limité à `main`. |
| `ci.yml`, `sdk-ci.yml`, `historical-corpus.yml` | personne | `workflow_dispatch` seulement (`gh workflow run <fichier> --ref <branche>`) | exécution sur un runner propre, sur demande ; jamais une condition de fusion ni de publication |

Dependency Graph (soumission dynamique de GitHub) et les alertes Dependabot (alertes seulement, PR automatiques de correctifs de sécurité désactivées) restent tels quels. Les crons d'exécution (`vercel.json`, `wrangler.jsonc`) ne sont pas de la CI.
