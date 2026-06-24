CREATE TYPE public.share_link_kind AS ENUM ('reflection', 'insight');

CREATE TABLE public.share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  kind public.share_link_kind NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  anonymous boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  rotated_from uuid REFERENCES public.share_links(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_share_links_user ON public.share_links(user_id, created_at DESC);
CREATE INDEX idx_share_links_token ON public.share_links(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_links TO authenticated;
GRANT ALL ON public.share_links TO service_role;
-- No anon SELECT — public lookups must go through get_share_link() which enforces revoked_at IS NULL.

ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read their share links"
  ON public.share_links FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owners can create share links"
  ON public.share_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update their share links"
  ON public.share_links FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can delete their share links"
  ON public.share_links FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER share_links_set_updated_at
  BEFORE UPDATE ON public.share_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Public lookup by token: returns only safe fields and only when the link
-- is not revoked. Anon and authenticated can EXECUTE; RLS on the base
-- table still hides everything from direct SELECT.
CREATE OR REPLACE FUNCTION public.get_share_link(p_token text)
RETURNS TABLE (
  token text,
  kind public.share_link_kind,
  title text,
  body text,
  snapshot jsonb,
  anonymous boolean,
  author_label text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    s.token,
    s.kind,
    s.title,
    s.body,
    s.snapshot,
    s.anonymous,
    CASE
      WHEN s.anonymous THEN 'Anonymous'
      ELSE COALESCE(p.display_name, 'A METABYX friend')
    END AS author_label,
    s.created_at
  FROM public.share_links s
  LEFT JOIN public.profiles p ON p.user_id = s.user_id
  WHERE s.token = p_token
    AND s.revoked_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_share_link(text) TO anon, authenticated;