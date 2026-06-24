revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.get_share_link(text) from public, anon, authenticated;
grant execute on function public.get_share_link(text) to service_role;