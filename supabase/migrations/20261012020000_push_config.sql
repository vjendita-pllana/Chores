-- Push config lives in Vault; only the service role (edge function) can read it.
-- Populate once (see supabase/cron.sql for the full setup):
--   select vault.create_secret('<vapid public>',  'vapid_public');
--   select vault.create_secret('<vapid private>', 'vapid_private');
--   select vault.create_secret('mailto:you@example.com', 'vapid_subject');
--   select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'cron_secret');
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
create or replace function public.get_push_config()
returns table (vapid_public text, vapid_private text, vapid_subject text, cron_secret text)
language sql stable security definer set search_path = '' as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_subject'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
$$;
revoke all on function public.get_push_config() from public, anon, authenticated;
grant execute on function public.get_push_config() to service_role;

-- App RPCs: signed-in users only
revoke execute on function public.assign_items(uuid[], uuid) from public, anon;
revoke execute on function public.complete_chore(uuid) from public, anon;
revoke execute on function public.create_household(text, text) from public, anon;
revoke execute on function public.join_household(text, text) from public, anon;
revoke execute on function public.reopen_chore(uuid) from public, anon;
revoke execute on function public.toggle_bought(uuid) from public, anon;
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.is_owner(uuid) from public, anon;
revoke execute on function public.check_assignee() from public, anon, authenticated;
revoke execute on function public.check_item_assignee() from public, anon, authenticated;
