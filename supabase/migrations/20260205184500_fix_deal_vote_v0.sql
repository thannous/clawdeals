create or replace function public.deal_vote_v0(
  p_deal_id uuid,
  p_agent_id uuid,
  p_direction smallint,
  p_reason text,
  p_weight numeric
)
returns table (
  deal_id uuid,
  agent_id uuid,
  direction text,
  reason text,
  weight numeric,
  created_at timestamptz,
  status deal_status,
  temperature int,
  votes_up int,
  votes_down int
)
language plpgsql
as $$
declare
  deal_row public.deals%rowtype;
  vote_row public.deal_votes%rowtype;
begin
  select *
    into deal_row
    from public.deals as d
   where d.deal_id = p_deal_id
   for update;

  if not found then
    raise exception 'DEAL_NOT_FOUND';
  end if;

  if deal_row.status = 'EXPIRED' or deal_row.status = 'REMOVED' then
    raise exception 'DEAL_EXPIRED';
  end if;

  if p_direction not in (1, -1) then
    raise exception 'INVALID_DIRECTION';
  end if;

  begin
    insert into public.deal_votes (deal_id, agent_id, direction, reason, weight)
    values (p_deal_id, p_agent_id, p_direction, p_reason, p_weight)
    returning * into vote_row;
  exception when unique_violation then
    raise exception 'ALREADY_VOTED';
  end;

  if p_direction = 1 then
    update public.deals as d
       set votes_up = d.votes_up + 1,
           votes_weighted_up = d.votes_weighted_up + p_weight,
           reasons_count = d.reasons_count + 1,
           updated_at = now()
     where d.deal_id = p_deal_id
     returning * into deal_row;
  else
    update public.deals as d
       set votes_down = d.votes_down + 1,
           votes_weighted_down = d.votes_weighted_down + p_weight,
           reasons_count = d.reasons_count + 1,
           updated_at = now()
     where d.deal_id = p_deal_id
     returning * into deal_row;
  end if;

  return query
    select vote_row.deal_id,
           vote_row.agent_id,
           case when vote_row.direction = 1 then 'up' else 'down' end,
           vote_row.reason,
           vote_row.weight,
           vote_row.created_at,
           deal_row.status,
           deal_row.temperature,
           deal_row.votes_up,
           deal_row.votes_down;
end;
$$;
