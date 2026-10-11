import { useEffect, useMemo, useState } from 'react'
import type { Chore, Household } from '../lib/supabase'
import { dueLabel, groupOf, repeatLabel, type Group } from '../lib/format'
import { useChores, useCompleteChore, useMembers, useRealtime } from '../lib/queries'
import { ChoreSheet } from './ChoreSheet'
import { RemindersBanner } from './Reminders'
import { Settings } from './Settings'
import { Avatar } from './Sheet'

const groupTitle: Record<Group, string> = {
  overdue: 'Overdue',
  today: 'Today',
  upcoming: 'Coming up',
  done: 'Done',
}

export function Home({ household, userId }: { household: Household; userId: string }) {
  const hid = household.id
  useRealtime(hid)
  const { data: chores = [], isLoading } = useChores(hid)
  const { data: members = [] } = useMembers(hid)
  const complete = useCompleteChore(hid)

  const [filter, setFilter] = useState<'mine' | 'all'>('all')
  const [editing, setEditing] = useState<Chore | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const nameOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.user_id, m.display_name]))
    return (id: string | null) => (id ? (map.get(id) ?? 'Someone') : 'Anyone')
  }, [members])

  // Opened from a notification: /?chore=<id>
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('chore')
    if (!id || !chores.length) return
    const c = chores.find((x) => x.id === id)
    if (c) {
      setEditing(c)
      setSheetOpen(true)
    }
    history.replaceState(null, '', '/')
  }, [chores])

  const grouped = useMemo(() => {
    const visible = chores.filter((c) => filter === 'all' || c.assignee_id === userId)
    const recentCutoff = Date.now() - 3 * 24 * 60 * 60 * 1000
    const g: Record<Group, Chore[]> = { overdue: [], today: [], upcoming: [], done: [] }
    for (const c of visible) {
      const group = groupOf(c)
      if (group === 'done' && new Date(c.done_at!).getTime() < recentCutoff) continue
      g[group].push(c)
    }
    g.done.sort((a, b) => b.done_at!.localeCompare(a.done_at!))
    return g
  }, [chores, filter, userId])

  const empty = !isLoading && Object.values(grouped).every((l) => l.length === 0)

  return (
    <main className="safe-top mx-auto min-h-dvh max-w-md px-5 pb-32">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">{new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="font-display text-3xl font-semibold text-moss">{household.name}</h1>
        </div>
        <button onClick={() => setSettingsOpen(true)} aria-label="Settings" className="flex -space-x-2">
          {members.slice(0, 3).map((m) => (
            <span key={m.user_id} className="rounded-full ring-2 ring-paper">
              <Avatar name={m.display_name} size="md" active={m.user_id === userId} />
            </span>
          ))}
        </button>
      </header>

      <RemindersBanner />

      <div className="mb-5 inline-grid grid-cols-2 rounded-xl bg-line/60 p-1 text-sm font-medium">
        {(['all', 'mine'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-lg px-4 py-1.5 transition ${filter === f ? 'bg-card shadow-sm' : 'text-muted'}`}>
            {f === 'all' ? 'Everyone' : 'Mine'}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-muted">Loading…</p>}
      {empty && (
        <div className="mt-16 text-center">
          <p className="font-display text-xl">Nothing to do.</p>
          <p className="mt-1 text-muted">Add a chore with the + button.</p>
        </div>
      )}

      {(Object.keys(grouped) as Group[]).map((g) =>
        grouped[g].length ? (
          <section key={g} className="mb-6">
            <h2 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${g === 'overdue' ? 'text-clay' : 'text-muted'}`}>
              {groupTitle[g]} · {grouped[g].length}
            </h2>
            <ul className="space-y-2">
              {grouped[g].map((c) => (
                <ChoreRow key={c.id} chore={c} group={g} assignee={nameOf(c.assignee_id)}
                  isMine={c.assignee_id === userId}
                  onToggle={() => complete.mutate(c.id)}
                  onOpen={() => { setEditing(c); setSheetOpen(true) }} />
              ))}
            </ul>
          </section>
        ) : null,
      )}

      <button
        onClick={() => { setEditing(null); setSheetOpen(true) }}
        aria-label="Add chore"
        className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-moss text-3xl leading-none text-paper shadow-lg shadow-moss/30 transition active:scale-95"
      >
        +
      </button>

      <ChoreSheet open={sheetOpen} onClose={() => setSheetOpen(false)} chore={editing}
        members={members} householdId={hid} userId={userId} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)}
        household={household} members={members} userId={userId} />
    </main>
  )
}

function ChoreRow({ chore, group, assignee, isMine, onToggle, onOpen }: {
  chore: Chore
  group: Group
  assignee: string
  isMine: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const done = group === 'done'
  return (
    <li className={`flex items-center gap-3 rounded-2xl border bg-card px-3 py-3 ${
      group === 'overdue' ? 'border-clay/30' : 'border-line'} ${done ? 'opacity-60' : ''}`}>
      <button
        onClick={onToggle}
        disabled={done}
        aria-label={done ? 'Done' : `Mark "${chore.title}" done`}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${
          done ? 'border-moss bg-moss text-paper' : 'border-muted/40 active:bg-moss-soft'}`}
      >
        {done && (
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 10.5l3.5 3.5L15 7" />
          </svg>
        )}
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className={`block truncate font-medium ${done ? 'line-through' : ''}`}>{chore.title}</span>
        <span className={`block text-sm ${group === 'overdue' ? 'text-clay' : 'text-muted'}`}>
          {dueLabel(chore.due_at)}
          {chore.repeat !== 'none' && ` · ${repeatLabel[chore.repeat]}${chore.rotate ? ', taking turns' : ''}`}
        </span>
      </button>
      <span className="flex items-center gap-1.5 text-sm text-muted">
        <span className="hidden min-[380px]:inline">{isMine ? 'Me' : assignee}</span>
        <Avatar name={assignee} active={isMine} />
      </span>
    </li>
  )
}
