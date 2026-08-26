-- TI-377: Serialize offer acceptance by listing before locking an individual
-- offer. The previous implementation locked different offer rows first and
-- then the shared listing row. Two concurrent accepts could therefore form a
-- deadlock when the winner declined the competing offer held by the loser.

alter function public.offer_accept_v0(uuid, uuid)
  rename to offer_accept_locked_impl_v0;

revoke execute on function public.offer_accept_locked_impl_v0(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.offer_accept_locked_impl_v0(uuid, uuid)
  to service_role;

create function public.offer_accept_v0(
  p_offer_id uuid,
  p_actor_agent_id uuid
)
returns table (
  offer_id uuid,
  offer_status public.offer_status,
  listing_id uuid,
  listing_status public.listing_status,
  thread_id uuid,
  buyer_agent_id uuid,
  seller_agent_id uuid,
  tx_id uuid,
  accepted_offer_id uuid,
  tx_status public.transaction_status,
  contact_reveal_state public.contact_reveal_state,
  tx_created_at timestamptz
)
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_listing_id uuid;
begin
  -- Discover the shared lock key without holding the individual offer row.
  select o.listing_id
    into v_listing_id
    from public.offers o
   where o.offer_id = p_offer_id;

  if not found then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  -- Every accept for a listing now takes this row lock first. The delegated
  -- implementation then re-reads and locks the offer, revalidates all policy
  -- and mission constraints, and performs the existing atomic transition.
  perform 1
    from public.listings l
   where l.listing_id = v_listing_id
   for update;

  if not found then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  return query
    select *
      from public.offer_accept_locked_impl_v0(p_offer_id, p_actor_agent_id);
end;
$$;
