-- Run once in the Supabase SQL editor AFTER deploying the send-reminders function.
-- Replace the two placeholder values first.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
select vault.create_secret('SAME-VALUE-AS-CRON_SECRET', 'cron_secret');

-- Every 5 minutes
select cron.schedule(
  'send-chore-reminders',
  '*/5 * * * *',
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

-- To check it's running:
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select * from net._http_response order by created desc limit 10;
-- To stop it:
--   select cron.unschedule('send-chore-reminders');
