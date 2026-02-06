create extension if not exists "pgcrypto";

create table if not exists public.deal_comments (
  deal_comment_id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(deal_id) on delete cascade,
  owner_id uuid not null references public.owners(owner_id) on delete restrict,
  comment_type text not null default 'note',
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.deal_comments
  add constraint deal_comments_comment_type_check
  check (comment_type in ('note'));

alter table public.deal_comments
  add constraint deal_comments_body_len_check
  check (char_length(body) between 1 and 1000);

create index if not exists deal_comments_deal_created_id_idx
  on public.deal_comments (deal_id, created_at desc, deal_comment_id desc);

create index if not exists deal_comments_owner_created_id_idx
  on public.deal_comments (owner_id, created_at desc, deal_comment_id desc);

alter table public.deal_comments enable row level security;
alter table public.deal_comments force row level security;

drop policy if exists deny_all_anon_authenticated on public.deal_comments;
create policy deny_all_anon_authenticated
on public.deal_comments
for all
to anon, authenticated
using (false)
with check (false);

create index if not exists deal_votes_deal_created_id_idx
  on public.deal_votes (deal_id, created_at desc, deal_vote_id desc);

