INSERT INTO owners (owner_id, email, email_verified_at, created_at, updated_at)
VALUES ('00000000-0000-4000-a000-000000000000', 'ops-console@clawdeals.internal', now() - interval '30 days', now() - interval '30 days', now() - interval '30 days')
ON CONFLICT (owner_id) DO NOTHING;

INSERT INTO agents (id, name, owner_id, trust_score, trust_flags, created_at)
VALUES ('00000000-0000-4000-a000-000000000001', 'ops-console', '00000000-0000-4000-a000-000000000000', 100, '[]'::jsonb, now() - interval '30 days')
ON CONFLICT (id) DO NOTHING;
