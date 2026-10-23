-- Private owner project state. Service routes authenticate the real session and
-- check the expected owner; no browser/API-key role can read the brief or facts.
create table public.project_missions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(owner_id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  creation_key uuid not null,
  version integer not null default 1 check (version > 0),
  brief jsonb not null check (jsonb_typeof(brief) = 'object'),
  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  facts jsonb not null default '{}' check (jsonb_typeof(facts) = 'object'),
  catalog_snapshots jsonb not null default '[]' check (jsonb_typeof(catalog_snapshots) = 'array'),
  selected_configuration_id text,
  confirmed_version integer,
  confirmed_at timestamptz,
  status text not null default 'DRAFT' check (status in ('DRAFT','SELECTED','CONFIRMED')),
  contacts jsonb not null default '[]' check (jsonb_typeof(contacts) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, creation_key),
  check ((status = 'CONFIRMED' and confirmed_at is not null and confirmed_version = version and selected_configuration_id is not null)
    or (status <> 'CONFIRMED' and confirmed_at is null and confirmed_version is null)),
  check (octet_length(brief::text) <= 12000 and octet_length(plan::text) <= 2000000 and octet_length(facts::text) <= 1000000)
);
create index project_missions_owner_created_idx on public.project_missions(owner_id,created_at desc);
create index project_missions_catalog_idx on public.project_missions using gin(catalog_snapshots jsonb_path_ops);
alter table public.project_missions enable row level security;
alter table public.project_missions force row level security;
create policy deny_client_access on public.project_missions for all to anon, authenticated using (false) with check (false);
revoke all on public.project_missions from public, anon, authenticated;
grant select,insert,update,delete on public.project_missions to service_role;

