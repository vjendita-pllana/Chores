import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Chore, type Household, type Member, type Repeat } from './supabase'

export const keys = {
  household: ['household'] as const,
  members: (hid: string) => ['members', hid] as const,
  chores: (hid: string) => ['chores', hid] as const,
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

/** The household the signed-in user belongs to (first one; the app supports one per user). */
export function useHousehold(userId: string) {
  return useQuery({
    queryKey: keys.household,
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from('members')
          .select('households(*)')
          .eq('user_id', userId)
          .order('joined_at')
          .limit(1),
      ) as unknown as { households: Household }[]
      return rows[0]?.households ?? null
    },
  })
}

export function useMembers(hid: string) {
  return useQuery({
    queryKey: keys.members(hid),
    queryFn: async () =>
      unwrap(
        await supabase.from('members').select('*').eq('household_id', hid).order('joined_at'),
      ) as Member[],
  })
}

export function useChores(hid: string) {
  return useQuery({
    queryKey: keys.chores(hid),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('chores')
          .select('*')
          .eq('household_id', hid)
          .order('due_at'),
      ) as Chore[],
  })
}

/** Refetch when anyone in the household changes something. */
export function useRealtime(hid: string) {
  const qc = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel(`household-${hid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chores', filter: `household_id=eq.${hid}` }, () =>
        qc.invalidateQueries({ queryKey: keys.chores(hid) }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `household_id=eq.${hid}` }, () =>
        qc.invalidateQueries({ queryKey: keys.members(hid) }),
      )
      .subscribe()
    const onFocus = () => qc.invalidateQueries({ queryKey: keys.chores(hid) })
    window.addEventListener('focus', onFocus)
    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('focus', onFocus)
    }
  }, [hid, qc])
}

export function useCreateHousehold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { name: string; displayName: string }) =>
      unwrap(await supabase.rpc('create_household', { p_name: v.name, p_display_name: v.displayName })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.household }),
  })
}

export function useJoinHousehold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { code: string; displayName: string }) =>
      unwrap(await supabase.rpc('join_household', { p_code: v.code, p_display_name: v.displayName })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.household }),
  })
}

export type ChoreInput = {
  title: string
  notes: string | null
  assignee_id: string | null
  due_at: string
  remind_before_min: number
  repeat: Repeat
  rotate: boolean
}

export function useSaveChore(hid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: ChoreInput & { id?: string }) => {
      if (id) {
        return unwrap(await supabase.from('chores').update(input).eq('id', id).select().single())
      }
      return unwrap(
        await supabase
          .from('chores')
          .insert({ ...input, household_id: hid })
          .select()
          .single(),
      )
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.chores(hid) }),
  })
}

export function useCompleteChore(hid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.rpc('complete_chore', { p_chore_id: id })),
    // optimistic: mark done immediately
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: keys.chores(hid) })
      const prev = qc.getQueryData<Chore[]>(keys.chores(hid))
      qc.setQueryData<Chore[]>(keys.chores(hid), (list) =>
        list?.map((c) => (c.id === id ? { ...c, done_at: new Date().toISOString() } : c)),
      )
      return { prev }
    },
    onError: (_e, _id, ctx) => ctx?.prev && qc.setQueryData(keys.chores(hid), ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.chores(hid) }),
  })
}

export function useReopenChore(hid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.rpc('reopen_chore', { p_chore_id: id })),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.chores(hid) }),
  })
}

export function useDeleteChore(hid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('chores').delete().eq('id', id)),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.chores(hid) }),
  })
}
