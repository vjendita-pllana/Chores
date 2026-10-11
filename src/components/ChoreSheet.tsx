import { useState } from 'react'
import type { Chore, Member, Repeat } from '../lib/supabase'
import { defaultDue, repeatLabel, toLocalInput } from '../lib/format'
import { useDeleteChore, useReopenChore, useSaveChore } from '../lib/queries'
import { Avatar, Sheet } from './Sheet'

const reminderOptions = [
  { v: 0, label: 'At due time' },
  { v: 15, label: '15 min before' },
  { v: 60, label: '1 hour before' },
  { v: 180, label: '3 hours before' },
  { v: 1440, label: '1 day before' },
]

export function ChoreSheet({ open, onClose, chore, members, householdId, userId }: {
  open: boolean
  onClose: () => void
  chore: Chore | null
  members: Member[]
  householdId: string
  userId: string
}) {
  return (
    <Sheet open={open} onClose={onClose} title={chore ? 'Edit chore' : 'New chore'}>
      {/* key resets the form when switching between chores */}
      {open && (
        <ChoreForm key={chore?.id ?? 'new'} chore={chore} members={members}
          householdId={householdId} userId={userId} onDone={onClose} />
      )}
    </Sheet>
  )
}

function ChoreForm({ chore, members, householdId, userId, onDone }: {
  chore: Chore | null
  members: Member[]
  householdId: string
  userId: string
  onDone: () => void
}) {
  const others = members.filter((m) => m.user_id !== userId)
  const [title, setTitle] = useState(chore?.title ?? '')
  const [notes, setNotes] = useState(chore?.notes ?? '')
  const [assignee, setAssignee] = useState<string | null>(
    chore ? chore.assignee_id : (others[0]?.user_id ?? userId),
  )
  const [due, setDue] = useState(toLocalInput(chore?.due_at ?? defaultDue()))
  const [remind, setRemind] = useState(chore?.remind_before_min ?? 0)
  const [repeat, setRepeat] = useState<Repeat>(chore?.repeat ?? 'none')
  const [rotate, setRotate] = useState(chore?.rotate ?? false)

  const save = useSaveChore(householdId)
  const del = useDeleteChore(householdId)
  const reopen = useReopenChore(householdId)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    save.mutate(
      {
        id: chore?.id,
        title: title.trim(),
        notes: notes.trim() || null,
        assignee_id: assignee,
        due_at: new Date(due).toISOString(),
        remind_before_min: remind,
        repeat,
        rotate: repeat !== 'none' && rotate,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-2">
      <div>
        <label className="label" htmlFor="title">What needs doing</label>
        <input id="title" className="field" required maxLength={120} autoFocus={!chore}
          placeholder="Take out the bins" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <fieldset>
        <legend className="label">Who</legend>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => {
            const active = assignee === m.user_id
            return (
              <button type="button" key={m.user_id} onClick={() => setAssignee(m.user_id)}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm transition ${
                  active ? 'border-moss bg-moss-soft font-medium' : 'border-line bg-card'
                }`}>
                <Avatar name={m.display_name} active={active} />
                {m.user_id === userId ? 'Me' : m.display_name}
              </button>
            )
          })}
        </div>
        {members.length < 2 && (
          <p className="mt-2 text-sm text-muted">Invite your roommates from Settings to assign them chores.</p>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label" htmlFor="due">When</label>
          <input id="due" className="field" type="datetime-local" required value={due}
            onChange={(e) => setDue(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="remind">Reminder</label>
          <select id="remind" className="field" value={remind} onChange={(e) => setRemind(Number(e.target.value))}>
            {reminderOptions.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="repeat">Repeat</label>
          <select id="repeat" className="field" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
            {(Object.keys(repeatLabel) as Repeat[]).map((r) => <option key={r} value={r}>{repeatLabel[r]}</option>)}
          </select>
        </div>
      </div>

      {repeat !== 'none' && (
        <label className="flex items-center justify-between rounded-xl border border-line bg-card px-3.5 py-3">
          <span>
            <span className="block font-medium">Take turns</span>
            <span className="text-sm text-muted">Passes to the next person each time it's done</span>
          </span>
          <input type="checkbox" className="h-5 w-5 accent-moss" checked={rotate}
            onChange={(e) => setRotate(e.target.checked)} />
        </label>
      )}

      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" className="field min-h-20" maxLength={500} value={notes}
          onChange={(e) => setNotes(e.target.value)} />
      </div>

      {save.error && <p className="rounded-lg bg-clay-soft px-3 py-2 text-sm text-clay">{save.error.message}</p>}

      <button className="btn-primary w-full" disabled={save.isPending}>
        {save.isPending ? 'Saving…' : chore ? 'Save' : 'Add chore'}
      </button>

      {chore && (
        <div className="flex gap-3">
          {chore.done_at && (
            <button type="button" className="btn-ghost flex-1"
              onClick={() => reopen.mutate(chore.id, { onSuccess: onDone })}>
              Mark not done
            </button>
          )}
          <button type="button" className="btn-ghost flex-1 text-clay"
            onClick={() => confirm('Delete this chore?') && del.mutate(chore.id, { onSuccess: onDone })}>
            Delete
          </button>
        </div>
      )}
    </form>
  )
}
