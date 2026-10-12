import type { Chore } from './supabase'

const dayMs = 24 * 60 * 60 * 1000

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function dueLabel(iso: string, now = new Date()) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const diffDays = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / dayMs)
  if (diffDays === 0) return `Today ${time}`
  if (diffDays === 1) return `Tomorrow ${time}`
  if (diffDays === -1) return `Yesterday ${time}`
  if (diffDays > 1 && diffDays < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`
}

export type Group = 'overdue' | 'today' | 'upcoming' | 'done'

export function groupOf(c: Chore, now = new Date()): Group {
  if (c.done_at) return 'done'
  const due = new Date(c.due_at)
  if (due < now) return 'overdue'
  if (startOfDay(due).getTime() === startOfDay(now).getTime()) return 'today'
  return 'upcoming'
}

/** `<input type="datetime-local">` value in local time */
export function toLocalInput(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function defaultDue() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(19, 0, 0, 0)
  return d.toISOString()
}

export const repeatLabel = { none: 'Once', daily: 'Every day', weekly: 'Every week', monthly: 'Every month' } as const

/** Dropped connection: iOS Safari says "Load failed", Chrome "Failed to fetch".
 *  supabase-js passes these on as a plain Error with message "TypeError: Load failed". */
export function isNetworkError(e: unknown) {
  return e instanceof Error && /load failed|failed to fetch|networkerror|network request failed/i.test(e.message)
}

export function friendlyError(e: Error) {
  if (isNetworkError(e)) {
    return "Couldn't reach the server. Check your connection and try again."
  }
  return e.message
}
