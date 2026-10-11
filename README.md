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
- Recurring chores keep a single row: completing one logs it to `chore_log`, moves `due_at` forward (in the household's time zone, so 19:00 stays 19:00 across DST) and, with *Take turns* on, passes it to the next person.
- RLS: people only see their own household. Assignees must be household members (enforced by trigger).

## Setup

### 1. Supabase project

1. Create a project at supabase.com.
2. Run `supabase/migrations/20261012000000_init.sql` in the SQL editor (or `supabase link` + `supabase db push`).
3. **Auth → Email templates → Magic Link:** add `{{ .Token }}` to the body, e.g. `Your code is {{ .Token }}`. The app signs in with a 6-digit code, because on iPhone a magic link would open Safari and sign in there instead of the Home Screen app.
4. **Auth → SMTP:** set up custom SMTP (Resend, Postmark, etc.). The built-in sender is heavily rate-limited and, as far as I know, only delivers to your project's team members, so your roommates wouldn't get their codes.
5. Household time zone defaults to `Europe/Belgrade`. Change the column default in the migration if needed.

### 2. VAPID keys

```bash
npx web-push generate-vapid-keys
```

The public key goes in the app's env, the private key only in Supabase secrets.

### 3. Edge function

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=... \
  VAPID_PRIVATE_KEY=... \
  VAPID_SUBJECT=mailto:you@example.com \
  APP_URL=https://your-app.vercel.app \
  CRON_SECRET=$(openssl rand -hex 24)

supabase functions deploy send-reminders --no-verify-jwt
```

`--no-verify-jwt` is needed because the cron job authenticates with `CRON_SECRET`, not a user token. The function rejects any request without it.

### 4. Cron

Open `supabase/cron.sql`, fill in your project URL and the same `CRON_SECRET`, and run it in the SQL editor. It calls the function every 5 minutes.

### 5. Frontend

```bash
cp .env.example .env.local   # fill in URL, anon/publishable key, VAPID public key
npm install
npm run dev
```

Deploy to Vercel with the same three `VITE_` env vars. Push needs HTTPS, which Vercel gives you (localhost also works for testing on desktop).

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
