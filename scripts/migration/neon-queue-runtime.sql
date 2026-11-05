-- NEON TARGET ONLY, after reviewed public/private import. Never on Supabase.
-- Durable public queue rows and notification eligibility are not removed.
BEGIN;
CREATE OR REPLACE FUNCTION private.send_queue_wake_v1(queue text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF queue NOT IN ('watchlist-match-queue','watchlist-backfill-queue','trustscore-recalc-queue','notifications-dispatch') THEN RETURN; END IF;
  INSERT INTO private.queue_dispatch_state(queue_name) VALUES(queue) ON CONFLICT(queue_name) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION private.send_queue_wake_v1(text) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.claim_neon_queue_wakes_v1() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE claimed jsonb;
BEGIN
  PERFORM private.reconcile_notification_schedules_v1();
  WITH pending(queue_name) AS (
    SELECT 'watchlist-match-queue' WHERE EXISTS(SELECT 1 FROM public.watchlist_match_queue)
    UNION ALL SELECT 'watchlist-backfill-queue' WHERE EXISTS(SELECT 1 FROM public.watchlist_backfill_queue)
    UNION ALL SELECT 'trustscore-recalc-queue' WHERE EXISTS(SELECT 1 FROM public.trustscore_recalc_queue)
    UNION ALL SELECT 'notifications-dispatch' WHERE EXISTS(SELECT 1 FROM public.notification_outbox WHERE status='PENDING' AND available_at<=now())
  ), wakes AS (
    INSERT INTO private.queue_dispatch_state(queue_name,last_wake_at)
    SELECT queue_name,clock_timestamp() FROM pending
    ON CONFLICT(queue_name) DO UPDATE SET last_wake_at=excluded.last_wake_at
      WHERE private.queue_dispatch_state.last_wake_at<clock_timestamp()-interval '30 seconds'
        AND private.queue_dispatch_state.lease_until<=clock_timestamp()
    RETURNING queue_name
  ) SELECT coalesce(jsonb_agg(queue_name),'[]'::jsonb) INTO claimed FROM wakes;
  RETURN claimed;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_neon_queue_wakes_v1() FROM PUBLIC;
-- Reconcile on external recovery, including periods without producer traffic.
CREATE OR REPLACE FUNCTION private.queue_drain_claim_v1(p_queue text,p_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE claimed text;
BEGIN
  IF p_token IS NULL THEN RETURN false; END IF;
  IF p_queue='notifications-dispatch' THEN PERFORM private.reconcile_notification_schedules_v1(); END IF;
  INSERT INTO private.queue_dispatch_state(queue_name,lease_token,lease_until)
    VALUES(p_queue,p_token,clock_timestamp()+interval '5 minutes')
    ON CONFLICT(queue_name) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until
      WHERE private.queue_dispatch_state.lease_until<=clock_timestamp()
    RETURNING queue_name INTO claimed;
  RETURN claimed IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.queue_drain_claim_v1(text,uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION private.configure_queue_dispatch_v1(p_secret text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Neon queue dispatch uses the app queue secret, not Vault'; END;
$$;
REVOKE ALL ON FUNCTION private.configure_queue_dispatch_v1(text) FROM PUBLIC;
COMMIT;
-- Grant runtime only the reviewed public wrappers via neon-queue-role-plan.sql.
-- Do not install the Supabase five-minute pg_cron recovery job on Neon.
