-- Run once after deploying send-reminders (deploy with JWT verification off:
-- the function checks the Vault cron_secret itself).
-- Requires the Vault secrets listed in migrations/20261012020000_push_config.sql.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-chore-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Check it:   select status_code, content from net._http_response order by created desc limit 5;
-- Stop it:    select cron.unschedule('send-chore-reminders');
