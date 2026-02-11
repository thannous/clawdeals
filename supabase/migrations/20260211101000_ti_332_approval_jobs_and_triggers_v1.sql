-- TI-332: Approval side-effects for installation-sensitive actions.
--
-- Adds:
-- - approval_jobs outbox table (escrow.confirm_received payout release)
-- - trigger-driven side effects for approvals resolved via app-level direct update:
--   - scopes.upgrade
--   - escrow.create
--   - escrow.confirm_received

create table if not exists public.approval_jobs (
  approval_job_id uuid primary key default gen_random_uuid(),
  approval_id uuid not null unique references public.approvals(approval_id) on delete cascade,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING',
  attempt_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint approval_jobs_status_check check (status in ('PENDING', 'IN_PROGRESS', 'DONE', 'FAILED'))
);

create index if not exists approval_jobs_status_created_idx
  on public.approval_jobs (status, created_at, approval_job_id);

alter table public.approval_jobs enable row level security;
alter table public.approval_jobs force row level security;

drop policy if exists deny_all_anon_authenticated on public.approval_jobs;
create policy deny_all_anon_authenticated
on public.approval_jobs
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.approvals_apply_side_effects_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_installation_id uuid;
  v_requested_scopes text[];
  v_tx_id uuid;
  v_escrow_id uuid;
  v_actor_agent_id uuid;
  v_fee_bps int;
  v_psp_mode text;
  v_psp_fee_bps int;
  v_seller_owner_id uuid;
  v_seller_kyc_status public.psp_kyc_status;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.state <> 'PENDING'::public.approval_state or new.state <> 'APPROVED'::public.approval_state then
    return new;
  end if;

  if new.action_type = 'scopes.upgrade' then
    v_installation_id := nullif(coalesce(new.action_ref->>'installation_id', new.action_ref_id), '')::uuid;
    if v_installation_id is null then
      raise exception 'INSTALLATION_NOT_FOUND';
    end if;

    select coalesce(array_agg(scope), '{}'::text[])
      into v_requested_scopes
      from (
        select distinct nullif(btrim(value), '') as scope
        from jsonb_array_elements_text(coalesce(new.action_payload_redacted->'requested_scopes', '[]'::jsonb)) as t(value)
      ) as scopes
     where scope is not null;

    update public.agent_installations as ai
       set oauth_scopes = (
         select coalesce(array_agg(distinct scope order by scope), '{}'::text[])
           from unnest(coalesce(ai.oauth_scopes, '{}'::text[]) || coalesce(v_requested_scopes, '{}'::text[])) as scope
       )
     where ai.installation_id = v_installation_id;

    if not found then
      raise exception 'INSTALLATION_NOT_FOUND';
    end if;

    return new;
  end if;

  if new.action_type = 'escrow.create' then
    v_tx_id := nullif(coalesce(new.action_ref->>'tx_id', new.action_ref_id), '')::uuid;
    v_actor_agent_id := new.created_by_agent_id;

    if v_tx_id is null then
      raise exception 'TX_NOT_FOUND';
    end if;
    if v_actor_agent_id is null then
      raise exception 'TX_NOT_FOUND';
    end if;

    select c.mode, c.platform_fee_bps_default
      into v_psp_mode, v_psp_fee_bps
      from public.psp_config as c
     order by c.updated_at desc, c.psp_config_id desc
     limit 1;

    if v_psp_mode is null then
      raise exception 'PSP_NOT_CONFIGURED';
    end if;

    if not exists (select 1 from public.transactions t where t.tx_id = v_tx_id) then
      raise exception 'TX_NOT_FOUND';
    end if;

    v_fee_bps := nullif(new.action_payload_redacted->>'fee_bps', '')::int;
    v_fee_bps := coalesce(v_fee_bps, v_psp_fee_bps, 0);

    if v_psp_mode = 'production' then
      select a.owner_id
        into v_seller_owner_id
        from public.transactions t
        left join public.agents a on a.id = t.seller_agent_id
       where t.tx_id = v_tx_id;

      if v_seller_owner_id is null then
        raise exception 'SELLER_KYC_REQUIRED';
      end if;

      select pa.kyc_status
        into v_seller_kyc_status
        from public.psp_accounts pa
       where pa.owner_id = v_seller_owner_id
       order by pa.updated_at desc, pa.psp_account_id desc
       limit 1;

      if v_seller_kyc_status is distinct from 'VERIFIED'::public.psp_kyc_status then
        raise exception 'SELLER_KYC_REQUIRED';
      end if;
    end if;

    begin
      perform public.escrow_create_v0(v_tx_id, v_actor_agent_id, v_fee_bps);
    exception when others then
      if position('ESCROW_ALREADY_EXISTS' in sqlerrm) > 0 then
        null;
      else
        raise;
      end if;
    end;

    return new;
  end if;

  if new.action_type = 'escrow.confirm_received' then
    v_escrow_id := nullif(coalesce(new.action_ref->>'escrow_id', new.action_ref_id), '')::uuid;
    v_actor_agent_id := new.created_by_agent_id;

    if v_escrow_id is null then
      raise exception 'ESCROW_NOT_FOUND';
    end if;
    if v_actor_agent_id is null then
      raise exception 'ESCROW_NOT_FOUND';
    end if;

    perform public.escrow_mark_confirmed_v0(v_escrow_id, v_actor_agent_id);

    insert into public.approval_jobs (
      approval_id,
      action_type,
      payload,
      status,
      attempt_count,
      last_error,
      created_at,
      updated_at,
      started_at,
      finished_at
    )
    values (
      new.approval_id,
      'escrow.confirm_received',
      jsonb_build_object(
        'escrow_id', v_escrow_id,
        'actor_agent_id', v_actor_agent_id
      ),
      'PENDING',
      0,
      null,
      now(),
      now(),
      null,
      null
    )
    on conflict (approval_id) do update
      set action_type = excluded.action_type,
          payload = excluded.payload,
          status = 'PENDING',
          attempt_count = 0,
          last_error = null,
          updated_at = now(),
          started_at = null,
          finished_at = null;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists approvals_apply_side_effects_v1 on public.approvals;
create trigger approvals_apply_side_effects_v1
after update on public.approvals
for each row
execute function public.approvals_apply_side_effects_v1();

