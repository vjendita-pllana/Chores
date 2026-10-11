// Sends Web Push notifications:
//  - reminders for chores that are due (claim_due_reminders)
//  - queued one-off messages, e.g. "Ana asked you to buy milk" (claim_push_queue)
// Called every minute by pg_cron (see supabase/cron.sql).
//
// Secrets (Edge Functions → Secrets, or `supabase secrets set ...`):
//   CRON_SECRET          shared secret the cron job sends as a Bearer token
//   VAPID_PUBLIC_KEY     from `npx web-push generate-vapid-keys`
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT        mailto:you@example.com
//   APP_URL              https://your-app.vercel.app
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

type DueChore = {
  chore_id: string
  user_id: string
  title: string
  due_at: string
  kind: 'due' | 'overdue'
  household_tz: string
}

type Queued = { user_id: string; title: string; body: string | null; url: string; tag: string | null }

type Message = { user_id: string; title: string; body?: string; url: string; tag?: string }

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')

function formatTime(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso))
}

function choreMessage(d: DueChore): Message {
  return {
    user_id: d.user_id,
    title: d.kind === 'overdue' ? `Still waiting: ${d.title}` : d.title,
    body:
      d.kind === 'overdue'
        ? 'This chore is over a day late. Tap to mark it done.'
        : `Due at ${formatTime(d.due_at, d.household_tz)}`,
    tag: `chore-${d.chore_id}`,
    url: `${appUrl}/?chore=${d.chore_id}`,
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const [due, queued] = await Promise.all([
    supabase.rpc('claim_due_reminders'),
    supabase.rpc('claim_push_queue'),
  ])
  if (due.error) return new Response(due.error.message, { status: 500 })
  if (queued.error) return new Response(queued.error.message, { status: 500 })

  const messages: Message[] = [
    ...((due.data ?? []) as DueChore[]).map(choreMessage),
    ...((queued.data ?? []) as Queued[]).map((q) => ({
      user_id: q.user_id,
      title: q.title,
      body: q.body ?? undefined,
      tag: q.tag ?? undefined,
      url: `${appUrl}${q.url}`,
    })),
  ]
  if (!messages.length) return Response.json({ messages: 0, sent: 0 })

  const userIds = [...new Set(messages.map((m) => m.user_id))]
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)
  if (error) return new Response(error.message, { status: 500 })

  let sent = 0
  const expired: string[] = []

  await Promise.all(
    messages.flatMap((m) =>
      (subs ?? [])
        .filter((s) => s.user_id === m.user_id)
        .map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ title: m.title, body: m.body, tag: m.tag, url: m.url }),
              { TTL: 60 * 60 * 12, urgency: 'high' },
            )
            sent++
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode
            if (status === 404 || status === 410) expired.push(s.id)
            else console.error('push failed', status, err)
          }
        }),
    ),
  )

  if (expired.length) await supabase.from('push_subscriptions').delete().in('id', expired)

  return Response.json({ messages: messages.length, sent, expired: expired.length })
})
