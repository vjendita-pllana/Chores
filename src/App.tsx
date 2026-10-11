import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { useHousehold } from './lib/queries'
import { syncSubscription } from './lib/push'
import { Login } from './components/Login'
import { Onboarding } from './components/Onboarding'
import { Home } from './components/Home'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) syncSubscription().catch(() => {})
  }, [session])

  if (session === undefined) return null
  if (!session) return <Login />
  return <SignedIn userId={session.user.id} />
}

function SignedIn({ userId }: { userId: string }) {
  const { data: household, isLoading, error } = useHousehold(userId)
  if (isLoading) return null
  if (error) return <p className="p-6 text-clay">{error.message}</p>
  if (!household) return <Onboarding />
  return <Home household={household} userId={userId} />
}
