import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (see .env.example)')
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export type Household = {
  id: string
  name: string
  timezone: string
  invite_code: string
  created_by: string
}

export type Member = {
  household_id: string
  user_id: string
  display_name: string
  role: 'owner' | 'member'
  joined_at: string
}

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly'

export type Chore = {
  id: string
  household_id: string
  title: string
  notes: string | null
  assignee_id: string | null
  due_at: string
  remind_before_min: number
  repeat: Repeat
  rotate: boolean
  done_at: string | null
  done_by: string | null
  created_by: string
}
