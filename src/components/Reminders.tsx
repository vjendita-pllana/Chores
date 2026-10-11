import { useEffect, useState } from 'react'
import { disablePush, enablePush, getPushState, type PushState } from '../lib/push'

const EVENT = 'chores:push-state'

/** Push state shared between the banner and the settings toggle. */
export function usePushState() {
  const [state, setLocal] = useState<PushState | null>(null)
  useEffect(() => {
    getPushState().then(setLocal).catch(() => setLocal('unsupported'))
    const onChange = (e: Event) => setLocal((e as CustomEvent<PushState>).detail)
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [])
  const setState = (s: PushState) => window.dispatchEvent(new CustomEvent(EVENT, { detail: s }))
  return [state, setState] as const
}

const help: Record<PushState, string> = {
  'needs-install':
    'On iPhone, open this page in Safari, tap Share, then "Add to Home Screen". Open Chores from your Home Screen and turn reminders on there.',
  unsupported: "This browser can't receive push reminders. Try Chrome on Android or Safari on iPhone (iOS 16.4+).",
  denied: 'Notifications are blocked. Allow them for Chores in your phone settings, then come back.',
  off: "You'll get a notification on this phone when one of your chores is due.",
  on: 'Reminders are on for this phone.',
}

/** Card shown on the home screen until reminders are on. */
export function RemindersBanner() {
  const [state, setState] = usePushState()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!state || state === 'on') return null

  async function turnOn() {
    setBusy(true)
    setError(null)
    try {
      setState(await enablePush())
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  return (
    <section className="mb-6 rounded-2xl border border-moss/20 bg-moss-soft p-4">
      <h2 className="font-medium text-moss">Turn on reminders</h2>
      <p className="mt-1 text-sm text-ink/80">{help[state]}</p>
      {state === 'off' && (
        <button className="btn-primary mt-3 py-2.5 text-sm" onClick={turnOn} disabled={busy}>
          {busy ? 'Asking…' : 'Enable reminders'}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-clay">{error}</p>}
    </section>
  )
}

export function RemindersSetting() {
  const [state, setState] = usePushState()
  const [busy, setBusy] = useState(false)
  if (!state) return null
  const toggleable = state === 'on' || state === 'off'

  async function toggle() {
    setBusy(true)
    try {
      setState(state === 'on' ? await disablePush() : await enablePush())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-line bg-card px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">Reminders on this phone</span>
        {toggleable && (
          <button role="switch" aria-checked={state === 'on'} disabled={busy} onClick={toggle}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${state === 'on' ? 'bg-moss' : 'bg-line'}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-card shadow transition-all ${
              state === 'on' ? 'left-6' : 'left-1'}`} />
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">{help[state]}</p>
    </div>
  )
}
