-- Clawdeals production bootstrap (after full wipe)
-- Date: 2026-02-11
--
-- Seeds:
-- - Console ops owner + agent
-- - Risk rules defaults (TI-274)
-- - PSP singleton config (mock provider in production mode)

with seed_owner as (
  insert into public.owners (owner_id, email, email_verified_at, created_at, updated_at)
  values (
    '00000000-0000-4000-a000-000000000000'::uuid,
    'ops-console@clawdeals.internal',
    now() - interval '30 days',
    now() - interval '30 days',
    now() - interval '30 days'
  )
  on conflict (owner_id) do update
    set email = excluded.email,
        email_verified_at = excluded.email_verified_at,
        updated_at = now()
  returning owner_id
),
seed_agent as (
  insert into public.agents (id, name, owner_id, trust_score, trust_flags, created_at, updated_at, trust_updated_at)
  values (
    '00000000-0000-4000-a000-000000000001'::uuid,
    'ops-console',
    '00000000-0000-4000-a000-000000000000'::uuid,
    100,
    '[]'::jsonb,
    now() - interval '30 days',
    now() - interval '30 days',
    now() - interval '30 days'
  )
  on conflict (id) do update
    set name = excluded.name,
        owner_id = excluded.owner_id,
        trust_score = excluded.trust_score,
        trust_flags = excluded.trust_flags,
        updated_at = now(),
        trust_updated_at = now()
  returning id
),
seed_risk_rules as (
  insert into public.risk_rules (
    rule_key, signal_type, threshold, window_seconds, cooldown_seconds, flag, enabled, description, updated_at
  )
  values
    (
      'rate_limit_triggers_1h', 'rate_limit_triggers', 12, 3600, 3600, 'noisy_client', true,
      'Auto-flag noisy clients when rate limit events exceed threshold within one hour.', now()
    ),
    (
      'duplicates_detected_24h', 'duplicates_detected', 4, 86400, 86400, 'under_review', true,
      'Auto-flag agents repeatedly triggering listing duplicate detection in 24 hours.', now()
    ),
    (
      'disputes_opened_7d', 'disputes_opened', 3, 604800, 604800, 'restricted', true,
      'Auto-flag agents opening too many disputes over seven days.', now()
    )
  on conflict (rule_key) do update
    set signal_type = excluded.signal_type,
        threshold = excluded.threshold,
        window_seconds = excluded.window_seconds,
        cooldown_seconds = excluded.cooldown_seconds,
        flag = excluded.flag,
        enabled = excluded.enabled,
        description = excluded.description,
        updated_at = now()
  returning rule_key
),
seed_psp as (
  insert into public.psp_config (
    singleton_key, provider, mode, webhook_secret_ref, platform_fee_bps_default, updated_at
  )
  values (
    'psp_config_v0',
    'mock',
    'production',
    'env:PSP_WEBHOOK_SECRET',
    400,
    now()
  )
  on conflict (singleton_key) do update
    set provider = excluded.provider,
        mode = excluded.mode,
        webhook_secret_ref = excluded.webhook_secret_ref,
        platform_fee_bps_default = excluded.platform_fee_bps_default,
        updated_at = now()
  returning psp_config_id
)
select
  (select count(*)::bigint from seed_owner) as owner_seeded,
  (select count(*)::bigint from seed_agent) as agent_seeded,
  (select count(*)::bigint from seed_risk_rules) as risk_rules_seeded,
  (select count(*)::bigint from seed_psp) as psp_config_seeded;
