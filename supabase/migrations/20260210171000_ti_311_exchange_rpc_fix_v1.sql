-- TI-311: Fix connect_session_exchange_v1 RPC (ambiguous column/variable names).
--
-- When a function RETURNS TABLE with output columns like `session_id`, unqualified
-- references to `session_id` inside SQL statements can become ambiguous in PL/pgSQL.

create or replace function public.connect_session_exchange_v1(
  p_session_id uuid,
  p_poll_token_hash text,
  p_requested_scope text,
  p_client_type text,
  p_client_version text,
  p_device_name text,
  p_fingerprint text,
  p_key_prefix text,
  p_key_hash text,
  p_now timestamptz
)
returns table (
  session_id uuid,
  status connect_session_status,
  agent_id uuid,
  owner_id uuid,
  installation_id uuid,
  api_key_id uuid,
  issued_at timestamptz
)
language plpgsql
as $$
declare
  session_row public.connect_sessions%rowtype;
  installation_row public.agent_installations%rowtype;
  api_key_row public.api_keys%rowtype;
  v_now timestamptz := coalesce(p_now, now());
  v_requested_scope text;
  v_client_type text;
  v_client_version text;
  v_device_name text;
  v_fingerprint_hash text;
begin
  v_requested_scope := lower(coalesce(nullif(btrim(p_requested_scope), ''), ''));
  if v_requested_scope = '' then
    raise exception 'VALIDATION_ERROR:REQUESTED_KEY_SCOPE';
  end if;

  if p_session_id is null then
    raise exception 'VALIDATION_ERROR:SESSION_ID';
  end if;

  if p_poll_token_hash is null or nullif(btrim(p_poll_token_hash), '') is null then
    raise exception 'VALIDATION_ERROR:POLL_TOKEN';
  end if;

  if p_key_prefix is null or nullif(btrim(p_key_prefix), '') is null then
    raise exception 'VALIDATION_ERROR:KEY_PREFIX';
  end if;

  if p_key_hash is null or nullif(btrim(p_key_hash), '') is null then
    raise exception 'VALIDATION_ERROR:KEY_HASH';
  end if;

  select *
    into session_row
    from public.connect_sessions s
   where s.session_id = p_session_id
   for update;

  if not found then
    raise exception 'CONNECT_SESSION_NOT_FOUND';
  end if;

  if session_row.poll_token_hash is distinct from p_poll_token_hash then
    raise exception 'CONNECT_POLL_TOKEN_INVALID';
  end if;

  -- Expire sessions once past expires_at (including CLAIMED-but-not-delivered).
  if session_row.expires_at <= v_now then
    if session_row.status in ('PENDING_CLAIM', 'CLAIMED') then
      update public.connect_sessions as cs
         set status = 'EXPIRED',
             expired_at = coalesce(session_row.expired_at, v_now),
             updated_at = v_now
       where cs.session_id = session_row.session_id;
    end if;
    raise exception 'SESSION_EXPIRED';
  end if;

  if session_row.status = 'DELIVERED' then
    raise exception 'SESSION_ALREADY_DELIVERED';
  end if;

  if session_row.status <> 'CLAIMED' then
    raise exception 'SESSION_NOT_CLAIMED';
  end if;

  if session_row.agent_id is null then
    raise exception 'CONNECT_SESSION_MISSING_AGENT';
  end if;

  v_client_type := lower(coalesce(nullif(btrim(p_client_type), ''), 'other'));
  v_client_type := left(v_client_type, 40);
  v_client_version := nullif(left(coalesce(p_client_version, ''), 40), '');
  v_device_name := nullif(left(coalesce(p_device_name, ''), 80), '');

  if p_fingerprint is not null and nullif(btrim(p_fingerprint), '') is not null then
    v_fingerprint_hash := encode(digest(p_fingerprint, 'sha256'), 'hex');
  else
    v_fingerprint_hash := null;
  end if;

  insert into public.agent_installations (
    owner_id,
    agent_id,
    client_type,
    client_version,
    device_name,
    fingerprint_hash,
    status,
    created_at,
    last_seen_at
  )
  values (
    session_row.owner_id,
    session_row.agent_id,
    v_client_type,
    v_client_version,
    v_device_name,
    v_fingerprint_hash,
    'ACTIVE'::agent_installation_status,
    v_now,
    v_now
  )
  returning * into installation_row;

  insert into public.api_keys (
    agent_id,
    installation_id,
    key_prefix,
    key_hash,
    scope,
    key_state,
    created_at,
    revoked_at,
    grace_expires_at
  )
  values (
    session_row.agent_id,
    installation_row.installation_id,
    btrim(p_key_prefix),
    btrim(p_key_hash),
    v_requested_scope,
    'ACTIVE',
    v_now,
    null,
    null
  )
  returning * into api_key_row;

  update public.connect_sessions as cs
     set status = 'DELIVERED',
         installation_id = installation_row.installation_id,
         delivered_at = v_now,
         updated_at = v_now
   where cs.session_id = session_row.session_id;

  return query
    select session_row.session_id,
           'DELIVERED'::connect_session_status,
           session_row.agent_id,
           session_row.owner_id,
           installation_row.installation_id,
           api_key_row.api_key_id,
           v_now;
end;
$$;

