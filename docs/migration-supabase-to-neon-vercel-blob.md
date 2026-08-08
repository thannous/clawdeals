# Migration Supabase vers Neon PostgreSQL, Neon Auth et Vercel Blob

Statut : audit initial et première couture réversible. Aucune ressource Supabase
externe n'a été modifiée, et aucun export de production n'a été exécuté.

## 1. Baseline et périmètre audité

- Baseline Git auditée : `e308bfd9ebffbbcfe778cf8a2c8c59720aa1b3f8`.
- Le worktree Codex est détaché sur cette baseline ; aucune branche ni PR n'a été
  créée.
- `@supabase/supabase-js` est une dépendance de production. Le lockfile résout
  actuellement la famille Supabase JS `2.94.1` malgré la plage déclarée
  `^2.49.1`.
- 198 fichiers de `src/`, `scripts/` et `e2e/` importent directement Supabase,
  appellent `getSupabaseServiceClient`, utilisent le helper E2E Supabase, ou les
  simulent dans les tests.
- Hors tests, 81 fichiers sous `src/` sont couplés au client Supabase : 71 dans
  `src/server`, 9 routes Pages API et le client navigateur d'authentification.
- Les migrations sont impératives : 124 fichiers dans `supabase/migrations/`,
  environ 15 841 lignes SQL.
- Le schéma applicatif contient au moins 51 tables, 33 déclarations de types et
  9 créations de vues. Les appels applicatifs couvrent 56 noms passés à
  `.from(...)` et 627 occurrences dans le code et les tests.
