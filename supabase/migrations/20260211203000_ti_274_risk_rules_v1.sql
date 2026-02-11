-- TI-274: Risk rules engine v1 (configurable automatic flags)
--
-- Adds:
-- - risk_rules configuration table
-- - risk_rule_state idempotency/cooldown table per (rule, agent)
-- - candidate aggregation function from audit_logs
-- - atomic trust flag add/remove helpers for risk automation

create extension if not exists "pgcrypto";

create table if not exists public.risk_rules (
  risk_rule_id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  signal_type text not null,
  threshold int not null,
  window_seconds int not null,
  cooldown_seconds int not null,
  flag text not null,
  enabled boolean not null default true,
  description text,
  created_by uuid,
  updated_by uuid,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint risk_rules_signal_type_check check (
    signal_type in ('rate_limit_triggers', 'duplicates_detected', 'disputes_opened')
  ),
  constraint risk_rules_threshold_check check (threshold > 0),
  constraint risk_rules_window_seconds_check check (window_seconds > 0),
  constraint risk_rules_cooldown_seconds_check check (cooldown_seconds >= 0),
  constraint risk_rules_flag_check check (
    flag in ('noisy_client', 'under_review', 'restricted')
  )
);

create index if not exists risk_rules_enabled_signal_idx
  on public.risk_rules (enabled, signal_type);

