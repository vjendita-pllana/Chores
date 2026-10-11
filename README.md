# Chores

A shared chores PWA. You add chores, assign them to your roommates, and each person gets a Web Push reminder on their phone when their chore is due.

**Stack:** Vite + React + TypeScript + Tailwind v4, TanStack Query, vite-plugin-pwa (custom service worker), Supabase (Postgres, Auth, Realtime, Edge Functions, pg_cron).

## How it fits together

```
Phone (PWA) ──subscribe──▶ push_subscriptions table
     ▲                            │
     │ notification               ▼
Push service ◀── web-push ── send-reminders edge function ◀── pg_cron every 5 min
(FCM / Apple / Mozilla)            calls claim_due_reminders()
```

- `claim_due_reminders()` marks chores as reminded in the same statement it returns them, so overlapping cron runs never send twice.
- Chores more than a day late get one extra "Still waiting" nudge.
- **To buy:** anyone adds items; tap *Select* to hand several to one person. `assign_items()` writes a message to `push_queue`, which the same cron function sends ("Vjendita asked you to buy 3 things").
- Recurring chores keep a single row: completing one logs it to `chore_log`, moves `due_at` forward (in the household's time zone, so 19:00 stays 19:00 across DST) and, with *Take turns* on, passes it to the next person.
- RLS: people only see their own household. Assignees must be household members (enforced by trigger).

## Setup

The live project (Supabase `yyrzougkeircwksnmzaq`, created through Vercel's Supabase integration) is already set up: migrations applied, `send-reminders` deployed, Vault secrets stored, cron running every minute. To set up a fresh project:

1. Run the files in `supabase/migrations/` in order.
2. Generate a VAPID pair (`npx web-push generate-vapid-keys`) and store the Vault secrets listed at the top of `20261012020000_push_config.sql`.
3. Deploy `supabase/functions/send-reminders` with JWT verification **off** (it checks the Vault `cron_secret` itself). No function secrets are needed.
4. Run `supabase/cron.sql`.
5. Put the VAPID public key in `src/lib/push.ts` or `VITE_VAPID_PUBLIC_KEY`.

### Auth settings (dashboard only)

- **Authentication → Emails → Templates → Magic Link:** use a body like `<p>Your Chores code is <strong>{{ .Token }}</strong></p>`. The app signs in with the 6-digit code, because on iPhone a link would open Safari instead of the Home Screen app.
- **Authentication → URL Configuration → Site URL:** your Vercel URL.
- **Authentication → Emails → SMTP Settings:** add custom SMTP (e.g. Resend). The built-in sender is heavily rate-limited and may only deliver to project team members.

### Frontend

Vercel's Supabase integration provides `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; `vite.config.ts` maps them to `VITE_*`. For local dev, copy `.env.example` to `.env.local`.

## Getting roommates on

1. Settings → Share sends the link and the 6-letter code.
2. **iPhone:** open the link in Safari → Share → Add to Home Screen → open Chores from the Home Screen → sign in → enter the code → tap *Enable reminders*. Requires iOS 16.4+. Reminders won't work from a Safari tab.
3. **Android:** open in Chrome, sign in, enter the code, enable reminders. Installing is optional but nicer.

The invite link pre-fills the code in a browser tab, but the Home Screen app opens at `/`, so on iPhone they'll type the code in once.

## Testing reminders

Add a chore assigned to yourself, due 2 minutes from now, enable reminders, then wait for the next cron tick. To debug:

```sql
select * from cron.job_run_details order by start_time desc limit 5;
select status_code, content from net._http_response order by created desc limit 5;
```

The function returns `{ reminders, sent, expired }`. `sent: 0` with `reminders > 0` means that person has no stored subscription on any device.

## Ideas for later

- "Mark done" straight from the notification (Android supports notification actions; iOS doesn't yet)
- Weekly summary of who did what from `chore_log`
- Quiet hours per person
