import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { post } from '../lib/api'
import { cx, money, num } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Account, Move } from '../lib/types'
import { useAction } from './toast'
import { Button, Field, Sheet } from './ui'

type Line = { account: number | ''; debit: string; credit: string }

// Everyday operations that don't come from another module, expressed as debit/credit pairs.
const TEMPLATES: { label: string; why: string; debit: string; credit: string; amount: number }[] = [
  { label: 'Pay rent', why: 'Expense goes up (debit), bank goes down (credit).', debit: '610000', credit: '101000', amount: 1500 },
  { label: 'Pay salaries', why: 'Expense goes up (debit), bank goes down (credit).', debit: '620000', credit: '101000', amount: 4200 },
  { label: 'Owner invests cash', why: 'Bank goes up (debit), owners’ equity goes up (credit).', debit: '101000', credit: '301000', amount: 10000 },
  { label: 'Buy a computer', why: 'One asset (equipment) up, another asset (bank) down.', debit: '151000', credit: '101000', amount: 1200 },
  { label: 'Pay VAT to the state', why: 'Our debt to the state (VAT Payable) goes down, bank goes down.', debit: '251000', credit: '101000', amount: 1000 },
]

export function ManualEntrySheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: Move) => void }) {
  const accounts = useFetch<Account[]>(open ? '/accounts/' : null).data ?? []
  const [ref, setRef] = useState('')
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<Line[]>([{ account: '', debit: '', credit: '' }, { account: '', debit: '', credit: '' }])
  const [why, setWhy] = useState('')
  const { run, busy } = useAction()

  const byCode = (code: string) => accounts.find((a) => a.code === code)?.id ?? ''
  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    setRef(t.label)
    setWhy(t.why)
    setLines([{ account: byCode(t.debit), debit: String(t.amount), credit: '' }, { account: byCode(t.credit), debit: '', credit: String(t.amount) }])
  }
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const debit = lines.reduce((s, l) => s + num(l.debit), 0)
  const credit = lines.reduce((s, l) => s + num(l.credit), 0)
  const balanced = debit > 0 && Math.abs(debit - credit) < 0.005
  const valid = balanced && lines.every((l) => l.account || (!num(l.debit) && !num(l.credit)))

  const save = async () => {
    const move = await run('save', () => post<Move>('/moves/manual/', { ref, date: entryDate, lines: lines.filter((l) => l.account) }), 'Entry posted')
    if (move) onDone(move)
  }

  return (
    <Sheet open={open} onClose={onClose} title="New Journal Entry" wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy === 'save'} disabled={!valid} onClick={save}>Post Entry</Button></>}>
      <div className="space-y-5">
        <div>
          <span className="label">Start from a common operation</span>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => <Button key={t.label} variant="secondary" className="!h-8 !text-[13px]" onClick={() => applyTemplate(t)}>{t.label}</Button>)}
          </div>
          {why && <p className="mt-2 rounded-lg bg-purple/10 px-3 py-2 text-[13px] text-purple">{why}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Description"><input className="field" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. October rent" /></Field>
          <Field label="Date"><input className="field" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></Field>
        </div>
        <div>
          <div className="mb-1.5 grid grid-cols-[1fr_110px_110px_32px] gap-2 text-[12px] font-medium text-label-3"><span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span /></div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px_110px_32px] items-center gap-2">
                <select className="field" value={l.account} onChange={(e) => setLine(i, { account: e.target.value ? Number(e.target.value) : '' })}>
                  <option value="">Select an account…</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                </select>
                <input className="field text-right tnum" type="number" min={0} step="0.01" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} />
                <input className="field text-right tnum" type="number" min={0} step="0.01" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} />
                <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length <= 2} className="grid size-8 place-items-center rounded-full text-label-3 hover:bg-red/15 hover:text-red disabled:opacity-30" aria-label="Remove line">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <Button variant="ghost" className="mt-2" icon={<Plus className="size-4" />} onClick={() => setLines((ls) => [...ls, { account: '', debit: '', credit: '' }])}>Add a line</Button>
        </div>
        <div className={cx('flex justify-between rounded-xl px-4 py-3 text-[14px] font-medium', balanced ? 'bg-green/10 text-green' : 'bg-orange/10 text-orange')}>
          <span>{balanced ? '✓ Balanced: debits equal credits' : 'Debits must equal credits'}</span>
          <span className="tnum">{money(debit)} / {money(credit)}</span>
        </div>
      </div>
    </Sheet>
  )
}
