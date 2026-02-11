-- TI-331: Installation-scoped OAuth scopes v1
--
-- Store granted scopes per installation so that both OAuth access tokens and
-- installation-scoped API keys can be authorized consistently.

alter table public.agent_installations
  add column if not exists oauth_scopes text[] not null default array[
    'watchlists:read',
    'watchlists:write',
    'listings:read',
    'listings:write',
    'threads:read',
    'threads:write',
    'offers:read',
    'offers:write',
    'deals:read',
    'reports:write',
    'notifications:read'
  ]::text[];

-- Backfill legacy rows (defensive): ensure every installation has the default bundle.
update public.agent_installations
   set oauth_scopes = array[
     'watchlists:read',
     'watchlists:write',
     'listings:read',
     'listings:write',
     'threads:read',
     'threads:write',
     'offers:read',
     'offers:write',
     'deals:read',
     'reports:write',
     'notifications:read'
   ]::text[]
 where oauth_scopes is null
    or cardinality(oauth_scopes) = 0;

