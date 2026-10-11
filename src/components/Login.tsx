import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Uses a 6-digit email code instead of a magic link: on iPhone, a link would open
// in Safari and sign in there, not in the installed Home Screen app.
export function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setStep('code')
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError(error.message)
  }

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="font-display text-4xl font-semibold tracking-tight text-moss">Chores</h1>
      <p className="mt-2 text-muted">Shared chores, with a nudge when it's your turn.</p>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="mt-10 space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              className="field"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Send me a code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-10 space-y-4">
          <p className="text-sm text-muted">
            We sent a code to <span className="font-medium text-ink">{email}</span>.
          </p>
          <div>
            <label className="label" htmlFor="code">Code</label>
            <input
              id="code"
              className="field text-center text-2xl tracking-[0.4em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <button className="btn-primary w-full" disabled={busy || code.length < 6}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button type="button" className="w-full text-sm text-muted" onClick={() => setStep('email')}>
            Use a different email
          </button>
        </form>
      )}

      {error && <p className="mt-4 rounded-lg bg-clay-soft px-3 py-2 text-sm text-clay">{error}</p>}
    </main>
  )
}
