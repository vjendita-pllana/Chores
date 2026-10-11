import { useState } from 'react'
import { supabase, type Household, type Member } from '../lib/supabase'
import { RemindersSetting } from './Reminders'
import { Avatar, Sheet } from './Sheet'

export function Settings({ open, onClose, household, members, userId }: {
  open: boolean
  onClose: () => void
  household: Household
  members: Member[]
  userId: string
}) {
  const [copied, setCopied] = useState(false)
  const inviteUrl = `${location.origin}/?join=${household.invite_code}`

  async function share() {
    const text = `Join "${household.name}" on Chores. Open ${inviteUrl}, add it to your Home Screen, and use code ${household.invite_code}.`
    if (navigator.share) {
      await navigator.share({ title: 'Chores', text }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="space-y-6 pb-2">
        <RemindersSetting />

        <section>
          <h3 className="label">Invite roommates</h3>
          <div className="flex items-center justify-between rounded-xl border border-line bg-card px-3.5 py-3">
            <span className="font-mono text-2xl font-semibold tracking-[0.3em] text-moss">{household.invite_code}</span>
            <button className="btn-ghost py-2 text-sm" onClick={share}>{copied ? 'Copied' : 'Share'}</button>
          </div>
        </section>

        <section>
          <h3 className="label">{household.name}</h3>
          <ul className="divide-y divide-line rounded-xl border border-line bg-card">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 px-3.5 py-2.5">
                <Avatar name={m.display_name} size="md" active={m.user_id === userId} />
                <span className="flex-1">{m.display_name}{m.user_id === userId && <span className="text-muted"> (you)</span>}</span>
                {m.role === 'owner' && <span className="text-xs text-muted">Owner</span>}
              </li>
            ))}
          </ul>
        </section>

        <button className="btn-ghost w-full" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </Sheet>
  )
}