-- Selection, approval and multi-seller messages share one serialized boundary.
-- The approved catalogue rows are compared under locks with all fields used by
-- the planner, so a price/status/identity change cannot race a stale approval.
create function public.update_project_mission_v1(
  p_owner_id uuid, p_mission_id uuid, p_expected_version integer, p_action text,
  p_plan jsonb, p_snapshots jsonb, p_facts jsonb, p_configuration_id text,
  p_policies jsonb default '[]', p_messages jsonb default '[]'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_mission public.project_missions;
  v_listing public.listings;
  v_snapshot jsonb;
  v_config jsonb;
  v_item jsonb;
  v_group jsonb;
  v_policy jsonb;
  v_current_policy jsonb;
  v_message_input jsonb;
  v_message public.messages;
  v_thread public.threads;
  v_contact jsonb;
  v_sent jsonb := '[]';
  v_contacts jsonb;
  v_seller_owner uuid;
  v_suspended timestamptz;
  v_agent_owner uuid;
  v_stale boolean := false;
  v_total bigint := 0;
  v_facts jsonb;
begin
  if p_action not in ('refresh','facts','select','confirm','contact') or p_expected_version is null or p_expected_version < 1
    or jsonb_typeof(p_plan) is distinct from 'object' or jsonb_typeof(p_snapshots) is distinct from 'array'
    or jsonb_typeof(p_facts) is distinct from 'object' then raise exception 'PROJECT_INPUT_INVALID'; end if;
  -- Lock listings before mission to match listing/moderation invalidation order.
  if p_action in ('select','confirm','contact') then
    select value into v_config from jsonb_array_elements(p_plan->'configurations') where value->>'id' = p_configuration_id;
    if v_config is null then return jsonb_build_object('error','SELECTION_REQUIRED'); end if;
    for v_item in select value from jsonb_array_elements(v_config->'items') order by value->>'listing_id' loop
      select * into v_listing from public.listings where listing_id = (v_item->>'listing_id')::uuid for update;
      if not found then v_stale := true; continue; end if;
      select value into v_snapshot from jsonb_array_elements(p_snapshots) where value->>'listing_id' = v_item->>'listing_id';
      if v_snapshot is null or not (to_jsonb(v_listing) @> v_snapshot) or v_listing.status::text <> 'LIVE'
        or v_listing.owner_id = p_owner_id::text or v_listing.currency <> 'EUR' or v_listing.market_code <> 'FR'
        or exists(select 1 from public.moderation_states where entity_type='listing' and entity_id=v_listing.listing_id and hidden) then v_stale := true; end if;
    end loop;
  end if;
  select * into v_mission from public.project_missions where id=p_mission_id and owner_id=p_owner_id for update;
  if not found then return jsonb_build_object('error','NOT_FOUND'); end if;
  if v_mission.version <> p_expected_version then return jsonb_build_object('error','VERSION_CONFLICT','mission',to_jsonb(v_mission)); end if;
  -- Lock every participating owner in one global order, using the owners of
  -- already locked listings. A buyer can also sell to another project's buyer:
  -- acquiring buyer SHARE then seller UPDATE creates an A->B / B->A deadlock.
  -- FOR UPDATE also blocks the FK key lock of a newly inserted seller policy.
  -- Existing owner checks below only reacquire these same transaction locks.
  perform 1 from public.owners o
    where o.owner_id=p_owner_id or o.owner_id in (
      select l.owner_id::uuid from public.listings l
        join jsonb_array_elements(coalesce(v_config->'items','[]'::jsonb)) i on l.listing_id=(i->>'listing_id')::uuid
    ) order by o.owner_id for update;
  select suspended_at into v_suspended from public.owners where owner_id=p_owner_id for share;
  if not found then return jsonb_build_object('error','NOT_FOUND'); end if;
  if v_suspended is not null then return jsonb_build_object('error','OWNER_SUSPENDED'); end if;
  select owner_id,suspended_at into v_agent_owner,v_suspended from public.agents where id=v_mission.agent_id for share;
  if not found or v_agent_owner is distinct from p_owner_id then return jsonb_build_object('error','NOT_FOUND'); end if;
  if v_suspended is not null then return jsonb_build_object('error','AGENT_SUSPENDED'); end if;
  if p_action in ('select','confirm','contact') then
    for v_group in select value from jsonb_array_elements(v_config->'seller_groups') order by value->>'seller_agent_id' loop
      select owner_id,suspended_at into v_seller_owner,v_suspended from public.agents where id=(v_group->>'seller_agent_id')::uuid for share;
      if not found or v_seller_owner = p_owner_id or v_suspended is not null then v_stale := true; end if;
      if exists(select 1 from public.listings l join jsonb_array_elements(v_config->'items') i on l.listing_id=(i->>'listing_id')::uuid
        where l.seller_agent_id=(v_group->>'seller_agent_id')::uuid and l.owner_id is distinct from v_seller_owner::text) then v_stale := true; end if;
      -- Do not acquire a new owner lock here. If an agent was transferred after
      -- the catalogue snapshot, the listing/agent owner comparison marks stale.
      select suspended_at into v_suspended from public.owners where owner_id=v_seller_owner;
      if not found or v_suspended is not null then v_stale := true; end if;
    end loop;
    if v_stale or v_mission.plan is distinct from p_plan then
      update public.project_missions set version=version+1,selected_configuration_id=null,confirmed_version=null,confirmed_at=null,status='DRAFT',updated_at=clock_timestamp()
        where id=p_mission_id returning * into v_mission;
      return jsonb_build_object('error','CATALOG_CHANGED','mission',to_jsonb(v_mission));
    end if;
  end if;
  if p_action in ('confirm','contact') and (v_mission.brief->>'pickup_by')::date < (clock_timestamp() at time zone 'Europe/Paris')::date then
    update public.project_missions set version=version+1,selected_configuration_id=null,confirmed_version=null,confirmed_at=null,status='DRAFT',updated_at=clock_timestamp()
      where id=p_mission_id returning * into v_mission;
    return jsonb_build_object('error','PROJECT_DEADLINE_EXPIRED','mission',to_jsonb(v_mission));
  end if;
  if p_action = 'contact' then
    if v_mission.selected_configuration_id is distinct from p_configuration_id then return jsonb_build_object('error','SELECTION_REQUIRED'); end if;
    if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages) <> jsonb_array_length(v_config->'seller_groups')
      or jsonb_typeof(p_policies) is distinct from 'array' then raise exception 'PROJECT_CONTACT_INVALID'; end if;
    -- Compare the exact seller-policy snapshots evaluated by the application.
    -- Lock existing policy rows so a concurrent policy update precedes or follows
    -- the entire send transaction, never just part of the multi-seller batch.
    for v_policy in select value from jsonb_array_elements(p_policies) order by value->>'owner_id' loop
      select jsonb_build_object('owner_id',owner_id,'version',version,'policy_json',policy_json) into v_current_policy
        from public.policies where owner_id=(v_policy->>'owner_id')::uuid for share;
      if coalesce(v_current_policy,'null'::jsonb) is distinct from v_policy->'snapshot' then return jsonb_build_object('error','POLICY_CHANGED'); end if;
    end loop;
    v_contacts := v_mission.contacts;
    for v_group in select value from jsonb_array_elements(v_config->'seller_groups') loop
      select value into v_message_input from jsonb_array_elements(p_messages) where value->>'seller_agent_id'=v_group->>'seller_agent_id';
      if v_message_input is null or v_message_input->>'text' is distinct from v_group->>'draft_message'
        or v_message_input->'listing_ids' is distinct from v_group->'listing_ids'
        or coalesce((v_message_input->>'redacted')::boolean,false) is distinct from coalesce((v_group->>'redacted')::boolean,false)
        or length(v_message_input->>'content_key') <> 64 or length(v_message_input->>'text') > 800 then raise exception 'PROJECT_CONTACT_INVALID'; end if;
      if exists(select 1 from jsonb_array_elements(v_contacts) c where c->>'seller_agent_id'=v_group->>'seller_agent_id' and c->>'content_key'=v_message_input->>'content_key') then continue; end if;
      select * into v_listing from public.listings where listing_id=(v_group->'listing_ids'->>0)::uuid;
      if v_listing.seller_agent_id is distinct from (v_group->>'seller_agent_id')::uuid then raise exception 'PROJECT_CONTACT_INVALID'; end if;
      if not exists(select 1 from jsonb_array_elements(p_policies) p where p->>'owner_id'=v_listing.owner_id::text) then raise exception 'PROJECT_CONTACT_INVALID'; end if;
      select * into v_thread from public.threads where listing_id=v_listing.listing_id and buyer_agent_id=v_mission.agent_id and thread_type::text='MARKETPLACE' for update;
      if not found then
        insert into public.threads(thread_type,listing_id,owner_id,buyer_agent_id,seller_agent_id,status,control_owner_id,control_agent_id)
          values('MARKETPLACE',v_listing.listing_id,v_listing.owner_id,v_mission.agent_id,v_listing.seller_agent_id,'OPEN',null,null)
          on conflict(listing_id,buyer_agent_id) do nothing returning * into v_thread;
        if not found then select * into v_thread from public.threads where listing_id=v_listing.listing_id and buyer_agent_id=v_mission.agent_id for update; end if;
      end if;
      if v_thread.seller_agent_id is distinct from v_listing.seller_agent_id or v_thread.status::text <> 'OPEN' or v_thread.thread_type::text <> 'MARKETPLACE' then raise exception 'PROJECT_THREAD_UNAVAILABLE'; end if;
      insert into public.messages(thread_id,sender_id,sender_type,body,type,payload,redacted)
        values(v_thread.thread_id,v_mission.agent_id,'agent',v_message_input->>'text','question',
          jsonb_build_object('type','question','text',v_message_input->>'text'),coalesce((v_message_input->>'redacted')::boolean,false)) returning * into v_message;
      v_contact := jsonb_build_object('seller_agent_id',v_listing.seller_agent_id,'version',v_mission.version,'configuration_id',p_configuration_id,
        'content_key',v_message_input->>'content_key','thread_id',v_thread.thread_id,'message_id',v_message.message_id,'sent_at',v_message.created_at);
      v_contacts := v_contacts || jsonb_build_array(v_contact);
      v_sent := v_sent || jsonb_build_array(to_jsonb(v_message));
    end loop;
    update public.project_missions set contacts=v_contacts,updated_at=clock_timestamp() where id=p_mission_id returning * into v_mission;
    return jsonb_build_object('mission',to_jsonb(v_mission),'sent_messages',v_sent);
  end if;
  if p_action = 'confirm' then
    if v_mission.selected_configuration_id is distinct from p_configuration_id then return jsonb_build_object('error','SELECTION_REQUIRED'); end if;
    if (v_config->>'ready_to_approve')::boolean is distinct from true
      or (v_config->>'unknown_fee_count')::integer <> 0
      or (v_config->>'total_known_cents')::bigint > (v_mission.brief->>'budget_cents')::bigint then return jsonb_build_object('error','PLAN_INCOMPLETE'); end if;
    -- Recheck the complete all-in sum and evidence, independently of the
    -- presentation ready flag. A user quote is still explicitly uncommitted.
    if jsonb_array_length(v_config->'items') <> 3+jsonb_array_length(v_mission.brief->'optional_slots')
      or (select count(distinct i->>'slot') from jsonb_array_elements(v_config->'items') i) <> jsonb_array_length(v_config->'items')
      or not (select jsonb_agg(i->>'slot') from jsonb_array_elements(v_config->'items') i) @> '["desk","chair","monitor"]'::jsonb then return jsonb_build_object('error','PLAN_INCOMPLETE'); end if;
    for v_item in select value from jsonb_array_elements(v_config->'items') loop
      v_facts := v_item->'facts';
      select * into v_listing from public.listings where listing_id=(v_item->>'listing_id')::uuid;
      if v_facts is null or v_facts='null'::jsonb or v_facts is distinct from (v_mission.facts->(v_item->>'listing_id')->'facts')
        or v_facts->>'provenance' is distinct from 'user_confirmed'
        or v_facts->>'delivery_fee_cents' is null or (v_facts->>'delivery_fee_cents')::bigint < 0
        or (v_facts->>'confirmed_at')::timestamptz < v_listing.updated_at
        or (v_item->>'price_cents')::bigint <> round(v_listing.price_amount*100)::bigint
        or v_item->>'delivery_method' is null then return jsonb_build_object('error','PLAN_INCOMPLETE'); end if;
      if v_item->>'slot'='desk' and (v_facts->>'desk_width_cm' is null or v_facts->>'desk_depth_cm' is null
        or (v_facts->>'desk_width_cm')::numeric > (v_mission.brief->>'desk_max_width_cm')::numeric
        or (v_facts->>'desk_depth_cm')::numeric > (v_mission.brief->>'desk_max_depth_cm')::numeric) then return jsonb_build_object('error','PLAN_INCOMPLETE'); end if;
      if v_item->>'slot'='monitor' and (not coalesce(v_facts->'connectors' @> jsonb_build_array(v_mission.brief->>'laptop_connector'),false)
        or (v_mission.brief->>'laptop_connector'='USB_C' and (v_facts->>'video_verified')::boolean is distinct from true)) then return jsonb_build_object('error','PLAN_INCOMPLETE'); end if;
      if (v_config->>'variant'='weekend' or v_item->>'delivery_method' in ('PICKUP','BOTH')) and
        (v_item->>'delivery_method' not in ('PICKUP','BOTH') or v_facts->>'pickup_available_by' is null
          or (v_facts->>'pickup_available_by')::date > (v_mission.brief->>'pickup_by')::date) then return jsonb_build_object('error','PLAN_INCOMPLETE'); end if;
      v_total := v_total + coalesce((v_facts->>'quoted_price_cents')::bigint,(v_item->>'price_cents')::bigint)+(v_facts->>'delivery_fee_cents')::bigint;
    end loop;
    if v_total > (v_mission.brief->>'budget_cents')::bigint or v_total <> (v_config->>'total_known_cents')::bigint then return jsonb_build_object('error','PLAN_INCOMPLETE'); end if;
  end if;
  update public.project_missions set version=version+1,plan=p_plan,catalog_snapshots=p_snapshots,facts=p_facts,
    selected_configuration_id=case when p_action in ('select','confirm') then p_configuration_id else null end,
    confirmed_version=case when p_action='confirm' then version+1 else null end,
    confirmed_at=case when p_action='confirm' then clock_timestamp() else null end,
    status=case when p_action='confirm' then 'CONFIRMED' when p_action='select' then 'SELECTED' else 'DRAFT' end,
    updated_at=clock_timestamp() where id=p_mission_id returning * into v_mission;
  return jsonb_build_object('mission',to_jsonb(v_mission));
