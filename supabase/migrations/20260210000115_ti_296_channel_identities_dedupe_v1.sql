-- TI-296: Enforce dedupe for channel identities across owners.
-- One (channel_type, channel_user_id, channel_context_id) can only be linked to one owner at a time
-- for non-REVOKED states.

-- Best-effort cleanup before enforcing uniqueness:
-- Keep ACTIVE over PENDING; otherwise keep most recent row.
with ranked as (
  select
    ci.channel_identity_id,
    row_number() over (
      partition by ci.channel_type, ci.channel_user_id, ci.channel_context_id
      order by (ci.state = 'ACTIVE') desc, ci.created_at desc, ci.channel_identity_id desc
    ) as rn
  from public.channel_identities ci
  where ci.state <> 'REVOKED'
)
update public.channel_identities ci
   set state = 'REVOKED',
       revoked_at = now(),
       pairing_code_hash = null,
       pairing_expires_at = null
  from ranked r
 where ci.channel_identity_id = r.channel_identity_id
   and r.rn > 1;

create unique index if not exists channel_identities_unique_channel_non_revoked_idx
  on public.channel_identities (channel_type, channel_user_id, channel_context_id)
  where state <> 'REVOKED';

