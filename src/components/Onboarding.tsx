import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCreateHousehold, useJoinHousehold } from '../lib/queries'
import { friendlyError } from '../lib/format'

export function Onboarding() {
  const inviteFromUrl = new URLSearchParams(location.search).get('join') ?? ''
  const [mode, setMode] = useState<'join' | 'create'>(inviteFromUrl ? 'join' : 'create')
  const [displayName, setDisplayName] = useState('')
  const [homeName, setHomeName] = useState('Our flat')
  const [code, setCode] = useState(inviteFromUrl)
  const create = useCreateHousehold()
  const join = useJoinHousehold()
  const pending = create.isPending || join.isPending
  const error = create.error ?? join.error

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (mode === 'create') create.mutate({ name: homeName.trim(), displayName: displayName.trim() })
    else
      join.mutate(
        { code, displayName: displayName.trim() },
        { onSuccess: () => history.replaceState(null, '', '/') },
      )
  }

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="font-display text-3xl font-semibold text-moss">Set up your home</h1>

      <div className="mt-8 grid grid-cols-2 rounded-xl bg-line/60 p-1 text-sm font-medium">
        {(['create', 'join'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg py-2 transition ${mode === m ? 'bg-card shadow-sm' : 'text-muted'}`}
          >
            {m === 'create' ? 'Create a home' : 'I have a code'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input id="name" className="field" required maxLength={30} value={displayName}
            onChange={(e) => setDisplayName(e.target.value)} />
        </div>

        {mode === 'create' ? (
          <div>
            <label className="label" htmlFor="home">Home name</label>
            <input id="home" className="field" required maxLength={40} value={homeName}
              onChange={(e) => setHomeName(e.target.value)} />
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="code">Invite code</label>
            <input id="code" className="field uppercase tracking-widest" required maxLength={6} value={code}
              autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </div>
        )}

        <button className="btn-primary w-full" disabled={pending}>
          {pending ? 'One moment…' : mode === 'create' ? 'Create' : 'Join'}
        </button>
        {error && <p className="rounded-lg bg-clay-soft px-3 py-2 text-sm text-clay">{friendlyError(error)}</p>}
      </form>

      <button className="mt-10 text-sm text-muted" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
    </main>
  )
}