end;
$$;
revoke all on function public.update_project_mission_v1(uuid,uuid,integer,text,jsonb,jsonb,jsonb,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.update_project_mission_v1(uuid,uuid,integer,text,jsonb,jsonb,jsonb,text,jsonb,jsonb) to service_role;

-- Catalogue changes revoke previous approval immediately. Recomposition itself
-- remains bounded application work when the owner opens or refreshes a mission.
create function public.invalidate_project_missions_v1()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_listing_id uuid;
begin
  if tg_table_name='moderation_states' then
    if coalesce(new.entity_type,old.entity_type)<>'listing' then return coalesce(new,old); end if;
    v_listing_id:=coalesce(new.entity_id,old.entity_id);
    perform 1 from public.listings where listing_id=v_listing_id for update;
  else v_listing_id:=coalesce(new.listing_id,old.listing_id); end if;
  update public.project_missions set version=version+1,selected_configuration_id=null,confirmed_at=null,confirmed_version=null,status='DRAFT',updated_at=clock_timestamp()
    where catalog_snapshots @> jsonb_build_array(jsonb_build_object('listing_id',v_listing_id));
  return coalesce(new,old);
end;
$$;
revoke all on function public.invalidate_project_missions_v1() from public,anon,authenticated;
grant execute on function public.invalidate_project_missions_v1() to service_role;
create trigger project_mission_listing_change after update of title,description,category,price_amount,currency,market_code,status,geo_lat,geo_lng,delivery_method,seller_agent_id,owner_id or delete on public.listings
  for each row execute function public.invalidate_project_missions_v1();
create trigger project_mission_moderation_change after insert or update or delete on public.moderation_states
  for each row execute function public.invalidate_project_missions_v1();
