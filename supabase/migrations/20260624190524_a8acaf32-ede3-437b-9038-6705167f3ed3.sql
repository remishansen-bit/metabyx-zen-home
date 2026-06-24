CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Cleanup function: prune share_link_views older than the rate-limit window.
CREATE OR REPLACE FUNCTION public.cleanup_share_link_views()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.share_link_views
  WHERE viewed_at < now() - interval '10 minutes';
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_share_link_views() FROM public, anon, authenticated;

-- Unschedule any prior job with the same name (idempotent re-runs).
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-share-link-views');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-share-link-views',
  '*/5 * * * *',
  $$SELECT public.cleanup_share_link_views();$$
);