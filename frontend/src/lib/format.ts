import type { Dec } from './types'

export const CURRENCY = 'USD'

export const num = (v: Dec | null | undefined) => (v === null || v === undefined || v === '' ? 0 : Number(v))

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY })
const compactFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: CURRENCY,
  notation: 'compact',
  maximumFractionDigits: 1,
})
const qtyFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })

export const money = (v: Dec | null | undefined) => moneyFmt.format(num(v))
export const moneyCompact = (v: Dec | null | undefined) => compactFmt.format(num(v))
export const qty = (v: Dec | null | undefined) => qtyFmt.format(num(v))

export const date = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export const relative = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
  return date(iso)
}

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ')
