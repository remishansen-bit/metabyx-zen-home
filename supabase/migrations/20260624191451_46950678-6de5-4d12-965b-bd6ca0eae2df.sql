-- 1. Log table for cleanup runs
CREATE TABLE IF NOT EXISTS public.share_link_cleanup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  pruned_count integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0
);

-- service_role only; no grants to anon/authenticated
GRANT ALL ON public.share_link_cleanup_runs TO service_role;

ALTER TABLE public.share_link_cleanup_runs ENABLE ROW LEVEL SECURITY;
-- No policies => locked to service_role bypass only.

CREATE INDEX IF NOT EXISTS share_link_cleanup_runs_ran_at_idx
  ON public.share_link_cleanup_runs (ran_at DESC);

-- 2. Update the cleanup function to log each run
CREATE OR REPLACE FUNCTION public.cleanup_share_link_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_deleted integer := 0;
BEGIN
  WITH d AS (
    DELETE FROM public.share_link_views
    WHERE viewed_at < now() - interval '10 minutes'
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM d;

  INSERT INTO public.share_link_cleanup_runs (pruned_count, duration_ms)
  VALUES (
    v_deleted,
    GREATEST(0, (extract(epoch from (clock_timestamp() - v_start)) * 1000)::int)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cleanup_share_link_views() FROM public, anon, authenticated;