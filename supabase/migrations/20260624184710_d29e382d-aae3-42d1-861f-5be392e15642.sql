-- 1. Expiry column + backfill (idempotent)
alter table public.share_links
  add column if not exists expires_at timestamptz;

update public.share_links
   set expires_at = created_at + interval '30 days'
 where expires_at is null;

alter table public.share_links
  alter column expires_at set default (now() + interval '30 days');

alter table public.share_links
  alter column expires_at set not null;

create index if not exists share_links_expires_at_idx
  on public.share_links (expires_at);

-- 2. Recreate public lookup with expiry in return shape
drop function if exists public.get_share_link(text);

create function public.get_share_link(p_token text)
returns table(
  token text,
  kind share_link_kind,
  title text,
  body text,
  snapshot jsonb,
  anonymous boolean,
  author_label text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.token,
    s.kind,
    s.title,
    s.body,
    s.snapshot,
    s.anonymous,
    case
      when s.anonymous then 'Anonymous'
      else coalesce(p.display_name, 'A METABYX friend')
    end as author_label,
    s.created_at,
    s.expires_at
  from public.share_links s
  left join public.profiles p on p.user_id = s.user_id
  where s.token = p_token
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;
$$;

revoke execute on function public.get_share_link(text) from public, anon, authenticated;
grant execute on function public.get_share_link(text) to service_role;

-- 3. View log for ad-hoc rate limiting (service_role only)
create table if not exists public.share_link_views (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  visitor_hash text not null,
  viewed_at timestamptz not null default now()
);

create index if not exists share_link_views_lookup_idx
  on public.share_link_views (token, visitor_hash, viewed_at desc);

grant all on public.share_link_views to service_role;

alter table public.share_link_views enable row level security;
-- No policies: only service_role (which bypasses RLS) may read/write.