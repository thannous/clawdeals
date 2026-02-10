-- Atomic helper for moderation/trust workflows:
-- add a trust flag without read-modify-write races (trust_flags is jsonb).
create or replace function public.add_agent_trust_flag_v1(p_agent_id uuid, p_flag text)
returns jsonb
language plpgsql
as $$
declare
  v_flags jsonb;
begin
  update public.agents
  set
    trust_flags = case
      when trust_flags ? p_flag then trust_flags
      else trust_flags || jsonb_build_array(p_flag)
    end,
    trust_updated_at = case
      when trust_flags ? p_flag then trust_updated_at
      else now()
    end,
    updated_at = case
      when trust_flags ? p_flag then updated_at
      else now()
    end
  where id = p_agent_id
  returning trust_flags into v_flags;

  return v_flags;
end;
$$;

-- Supabase security lint: pin function search_path explicitly.
alter function public.add_agent_trust_flag_v1(uuid, text)
  set search_path = pg_catalog, public;

