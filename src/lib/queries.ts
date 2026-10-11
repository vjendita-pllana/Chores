import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Chore, type Household, type Member, type Repeat, type ShoppingItem } from './supabase'

export const keys = {
  household: ['household'] as const,
  members: (hid: string) => ['members', hid] as const,
  chores: (hid: string) => ['chores', hid] as const,
  items: (hid: string) => ['items', hid] as const,
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter: `household_id=eq.${hid}` }, () =>
        qc.invalidateQueries({ queryKey: keys.items(hid) }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `household_id=eq.${hid}` }, () =>
        qc.invalidateQueries({ queryKey: keys.members(hid) }),
      )
      .subscribe()
    const onFocus = () => {
      qc.invalidateQueries({ queryKey: keys.chores(hid) })
      qc.invalidateQueries({ queryKey: keys.items(hid) })
    }
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

// ─── To buy ──────────────────────────────────────────────────────────────

export function useItems(hid: string) {
  return useQuery({
    queryKey: keys.items(hid),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('shopping_items')
          .select('*')
          .eq('household_id', hid)
          .order('created_at'),
      ) as ShoppingItem[],
  })
}

/** Optimistically patches items in the cache, rolling back on error. */
function useItemMutation<V>(
  hid: string,
  fn: (v: V) => Promise<unknown>,
  patch?: (list: ShoppingItem[], v: V) => ShoppingItem[],
) {
  const qc = useQueryClient()
  const key = keys.items(hid)
  return useMutation({
    mutationFn: fn,
    onMutate: async (v: V) => {
      if (!patch) return {}
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ShoppingItem[]>(key)
      if (prev) qc.setQueryData(key, patch(prev, v))
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useAddItem(hid: string) {
  return useItemMutation(
    hid,
    async (v: { name: string; assignee_id?: string | null }) =>
      unwrap(await supabase.from('shopping_items').insert({ household_id: hid, name: v.name, assignee_id: v.assignee_id ?? null })),
    (list, v) => [
      ...list,
      {
        id: `temp-${Date.now()}`, household_id: hid, name: v.name, note: null, assignee_id: v.assignee_id ?? null,
        bought_at: null, bought_by: null, created_by: '', created_at: new Date().toISOString(),
      },
    ],
  )
}

export function useToggleBought(hid: string) {
  return useItemMutation(
    hid,
    async (id: string) => unwrap(await supabase.rpc('toggle_bought', { p_item_id: id })),
    (list, id) => list.map((i) => (i.id === id ? { ...i, bought_at: i.bought_at ? null : new Date().toISOString() } : i)),
  )
}

export function useAssignItems(hid: string) {
  return useItemMutation(
    hid,
    async (v: { ids: string[]; assignee: string | null }) =>
      unwrap(await supabase.rpc('assign_items', { p_item_ids: v.ids, p_assignee: v.assignee })),
    (list, v) => list.map((i) => (v.ids.includes(i.id) && !i.bought_at ? { ...i, assignee_id: v.assignee } : i)),
  )
}

export function useUpdateItem(hid: string) {
  return useItemMutation(
    hid,
    async (v: { id: string; name: string; note: string | null }) =>
      unwrap(await supabase.from('shopping_items').update({ name: v.name, note: v.note }).eq('id', v.id)),
    (list, v) => list.map((i) => (i.id === v.id ? { ...i, name: v.name, note: v.note } : i)),
  )
}

export function useDeleteItems(hid: string) {
  return useItemMutation(
    hid,
    async (ids: string[]) => unwrap(await supabase.from('shopping_items').delete().in('id', ids)),
    (list, ids) => list.filter((i) => !ids.includes(i.id)),
  )
}
