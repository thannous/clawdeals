-- Atomic per-row attempt_count increment for notification dispatch retries.
create or replace function public.notification_outbox_increment_attempts_v1(p_outbox_ids uuid[], p_last_error text)
returns int
language plpgsql
as $$
declare
  v_count int;
begin
  update public.notification_outbox
  set
    attempt_count = attempt_count + 1,
    last_error = p_last_error
  where notification_outbox_id = any(p_outbox_ids);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Supabase security lint: pin function search_path explicitly.
alter function public.notification_outbox_increment_attempts_v1(uuid[], text)
  set search_path = pg_catalog, public;

