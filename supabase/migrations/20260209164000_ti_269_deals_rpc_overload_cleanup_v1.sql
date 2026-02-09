-- TI-269: Cleanup older list_deals_*_v0 RPC overloads without p_price_max.
--
-- Why: `create or replace function` with a different signature creates a new overload.
-- PostgREST RPC calls that omit `p_price_max` become ambiguous when both overloads exist.
-- We drop the 7-arg overloads and keep the newer 8-arg versions (with default p_price_max).

do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schemaname,
      p.proname as funcname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('list_deals_new_v0', 'list_deals_temp_v0', 'list_deals_trend_v0')
      and p.pronargs = 7
  loop
    execute format('drop function if exists %I.%I(%s);', r.schemaname, r.funcname, r.args);
  end loop;
end $$;