- 42 RPC distinctes sont appelées depuis TypeScript/JavaScript (50 sites
  d'appel). Elles comprennent les transitions transactionnelles sensibles des
  offres, escrows, litiges, preuves, installations et files de traitement.

Ces chiffres sont un inventaire statique. Ils devront être complétés par un
inventaire live en lecture seule (`pg_catalog`, tailles, contraintes, extensions,
objets Storage et utilisateurs Auth) sur une branche ou une copie non-production.

## 2. Base PostgreSQL

### Ce qui est portable sans réécriture fonctionnelle

- Le modèle reste PostgreSQL : tables, contraintes, index, triggers, fonctions
  PL/pgSQL, JSONB, full-text search et transactions peuvent rester en SQL.
- `pgcrypto` et PostGIS sont les seules extensions applicatives repérées. Neon
  les prend en charge, mais l'emplacement de PostGIS doit être validé : une
  migration Supabase déplace explicitement PostGIS dans le schéma `extensions`.
- Aucune référence `auth.uid()` n'a été trouvée. L'autorisation métier est
  principalement réalisée dans les services et RPC avec un client privilégié,
  ce qui évite de devoir reproduire immédiatement des politiques RLS liées à un
  JWT Supabase.

### Éléments Supabase à adapter

- Les rôles `anon`, `authenticated` et `service_role`, ainsi que leurs `GRANT` et
  `REVOKE`, sont propres au modèle Supabase. Un baseline Neon ne doit pas
  supposer leur existence.
- 56 activations RLS et 54 créations de policies ont été repérées. La majorité
  sont des policies de refus pour `anon`/`authenticated`. Elles doivent être
  classées en trois groupes : défense en profondeur à conserver, artefacts Data
  API Supabase à omettre, et politiques à réécrire pour Neon Auth/Data API.
- Deux fonctions `SECURITY DEFINER` ont été repérées. Elles exigent un contrôle
  séparé du propriétaire, du `search_path`, des droits `EXECUTE` et du
  comportement RLS avant import.
- `20260713095350_evidence_upload_reservations_v1.sql` modifie
  `storage.buckets` : cette instruction doit être retirée du baseline Neon et
  remplacée par une validation Vercel Blob côté application/configuration.
- Les 42 RPC doivent rester des fonctions PostgreSQL dans la première phase.
  Chaque appel `.rpc("fn", payload)` sera remplacé par un appel SQL explicite et
  paramétré, par exemple `select * from public.fn($1, $2)`. Les noms de fonction,
  colonne ou table ne doivent jamais provenir d'une entrée utilisateur et les
  valeurs doivent utiliser le tag SQL Neon ou des placeholders numérotés.
- Les 627 appels `.from(...)` rendent une émulation complète de PostgREST trop
  risquée. La migration doit introduire des repositories par domaine et convertir
  verticalement un service et ses tests à la fois.

### Première couture ajoutée

- `CLAWDEALS_DATABASE_BACKEND=supabase|neon`, avec `supabase` comme défaut de
  rollback.
- `getNeonSql()` crée paresseusement le client `@neondatabase/serverless` depuis
  `DATABASE_URL`. Un build ou un déploiement encore sur Supabase n'a donc pas
  besoin d'un secret Neon.
- Le client expose des requêtes taguées/paramétrées et des transactions HTTP
  non-interactives. Les workflows qui nécessitent lecture puis écriture sous
  verrou devront rester dans une fonction PostgreSQL atomique ou utiliser une
  connexion transactionnelle adaptée ; ils ne doivent pas être découpés en
  appels HTTP indépendants.
- `watchlist_signups` est le premier domaine migré verticalement. Avec
  `CLAWDEALS_DATABASE_BACKEND=neon`, l'insertion utilise une requête Neon taguée
  et conserve exactement la sémantique `created`/`already_registered`. Sans ce
  flag, le service continue d'utiliser Supabase.

## 3. Authentification

### Flux actuels

L'application a deux couches distinctes :

1. Supabase Auth côté navigateur pour email/mot de passe, inscription, Google
   OAuth, reset de mot de passe, callback PKCE, session locale et logout.
2. Une session propriétaire Clawdeals (`owner_sessions`) émise par
   `/api/v1/auth/session:bridge` après validation d'un access token Supabase.
   `owner_auth_links.supabase_user_id` relie ensuite l'identité externe à
   `owners`.

Un second flux magic-link propriétaire existe déjà et ne dépend pas de Supabase
Auth pour l'émission finale de la session Clawdeals.

### Conséquences pour Neon Auth

- Le Neon Auth actuel (depuis décembre 2025) est fondé sur Better Auth et stocke
  utilisateurs, sessions, organisations et JWKS dans `neon_auth.*`. Il ne faut
  pas suivre aveuglément les anciens guides Neon Auth/Stack Auth de 2025.
- Le SDK serveur Neon Auth installé est actuellement `0.4.2-beta` (aucune
  version stable équivalente n'était publiée lors de l'audit). Il utilise
  `createNeonAuth()` et exige
  `NEON_AUTH_BASE_URL` et `NEON_AUTH_COOKIE_SECRET`. Les exemples officiels sont
  principalement App Router alors que Clawdeals est en Pages Router. Un Route
  Handler limité à `/api/auth/[...path]` a donc été ajouté pour proxyfier Neon
  Auth, sans déplacer les pages existantes.
- Une migration de mots de passe sans reset ne sera pas supposée. Il faut obtenir
  la procédure officielle actuelle d'import Better Auth/Neon Auth, vérifier les
  algorithmes présents dans `auth.users.encrypted_password`, les identités OAuth,
  les emails vérifiés et les comptes sans mot de passe. À défaut de procédure
  supportée, prévoir une campagne de reset contrôlée.
- La migration additive `20260807120103_generic_auth_identities.sql` ajoute
  `auth_provider` et `auth_subject`, backfille les liens Supabase et rend
  `supabase_user_id` nullable sans supprimer la colonne ni ses données. Les
  services conservent leurs wrappers Supabase pendant la fenêtre de rollback.
- `CLAWDEALS_AUTH_BACKEND=supabase|neon` et
  `NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND=supabase|neon` ont été ajoutés, avec
  Supabase par défaut. Le client navigateur Neon utilise l'adaptateur de
  compatibilité Supabase du SDK afin de conserver les écrans login/callback/reset.
- Le bridge de session vérifie maintenant une identité externe générique. En
  mode Neon, il exige le cookie `__Secure-neon-auth.*`, ne transmet à Neon aucun
  autre cookie Clawdeals, relit la session à l'origine et compare en temps
  constant son token au bearer reçu. Il lie ensuite le sujet opaque avec
  `auth_provider=neon`. Ce chemin reste inactif tant que les deux flags et les
  secrets Neon ne sont pas configurés.
- Le paquet beta Neon Auth dépend transitivement de `@supabase/auth-js`. Cette
  dépendance de compatibilité empêche encore de déclarer l'arbre npm totalement
  débarrassé de Supabase ; elle devra être réévaluée avant la suppression finale.

### Tests obligatoires avant bascule

- inscription, login email/mot de passe, Google OAuth, callback et erreurs OAuth ;
- reset de mot de passe, vérification email, logout local et révocation serveur ;
- bridge vers `owner_sessions`, liaison par email vérifié, conflit email non
  vérifié, suspension, expiration et rotation des cookies ;
- coexistence temporaire d'un sujet Supabase et d'un sujet Neon pour le même
  owner, sans création de doublon ni prise de contrôle de compte ;
- preview Vercel sur branche Neon isolée et rollback du provider d'auth.

## 4. Storage vers Vercel Blob

### Usages actuels

- `listing-photos` : upload serveur d'images JPEG/PNG/WebP, lecture publique via
  URL Supabase et suppression lors d'un rollback de draft Telegram.
- `evidence` : bucket privé, types JPEG/PNG/WebP/PDF, limite de 50 MiB, URLs
  d'upload signées, réservations SQL, expiration/nettoyage, vérification taille,
  type MIME et SHA-256 avant finalisation.
- Un script d'exploitation purge le bucket `evidence`; il ne doit pas être
  utilisé pendant la migration.

### Découpage Vercel Blob retenu

- Deux stores distincts sont nécessaires car le mode public/privé est fixé à la
  création du store : public pour les images de listings réellement publiques,
  privé pour les preuves.
- Les preuves privées devront être servies uniquement par une Function qui
  authentifie et autorise l'acteur avant `get()`, avec
  `Cache-Control: private, no-store` pour les pièces sensibles et
  `X-Content-Type-Options: nosniff`.
- Les objets doivent être immuables, avec un pathname UUID. On évite ainsi les
  lectures éventuellement périmées après overwrite et on préserve l'intégrité
  du manifeste.
- L'upload direct des preuves exigera un endpoint serveur émettant un token
  client limité au pathname, au type MIME et à la taille, puis le même protocole
  SQL de réservation/confirmation et calcul SHA-256 qu'aujourd'hui.

### Première couture ajoutée

- `CLAWDEALS_OBJECT_STORAGE_BACKEND=supabase|vercel-blob`, Supabase par défaut.
  `CLAWDEALS_LISTING_STORAGE_BACKEND` et
  `CLAWDEALS_EVIDENCE_STORAGE_BACKEND` peuvent surcharger séparément ce choix,
  afin de ne jamais basculer les deux flux en même temps.
- Les nouveaux uploads de photos peuvent être activés sur Vercel Blob avec
  `LISTING_PHOTOS_BLOB_READ_WRITE_TOKEN` (ou le standard
  `BLOB_READ_WRITE_TOKEN`). Leur URL Blob complète est conservée dans
  `storage_key`, format déjà accepté par l'UI.
- La suppression choisit le provider à partir du locator. Une ancienne clé
  relative Supabase et une nouvelle URL Blob peuvent donc coexister pendant la
  copie, la double lecture et le rollback.
- Le flux `evidence` reste intentionnellement sur Supabase par défaut. Son
  adaptateur Vercel Blob privé est prêt derrière
  `CLAWDEALS_EVIDENCE_STORAGE_BACKEND=vercel-blob` et
  `EVIDENCE_BLOB_READ_WRITE_TOKEN`. Il émet un PUT signé limité au pathname,
  aux MIME autorisés, à 50 MiB et à deux heures, interdit l'overwrite, relit
  l'origine sans cache pour le SHA-256 et conserve un identifiant de provider
  distinct (`vercel-blob-private`) dans la réservation SQL. La bascule ne doit
  être activée qu'après création et validation live du store privé.

## 5. Exports réversibles

Deux scripts en lecture seule ont été ajoutés. Ils refusent explicitement le
projet Supabase de production connu et n'effectuent rien sans `--execute`.

```text
npm run migration:export:db
npm run migration:export:storage
```

- Base : définir `SUPABASE_DB_URL` vers une base non-production, ainsi que
  `SUPABASE_PROJECT_REF` si le ref ne peut pas être déduit de l'URL/username du
  pooler, et disposer de `pg_dump`. Lancer ensuite
  `npm run migration:export:db -- --execute`. Le résultat contient un dump SQL
  complet d'archive et un dump limité au schéma `public`, sans ownership ni
  privileges, plus un manifeste SHA-256 sous `migration-artifacts/`.
- Préparation Neon : lancer
  `npm run migration:prepare:neon -- --input=migration-artifacts/.../supabase-public.sql`.
  Le script ajoute `pgcrypto`/PostGIS, retire les policies Data API et le RLS
  forcé du baseline serveur, puis échoue si un schéma ou rôle Supabase subsiste.
  Il produit `neon-public.sql` et un manifeste de transformation avec checksums.
- Fichiers : définir `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` non-production,
  puis lancer `npm run migration:export:storage -- --execute`. Les buckets
  `listing-photos,evidence` sont exportés avec taille, type MIME et SHA-256.
- Les artefacts sont gitignorés et sensibles. Ils doivent être chiffrés au repos,
  transférés par un canal approuvé et supprimés selon une politique validée.
- L'export de production restera bloqué tant qu'une intervention explicite n'aura
  pas validé la fenêtre, le stockage chiffré, les responsables, la cohérence et
  le plan de retour arrière.

## 6. Plan de bascule et rollback

1. Créer via Vercel Marketplace un projet Neon et une branche de répétition ;
   activer `pgcrypto`, PostGIS et Neon Auth. Créer deux stores Blob, public et
   privé, dans une région conforme aux exigences produit.
2. Exporter une source non-production, construire un baseline Neon portable et
   vérifier tables, contraintes, index, triggers, vues et fonctions par
   inventaires comparés et requêtes de smoke test.
3. Migrer un domaine SQL à faible risque vers un repository Neon. Garder le
   sélecteur Supabase et exécuter les tests unitaires + intégration du domaine.
4. Répéter par domaine, en conservant les RPC atomiques. Migrer ensuite les
   helpers E2E afin que la même suite puisse viser Supabase ou Neon.
5. Copier les photos, vérifier le manifeste, activer les nouvelles écritures
   Blob, puis garder la lecture/suppression mixte pendant la période de rollback.
6. Implémenter et tester le flux privé des preuves, y compris upload interrompu,
   mauvais MIME, mauvaise taille, mauvais hash, expiration et nettoyage.
7. Sur une branche Neon de base de données isolée, importer un jeu
   d'utilisateurs de test, appliquer/backfiller les liens génériques, configurer
   le proxy Auth puis exécuter tous les parcours Auth. Les deux flags Auth
   serveur/public doivent toujours être basculés ensemble.
8. Faire une répétition complète : export, import, delta, gel court des écritures,
   contrôles de comptage/checksum, bascule Vercel et tests critiques.
9. En production, basculer chaque sélecteur séparément. Le rollback consiste à
   remettre le sélecteur précédent, tant qu'aucune écriture incompatible n'a été
   acceptée. Pour la base, une stratégie de delta/dual-write ou une fenêtre de
   gel est indispensable afin d'éviter la perte des écritures Neon au retour.
10. Supprimer `@supabase/supabase-js`, les variables, migrations et ressources
    Supabase uniquement après une période d'observation, une validation explicite
    et une sauvegarde restaurable. Aucun projet, fichier, secret ou donnée
    Supabase ne doit être supprimé automatiquement.

## 7. Interventions et identifiants requis

Les actions suivantes nécessitent un propriétaire Neon/Vercel et ne sont pas
réalisables depuis le dépôt seul :

- connecter le projet Vercel au Marketplace Neon et fournir `DATABASE_URL`
  (et une URL directe/non poolée pour les migrations si nécessaire) ;
- créer/configurer Neon Auth par environnement, fournir `NEON_AUTH_BASE_URL` et
  un `NEON_AUTH_COOKIE_SECRET` stable d'au moins 32 caractères, puis configurer
  Google OAuth, domaines/callbacks, SMTP et trusted origins ;
- créer les stores Blob public et privé, les connecter au projet et fournir les
  tokens séparés ;
- fournir des identifiants Supabase non-production pour les répétitions ;
- approuver séparément tout export de production, toute fenêtre de gel/bascule,
  tout changement DNS/Vercel et toute suppression finale.

## 8. Documentation fournisseur vérifiée

- Neon Auth branchable (architecture Better Auth, décembre 2025) :
  https://neon.com/blog/neon-auth-branchable-identity-in-your-database
- Neon Auth SDK serveur v0.2 :
  https://neon.com/docs/auth/migrate/from-auth-v0.1
- Vercel Blob privé :
  https://vercel.com/docs/vercel-blob/private-storage
- Vercel Blob : https://vercel.com/docs/vercel-blob
- Supabase changelog breaking changes :
  https://supabase.com/changelog?types=breaking-change

## 9. État externe de la répétition (7 août 2026)

Les ressources suivantes ont été créées sans modifier ni supprimer aucune
ressource Supabase :

- organisation Neon `Clawdeals`, projet `clawdeals-migration`
  (`blue-sky-13227894`), PostgreSQL 17, AWS Europe Central 1 (Francfort) ;
- branche Neon de production laissée intacte (`br-gentle-mouse-b2m1xkta`) et
  branche isolée `migration-rehearsal` (`br-dark-moon-b2oh8q0g`) ;
- extensions `pgcrypto` 1.3 et PostGIS 3.5.0 activées uniquement sur la branche
  de répétition ;
- `DATABASE_URL` de la branche de répétition enregistrée comme variable Vercel
  sensible pour Preview uniquement ;
- store Blob public `clawdeals-listing-photos-public` et store Blob privé
  `clawdeals-evidence-private`, tous deux en `cdg1` (Paris), connectés au projet
  Vercel avec des variables distinctes pour Production et Preview.

Les sélecteurs applicatifs restent tous sur `supabase`. La présence des tokens
Blob en Production n'active donc aucun nouveau chemin, et `DATABASE_URL` n'est
pas exposée en Production.

### Blocages constatés

- L'activation Neon Auth échoue côté fournisseur sur les deux branches avec
  `NEON_AUTH_SCHEMA_NOT_FOUND` (`neon_auth` inaccessible ou absent). Aucun
  schéma fournisseur n'a été créé manuellement. Il faut résoudre ce point avec
  Neon avant de définir les flags Auth ou d'importer des utilisateurs.
- Aucun identifiant Supabase non-production n'est disponible. Le schéma métier
  et les données n'ont donc pas été exportés/importés sur la branche de
  répétition. Les scripts gardés en lecture seule continuent de refuser le
  projet de production.
- La bascule Vercel et la suppression des dépendances Supabase restent bloquées
  jusqu'à l'import contrôlé, aux tests live Auth/SQL/Blob et à la validation du
  rollback.

Un ancien mot de passe de rôle Neon affiché accidentellement pendant la
configuration a été immédiatement renouvelé avant l'enregistrement final dans
Vercel. L'ancienne chaîne de connexion est invalide et aucun secret n'est
consigné dans ce document ou dans Git.
