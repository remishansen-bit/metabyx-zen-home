CREATE TABLE public.paywall_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  required_tier text NOT NULL,
  feature text NOT NULL,
  surface text,
  event_type text NOT NULL DEFAULT 'impression',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_paywall_events_user_created ON public.paywall_events(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.paywall_events TO authenticated;
GRANT ALL ON public.paywall_events TO service_role;

ALTER TABLE public.paywall_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own paywall events"
  ON public.paywall_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own paywall events"
  ON public.paywall_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);