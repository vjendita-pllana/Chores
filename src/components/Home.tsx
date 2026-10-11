import { useState } from 'react'
import type { Household } from '../lib/supabase'
import { useMembers, useRealtime } from '../lib/queries'
import { BuyView } from './BuyView'
import { ChoresView } from './ChoresView'
import { RemindersBanner } from './Reminders'
import { Settings } from './Settings'
import { Avatar } from './Sheet'

export type Tab = 'chores' | 'buy'

export function Home({ household, userId }: { household: Household; userId: string }) {
  const hid = household.id
  useRealtime(hid)
  const { data: members = [] } = useMembers(hid)
  const [tab, setTab] = useState<Tab>(() =>
    new URLSearchParams(location.search).get('tab') === 'buy' ? 'buy' : 'chores',
  )
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <>
      <main className="safe-top mx-auto min-h-dvh max-w-md px-5 pb-44">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">
              {new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="font-display text-3xl font-semibold text-moss">
              {tab === 'chores' ? household.name : 'To buy'}
            </h1>
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

        {tab === 'chores' ? (
          <ChoresView householdId={hid} members={members} userId={userId} />
        ) : (
          <BuyView householdId={hid} members={members} userId={userId} />
        )}
      </main>

      <TabBar tab={tab} onChange={(t) => { setTab(t); window.scrollTo({ top: 0 }) }} />

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)}
        household={household} members={members} userId={userId} />
    </>
  )
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'chores',
      label: 'Chores',
      icon: <path d="M4 12.5l4.5 4.5L20 6.5" />,
    },
    {
      id: 'buy',
      label: 'To buy',
      icon: (
        <>
          <path d="M3.5 5h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.3a1.5 1.5 0 0 0 1.5-1.2L20.5 8H6.4" />
          <circle cx="9.5" cy="20" r="1.2" />
          <circle cx="17.5" cy="20" r="1.2" />
        </>
      ),
    },
  ]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/90 backdrop-blur-md">
      <div className="safe-bottom mx-auto grid max-w-md grid-cols-2 px-5 pt-2">
        {tabs.map((t) => {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => onChange(t.id)} aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 py-1 text-xs font-medium transition ${active ? 'text-moss' : 'text-muted'}`}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor"
                strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
                {t.icon}
              </svg>
              {t.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
