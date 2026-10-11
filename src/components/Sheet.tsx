import { useEffect, type ReactNode } from 'react'

export function Sheet({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="safe-bottom relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-paper px-5 pt-3 shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full px-2 py-1 text-sm text-muted">Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Avatar({ name, active = false, size = 'sm' }: { name: string; active?: boolean; size?: 'sm' | 'md' }) {
  const s = size === 'md' ? 'h-9 w-9 text-sm' : 'h-6 w-6 text-[11px]'
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${s} ${
        active ? 'bg-moss text-paper' : 'bg-moss-soft text-moss'
      }`}
      title={name}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
