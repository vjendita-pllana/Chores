import { useMemo, useRef, useState } from 'react'
import type { Member, ShoppingItem } from '../lib/supabase'
import { useAddItem, useAssignItems, useDeleteItems, useItems, useToggleBought, useUpdateItem } from '../lib/queries'
import { CheckCircle, Segmented } from './ChoresView'
import { Avatar, Sheet } from './Sheet'

type Section = { key: string; title: string; items: ShoppingItem[] }

export function BuyView({ householdId: hid, members, userId }: {
  householdId: string
  members: Member[]
  userId: string
}) {
  const { data: items = [], isLoading } = useItems(hid)
  const add = useAddItem(hid)
  const toggle = useToggleBought(hid)
  const assign = useAssignItems(hid)
  const del = useDeleteItems(hid)

  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState<'all' | 'mine'>('all')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<ShoppingItem | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const nameOf = (id: string | null) => members.find((m) => m.user_id === id)?.display_name ?? 'Someone'

  const sections = useMemo<Section[]>(() => {
    const open = items.filter((i) => !i.bought_at && (filter === 'all' || i.assignee_id === userId))
    const bought = items
      .filter((i) => i.bought_at && (filter === 'all' || i.assignee_id === userId || i.bought_by === userId))
      .sort((a, b) => b.bought_at!.localeCompare(a.bought_at!))
    const ordered = [...members].sort((a, b) => (a.user_id === userId ? -1 : b.user_id === userId ? 1 : 0))
    return [
      { key: 'none', title: 'Not assigned', items: open.filter((i) => !i.assignee_id) },
      ...ordered.map((m) => ({
        key: m.user_id,
        title: m.user_id === userId ? 'For me' : `For ${m.display_name}`,
        items: open.filter((i) => i.assignee_id === m.user_id),
      })),
      { key: 'bought', title: 'Bought', items: bought },
    ].filter((s) => s.items.length)
  }, [items, members, filter, userId])

  const openCount = items.filter((i) => !i.bought_at).length

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const name = draft.trim()
    if (!name) return
    add.mutate({ name })
    setDraft('')
    inputRef.current?.focus()
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelect() {
    setSelecting(false)
    setSelected(new Set())
  }

  function assignSelected(assignee: string | null) {
    assign.mutate({ ids: [...selected], assignee }, { onSuccess: exitSelect })
  }

  return (
    <>
      <form onSubmit={submit} className="mb-5 flex gap-2">
        <input ref={inputRef} className="field" placeholder="Add something to buy" maxLength={80}
          value={draft} onChange={(e) => setDraft(e.target.value)} enterKeyHint="done" />
        <button className="btn-primary shrink-0 px-5" disabled={!draft.trim()}>Add</button>
      </form>

      <div className="flex items-center justify-between">
        <Segmented value={filter} onChange={setFilter}
          options={[{ v: 'all', label: 'Everyone' }, { v: 'mine', label: 'Mine' }]} />
        {openCount > 0 && (
          <button className="mb-5 rounded-lg px-2 py-1.5 text-sm font-medium text-moss"
            onClick={() => (selecting ? exitSelect() : setSelecting(true))}>
            {selecting ? 'Cancel' : 'Select'}
          </button>
        )}
      </div>

      {isLoading && <p className="text-muted">Loading…</p>}
      {!isLoading && !sections.length && (
        <div className="mt-16 text-center">
          <p className="font-display text-xl">The list is empty.</p>
          <p className="mt-1 text-muted">Add things above, then tap Select to hand them out.</p>
        </div>
      )}

      {sections.map((s) => (
        <section key={s.key} className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
              {s.title} · {s.items.length}
            </h2>
            {s.key === 'bought' && !selecting && (
              <button className="text-xs font-medium text-muted"
                onClick={() => confirm('Remove all bought items from the list?') && del.mutate(s.items.map((i) => i.id))}>
                Clear
              </button>
            )}
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {s.items.map((item) => {
              const bought = !!item.bought_at
              const pending = item.id.startsWith('temp-') // optimistic row not saved yet
              const canSelect = selecting && !bought && !pending
              const isSelected = selected.has(item.id)
              return (
                <li key={item.id} className={`flex items-center gap-3 px-3 py-2.5 ${isSelected ? 'bg-moss-soft/60' : ''} ${pending ? 'pointer-events-none opacity-60' : ''}`}>
                  {canSelect ? (
                    <button onClick={() => toggleSelect(item.id)} aria-label={`Select ${item.name}`} aria-pressed={isSelected}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition ${
                        isSelected ? 'border-moss bg-moss text-paper' : 'border-muted/40'}`}>
                      {isSelected && (
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 10.5l3.5 3.5L15 7" />
                        </svg>
                      )}
                    </button>
                  ) : (
                    <CheckCircle checked={bought} onClick={() => toggle.mutate(item.id)}
                      label={bought ? `Mark ${item.name} not bought` : `Mark ${item.name} bought`} />
                  )}
                  <button className="min-w-0 flex-1 py-0.5 text-left"
                    onClick={() => (canSelect ? toggleSelect(item.id) : setEditing(item))}>
                    <span className={`block truncate ${bought ? 'text-muted line-through' : 'font-medium'}`}>{item.name}</span>
                    {(item.note || (bought && item.bought_by)) && (
                      <span className="block truncate text-sm text-muted">
                        {bought && item.bought_by ? `Bought by ${item.bought_by === userId ? 'me' : nameOf(item.bought_by)}` : item.note}
                      </span>
                    )}
                  </button>
                  {item.assignee_id && s.key === 'bought' && (
                    <Avatar name={nameOf(item.assignee_id)} active={item.assignee_id === userId} />
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4rem)] z-30 px-4">
          <div className="mx-auto max-w-md rounded-2xl bg-ink p-3 text-paper shadow-2xl">
            <p className="px-1 text-sm">
              {selected.size ? `Give ${selected.size} ${selected.size === 1 ? 'item' : 'items'} to` : 'Tap items to select them'}
            </p>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
              {members.map((m) => (
                <button key={m.user_id} disabled={!selected.size || assign.isPending}
                  onClick={() => assignSelected(m.user_id)}
                  className="flex shrink-0 items-center gap-2 rounded-full bg-paper/10 py-1.5 pl-1.5 pr-3.5 text-sm font-medium transition active:bg-paper/20 disabled:opacity-40">
                  <Avatar name={m.display_name} />
                  {m.user_id === userId ? 'Me' : m.display_name}
                </button>
              ))}
              <button disabled={!selected.size || assign.isPending} onClick={() => assignSelected(null)}
                className="shrink-0 rounded-full px-3 py-1.5 text-sm text-paper/70 disabled:opacity-40">
                Nobody
              </button>
            </div>
          </div>
        </div>
      )}

      <ItemSheet item={editing} onClose={() => setEditing(null)} householdId={hid} members={members} userId={userId} />
    </>
  )
}

function ItemSheet({ item, onClose, householdId, members, userId }: {
  item: ShoppingItem | null
  onClose: () => void
  householdId: string
  members: Member[]
  userId: string
}) {
  return (
    <Sheet open={!!item} onClose={onClose} title="Item">
      {item && <ItemForm key={item.id} item={item} onDone={onClose} householdId={householdId} members={members} userId={userId} />}
    </Sheet>
  )
}

function ItemForm({ item, onDone, householdId, members, userId }: {
  item: ShoppingItem
  onDone: () => void
  householdId: string
  members: Member[]
  userId: string
}) {
  const [name, setName] = useState(item.name)
  const [note, setNote] = useState(item.note ?? '')
  const [assignee, setAssignee] = useState(item.assignee_id)
  const update = useUpdateItem(householdId)
  const assign = useAssignItems(householdId)
  const del = useDeleteItems(householdId)

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim() !== item.name || (note.trim() || null) !== item.note) {
      update.mutate({ id: item.id, name: name.trim(), note: note.trim() || null })
    }
    if (assignee !== item.assignee_id && !item.bought_at) {
      assign.mutate({ ids: [item.id], assignee })
    }
    onDone()
  }

  return (
    <form onSubmit={save} className="space-y-5 pb-2">
      <div>
        <label className="label" htmlFor="item-name">Name</label>
        <input id="item-name" className="field" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="item-note">Note</label>
        <input id="item-note" className="field" maxLength={200} placeholder="Brand, size, where to get it"
          value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {!item.bought_at && (
        <fieldset>
          <legend className="label">Who buys it</legend>
          <div className="flex flex-wrap gap-2">
            {[...members.map((m) => ({ id: m.user_id as string | null, label: m.user_id === userId ? 'Me' : m.display_name, name: m.display_name })),
              { id: null, label: 'Nobody yet', name: '' }].map((o) => {
              const active = assignee === o.id
              return (
                <button type="button" key={o.id ?? 'none'} onClick={() => setAssignee(o.id)} aria-pressed={active}
                  className={`flex items-center gap-2 rounded-full border py-1.5 text-sm transition ${o.id ? 'pl-1.5 pr-3.5' : 'px-3.5'} ${
                    active ? 'border-moss bg-moss-soft font-medium' : 'border-line bg-card'}`}>
                  {o.id && <Avatar name={o.name} active={active} />}
                  {o.label}
                </button>
              )
            })}
          </div>
          {assignee && assignee !== userId && assignee !== item.assignee_id && (
            <p className="mt-2 text-sm text-muted">They'll get a notification.</p>
          )}
        </fieldset>
      )}
      <button className="btn-primary w-full">Save</button>
      <button type="button" className="btn-ghost w-full text-clay"
        onClick={() => { del.mutate([item.id]); onDone() }}>
        Delete
      </button>
    </form>
  )
}