create table if not exists public.risk_rule_state (
  risk_rule_id uuid not null references public.risk_rules(risk_rule_id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  last_triggered_at timestamptz not null,
  last_observed_count int not null,
  last_flag text not null,
  updated_at timestamptz not null default now(),
  primary key (risk_rule_id, agent_id),
  constraint risk_rule_state_last_observed_count_check check (last_observed_count >= 0),
  constraint risk_rule_state_last_flag_check check (
    last_flag in ('noisy_client', 'under_review', 'restricted')
  )
);

create index if not exists risk_rule_state_last_triggered_idx
  on public.risk_rule_state (last_triggered_at desc);

alter table public.risk_rules enable row level security;
alter table public.risk_rules force row level security;

drop policy if exists deny_all_anon_authenticated on public.risk_rules;
create policy deny_all_anon_authenticated
on public.risk_rules
for all
to anon, authenticated
using (false)
with check (false);

alter table public.risk_rule_state enable row level security;
alter table public.risk_rule_state force row level security;

drop policy if exists deny_all_anon_authenticated on public.risk_rule_state;
create policy deny_all_anon_authenticated
on public.risk_rule_state
for all
to anon, authenticated
using (false)
with check (false);

insert into public.risk_rules (
  rule_key,
  signal_type,
  threshold,
  window_seconds,
  cooldown_seconds,
  flag,
  enabled,
  description
)
values
  (
    'rate_limit_triggers_1h',
    'rate_limit_triggers',
    12,
    3600,
    3600,
    'noisy_client',
    true,
    'Auto-flag noisy clients when rate limit events exceed threshold within one hour.'
  ),
  (
    'duplicates_detected_24h',
    'duplicates_detected',
    4,
    86400,
    86400,
    'under_review',
    true,
    'Auto-flag agents repeatedly triggering listing duplicate detection in 24 hours.'
  ),
  (
    'disputes_opened_7d',
    'disputes_opened',
    3,
    604800,
    604800,
    'restricted',
    true,
    'Auto-flag agents opening too many disputes over seven days.'
  )
on conflict (rule_key) do update
set
  signal_type = excluded.signal_type,
  threshold = excluded.threshold,
  window_seconds = excluded.window_seconds,
  cooldown_seconds = excluded.cooldown_seconds,
  flag = excluded.flag,
  enabled = excluded.enabled,
  description = excluded.description,
  updated_at = now();

create or replace function public.risk_rule_candidates_v1(
  p_signal_type text,
  p_window_seconds int,
  p_threshold int,
  p_max_agents int default 1000
)
returns table (
  agent_id uuid,
  signal_count int
)
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_window interval;
  v_limit int := greatest(1, least(coalesce(p_max_agents, 1000), 10000));
  v_uuid_regex constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if p_signal_type not in ('rate_limit_triggers', 'duplicates_detected', 'disputes_opened') then
    raise exception 'VALIDATION_ERROR:SIGNAL_TYPE';
  end if;

  if p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'VALIDATION_ERROR:WINDOW_SECONDS';
  end if;

  if p_threshold is null or p_threshold <= 0 then
    raise exception 'VALIDATION_ERROR:THRESHOLD';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  if p_signal_type = 'rate_limit_triggers' then
    return query
    with filtered as (
      select al.auth->>'agent_id' as agent_id_text
      from public.audit_logs al
      where al.occurred_at >= now() - v_window
        and al.request->>'status_code' = '429'
    )
    select
      filtered.agent_id_text::uuid as agent_id,
      count(*)::int as signal_count
    from filtered
    where filtered.agent_id_text ~* v_uuid_regex
    group by filtered.agent_id_text
    having count(*) >= p_threshold
    order by count(*) desc, filtered.agent_id_text::uuid asc
    limit v_limit;
    return;
  end if;

  if p_signal_type = 'duplicates_detected' then
    return query
    with filtered as (
      select al.auth->>'agent_id' as agent_id_text
      from public.audit_logs al
      where al.occurred_at >= now() - v_window
        and al.action->>'event' = 'listing.duplicate_detected'
    )
    select
      filtered.agent_id_text::uuid as agent_id,
      count(*)::int as signal_count
    from filtered
    where filtered.agent_id_text ~* v_uuid_regex
    group by filtered.agent_id_text
    having count(*) >= p_threshold
    order by count(*) desc, filtered.agent_id_text::uuid asc
    limit v_limit;
    return;
  end if;

  return query
  with filtered as (
    select al.auth->>'agent_id' as agent_id_text
    from public.audit_logs al
    where al.occurred_at >= now() - v_window
      and al.action->>'event' = 'dispute.opened'
  )
  select
    filtered.agent_id_text::uuid as agent_id,
    count(*)::int as signal_count
  from filtered
  where filtered.agent_id_text ~* v_uuid_regex
  group by filtered.agent_id_text
  having count(*) >= p_threshold
  order by count(*) desc, filtered.agent_id_text::uuid asc
  limit v_limit;
end;
$$;

create or replace function public.add_agent_trust_flag_if_missing_v1(
  p_agent_id uuid,
  p_flag text
)
returns boolean
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_already_flagged boolean;
begin
  if p_flag not in ('noisy_client', 'under_review', 'restricted') then
    raise exception 'VALIDATION_ERROR:FLAG';
  end if;

  select coalesce(a.trust_flags, '[]'::jsonb) ? p_flag
  into v_already_flagged
  from public.agents a
  where a.id = p_agent_id
  for update;

  if not found then
    return null;
  end if;

  if v_already_flagged then
    return false;
  end if;

  update public.agents a
  set
    trust_flags = coalesce(a.trust_flags, '[]'::jsonb) || jsonb_build_array(p_flag),
    trust_updated_at = now(),
    updated_at = now()
  where a.id = p_agent_id;

  return true;
end;
$$;

create or replace function public.remove_agent_trust_flag_v1(
  p_agent_id uuid,
  p_flag text
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_flags jsonb;
begin
  if p_flag not in ('noisy_client', 'under_review', 'restricted') then
    raise exception 'VALIDATION_ERROR:FLAG';
  end if;

  update public.agents a
  set
    trust_flags = coalesce(
      (
        select jsonb_agg(flag_value)
        from jsonb_array_elements_text(coalesce(a.trust_flags, '[]'::jsonb)) as flag_value
        where flag_value <> p_flag
      ),
      '[]'::jsonb
    ),
    trust_updated_at = case
      when coalesce(a.trust_flags, '[]'::jsonb) ? p_flag then now()
      else a.trust_updated_at
    end,
    updated_at = case
      when coalesce(a.trust_flags, '[]'::jsonb) ? p_flag then now()
      else a.updated_at
    end
  where a.id = p_agent_id
  returning a.trust_flags into v_flags;

  return v_flags;
end;
$$;

create index if not exists audit_logs_agent_status_429_idx
  on public.audit_logs (((auth->>'agent_id')), occurred_at desc)
  where request->>'status_code' = '429';

create index if not exists audit_logs_agent_duplicate_event_idx
  on public.audit_logs (((auth->>'agent_id')), occurred_at desc)
  where action->>'event' = 'listing.duplicate_detected';

create index if not exists audit_logs_agent_dispute_opened_event_idx
  on public.audit_logs (((auth->>'agent_id')), occurred_at desc)
  where action->>'event' = 'dispute.opened';
