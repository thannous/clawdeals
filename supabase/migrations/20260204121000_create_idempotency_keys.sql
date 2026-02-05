create extension if not exists "pgcrypto";

create table if not exists public.idempotency_keys (
  idempotency_id uuid primary key default gen_random_uuid(),
  actor_type text not null,
  actor_id text not null,
  method text not null,
  path text not null,
  idempotency_key text not null,
  request_hmac text not null,
  status text not null,
  response_status int,
  response_headers jsonb,
  response_body jsonb,
  response_body_encrypted text,
  entity_type text,
  entity_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create unique index if not exists idempotency_keys_unique_idx
  on public.idempotency_keys (actor_type, actor_id, method, path, idempotency_key);

create index if not exists idempotency_keys_expires_idx
  on public.idempotency_keys (expires_at);
