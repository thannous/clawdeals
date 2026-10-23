# Migration Supabase vers Neon et Vercel Blob

Ce guide couvre les adaptateurs et outils présents dans le dépôt. Leur presence
ne prouve ni une migration achevée ni la disponibilité de ressources distantes.
Les évaluations et répétitions datées restent dans l'historique Git de ce fichier.
La [politique d'environnement](./release-environments.md) ne débloque pas les exports
de production, les bascules de services ou la suppression de ressources.

## Adaptateurs disponibles

Les [sélecteurs](../src/server/config/backends.ts) utilisent Supabase par défaut :

| Domaine | Configuration | Portée |
| --- | --- | --- |
| Base | `CLAWDEALS_DATABASE_BACKEND=neon`, `DATABASE_URL` | Seul `watchlist_signups` est adapté ; les autres domaines restent couplés à Supabase. |
| Auth | `CLAWDEALS_AUTH_BACKEND=neon`, `NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND=neon` | Basculer ensemble les flags serveur et navigateur ; configurer `NEON_AUTH_BASE_URL` et `NEON_AUTH_COOKIE_SECRET`. |
| Stockage | `CLAWDEALS_OBJECT_STORAGE_BACKEND=vercel-blob` | Surcharge indépendante via `CLAWDEALS_LISTING_STORAGE_BACKEND` et `CLAWDEALS_EVIDENCE_STORAGE_BACKEND`. |

Le [client Neon SQL](../src/server/db/neon.ts) est initialisé à la demande.
Le [proxy Auth](../src/server/auth/neon-auth.ts) utilise le SDK Neon ; le bridge
vérifie l'identité externe avant d'émettre la session propriétaire ClawDeals.
Les liens génériques conservent les identités Supabase pour permettre le retour.
Ne pas supposer qu'un import des mots de passe est supporté : vérifier la procédure
du fournisseur et les identités OAuth avant une migration d'utilisateurs.

Les photos publiques utilisent `LISTING_PHOTOS_BLOB_READ_WRITE_TOKEN` et les
preuves privées `EVIDENCE_BLOB_READ_WRITE_TOKEN` ; les adaptateurs acceptent aussi
`BLOB_READ_WRITE_TOKEN` en repli. Utiliser des stores public/prive et tokens dédiés.
Les anciennes clés Supabase et nouvelles URLs Blob coexistent ; la suppression
choisit le provider du locator. Les preuves restent soumises aux réservations,
droits d'accès, limites MIME/taille, expiration et vérification SHA-256.
Voir [photos](../src/server/services/listing-media-storage.ts) et
[preuves](../src/server/storage/evidence-storage.ts).

## Exporter une source non-production

Prérequis : source non-production identifiée, `pg_dump` pour la base et espace
protégé pour les fichiers. Ne jamais afficher ou versionner les identifiants.

- Base : `SUPABASE_DB_URL`, plus `SUPABASE_PROJECT_REF` si le ref ne peut être
  déduit de l'URL ou du nom d'utilisateur du pooler.
- Storage : `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` non-production.

Inspecter d'abord le plan ; rien n'est exporté sans `--execute` :

```sh
npm run migration:export:db
npm run migration:export:storage
npm run migration:export:db -- --execute
npm run migration:export:storage -- --execute
npm run migration:prepare:neon -- --input=migration-artifacts/EXPORT/supabase-public.sql
```

Les outils refusent le projet de production connu. Le flag de tests sur données
fictives ne change pas ce refus. Leurs sorties sont contraintes à
`migration-artifacts/`, ignoré par Git : dump complet, dump `public` sans ownership
ni privilèges, objets `listing-photos`/`evidence` et manifestes SHA-256.
La préparation produit `neon-public.sql` et un manifeste ; elle ajoute les
extensions, retire les policies Data API/RLS forcé du baseline serveur et refuse
les references Supabase restantes. Cela exige une revue des protections avant
import ; ce n'est pas un remplacement automatique de la politique d'autorisation.
Chiffrer les exports au repos et utiliser un canal et une retention approuves.

## Répétition et bascule

1. Faire preparer par le propriétaire les ressources Neon, Auth et Blob nécessaires,
   les secrets, OAuth/callbacks et les origines autorisees. Aucun secret present
   ne prouve que le service est correctement configuré.
2. Importer sur une base isolée et comparer tables, contraintes, index, fonctions,
   rôles, `GRANT`/`REVOKE`, RLS et `SECURITY DEFINER`/`search_path`. Vérifier
   `pgcrypto`, PostGIS et les references `storage.*` avant l'import.
3. Migrer les domaines un par un, avec requetes paramétrées et RPC atomiques.
   Une séquence lecture/verrou/écriture ne doit pas devenir plusieurs appels HTTP
   indépendants. Comparer les parcours reels avec les deux backends.
4. Copier les objets et vérifier leurs manifestes. Tester MIME, taille, hash,
   upload interrompu, expiration, nettoyage et refus d'accès aux preuves privées.
   Servir celles-ci après autorisation avec `private, no-store` et `nosniff`.
5. Tester inscription, login, OAuth, reset, vérification email, logout, bridge,
   conflits d'identité, suspension, expiration et rotation de session. Vérifier
   la coexistence Supabase/Neon sans doublon ni prise de contrôle de compte.
6. Répéter export/import, delta, gel des écritures, contrôles et retour arrière.
   Obtenir l'autorisation de bascule avant de modifier la production ; changer
   les sélecteurs separement et vérifier les parcours affectes après publication.

## Retour arrière

Remettre le selecteur précédent seulement si les écritures restent compatibles.
Un retour de Neon à Supabase peut perdre les nouvelles écritures : prévoir un
delta/dual-write validé ou une fenêtre de gel. Restaurer les deux flags Auth
ensemble ; conserver les liens d'identité et la lecture des anciens objets.
Un rollback Vercel ne restaure ni base, ni objets, ni configuration distante.
Retirer dépendances, secrets et ressources Supabase seulement après observation,
sauvegarde restaurable et autorisation explicite de suppression.
