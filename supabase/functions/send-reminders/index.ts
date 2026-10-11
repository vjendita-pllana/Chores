// Sends Web Push reminders for chores that are due.
// Called every few minutes by pg_cron (see supabase/cron.sql).
//
// Secrets (supabase secrets set ...):
//   CRON_SECRET          shared secret the cron job sends as a Bearer token
//   VAPID_PUBLIC_KEY     from `npx web-push generate-vapid-keys`
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT        mailto:you@example.com
//   APP_URL              https://your-app.vercel.app
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

type Due = {
  chore_id: string
  user_id: string
  title: string
  due_at: string
  kind: 'due' | 'overdue'
  household_tz: string
}

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

const appUrl = Deno.env.get('APP_URL') ?? '/'

function formatTime(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  }).format(new Date(iso))
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: due, error } = await supabase.rpc('claim_due_reminders')
  if (error) return new Response(error.message, { status: 500 })
  if (!due?.length) return Response.json({ sent: 0 })

  const userIds = [...new Set((due as Due[]).map((d) => d.user_id))]
  const { data: subs, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)
  if (subsError) return new Response(subsError.message, { status: 500 })

  let sent = 0
  const expired: string[] = []

  await Promise.all(
    (due as Due[]).flatMap((d) =>
      (subs ?? [])
        .filter((s) => s.user_id === d.user_id)
        .map(async (s) => {
          const payload = JSON.stringify({
            title: d.kind === 'overdue' ? `Still waiting: ${d.title}` : d.title,
            body:
              d.kind === 'overdue'
                ? 'This chore is over a day late. Tap to mark it done.'
                : `Due at ${formatTime(d.due_at, d.household_tz)}`,
            tag: `chore-${d.chore_id}`,
            url: `${appUrl}/?chore=${d.chore_id}`,
          })
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload,
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

  if (expired.length) {
    await supabase.from('push_subscriptions').delete().in('id', expired)
  }

  return Response.json({ reminders: due.length, sent, expired: expired.length })
})
