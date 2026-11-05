# Read-only PostGIS compatibility check

On 2026-11-05, connected Neon read-only queries checked project
blue-sky-13227894, branch br-dark-moon-b2oh8q0g, database neondb. The branch had
PostgreSQL 17.11 and PostGIS 3.5.0 in extensions; its public table count remained
zero. Queries used the existing neondb_owner connection, not the future app role.
No writes, temporary objects, credential reads or imports occurred.

Source catalog e00218c5ae94517cafb356b06337539d2a778d275c890687b047795829506491
reports PostGIS 3.3.7 in extensions. The reviewed source uses:
- listings.geo_point: stored generated extensions.geography(Point,4326).
- ST_MakePoint(float8,float8), ST_SetSRID(geometry,integer) and geometry-to-geography cast.
- Geography ST_Distance and ST_DWithin, plus partial GiST gist_geography_ops.

Required signatures exist on the checked target. Constructors and cast are
immutable. Distance/DWithin default use_spheroid=true; DWithin exposes its index
support function. The default geography GiST opclass has bounding-box strategy 3,
distance-order strategy 13 and eight support functions. Source sorting uses
ST_Distance, not explicit KNN ordering.

Synthetic SELECT assertions passed for Point/SRID typing, null-coordinate guards,
zero self-distance, symmetry, distance/radius boundaries, zero-radius self-match,
bounding-box overlap/disjoint points, distance ordering and cursor comparison.
For synthetic (0,0) to (0.01,0), the computed distance was 1113.19490793 metres:
outside 1 km and inside 2 km.

Preserve source RPC search_path pg_catalog,public,extensions or explicitly qualify
calls. The target session defaults to "$user",public; unqualified calls cannot
assume extensions is visible. Generated-column references already qualify it.

This reduces the missing-extension/signature risk only. It does not validate full
application RPCs, actual index creation or query plans, performance, source-data
edge cases, app-role privileges or exact numerical equivalence between versions.
Fresh checks on the eventual import target and same-archive schema remain gates.
