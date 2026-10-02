import { ArrowRight, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { post } from '../lib/api'
import { money, num, qty } from '../lib/format'
import type { Move, Picking, SaleOrder } from '../lib/types'
import { MoveState, PickingState } from './status'
import { useAction } from './toast'
import { Button, Card, Sheet } from './ui'

type Mode = 'return' | 'credit'

/** Returns (goods back into stock) and credit notes (money back) for a confirmed sales order. */
export function AfterSales({ order, returns, credits, canReturn, canCredit, onChange }: {
  order: SaleOrder; returns: Picking[]; credits: Move[]; canReturn: boolean; canCredit: boolean; onChange: () => void
}) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [qtys, setQtys] = useState<Record<number, string>>({})
  const { run, busy } = useAction()

  const max = (l: SaleOrder['lines'][number]) => num(mode === 'return' ? l.qty_delivered : l.qty_invoiced)
  const open = (m: Mode) => {
    setQtys({})
    setMode(m)
  }
  const submit = async () => {
    const lines = Object.entries(qtys).filter(([, q]) => num(q) > 0).map(([line, quantity]) => ({ line: Number(line), quantity }))
    const path = mode === 'return' ? 'return' : 'credit-note'
    if (await run('submit', () => post(`/sale-orders/${order.id}/${path}/`, { lines }), mode === 'return' ? 'Return created' : 'Credit note posted')) {
      setMode(null)
      onChange()
    }
  }
  const act = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    if (await run(key, fn, msg)) onChange()
  }

  if (!canReturn && !returns.length && !credits.length) return null

  return (
    <Card title="After-sales: returns & credit notes" action={<Undo2 className="size-4 text-label-3" />}>
      <p className="mb-3 text-[13px] text-label-2">Something wrong after delivery? A <b className="text-label">return</b> brings goods back into stock; a <b className="text-label">credit note</b> cancels part of the invoice. Posted invoices are never edited.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!canReturn} onClick={() => open('return')}>Return products</Button>
        <Button variant="secondary" disabled={!canCredit} onClick={() => open('credit')}>Create credit note</Button>
      </div>
      <ul className="space-y-2">
        {returns.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-3 text-[14px]">
            <Link to={`/transfers?open=${p.id}`} className="font-medium text-blue tnum">{p.name}</Link>
            <span className="flex-1 text-label-2">{p.moves.map((m) => `${qty(m.quantity)} × ${m.product_name}`).join(', ')}</span>
            <PickingState picking={p} />
            {p.state === 'ready' && <Button className="!h-8" loading={busy === `r${p.id}`} onClick={() => act(`r${p.id}`, () => post(`/pickings/${p.id}/validate/`), 'Goods received back')}>Receive</Button>}
          </li>
        ))}
        {credits.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-3 text-[14px]">
            <Link to={`/invoices/${c.id}`} className="font-medium text-blue tnum">{c.name}</Link>
            <span className="flex-1 text-label-2">Credit {money(c.amount_total)}{num(c.amount_residual) > 0 && ` · ${money(c.amount_residual)} to refund`}</span>
            <MoveState move={c} />
            {c.state === 'posted' && num(c.amount_residual) > 0 && (
              <Button className="!h-8" variant="success" loading={busy === `c${c.id}`} onClick={() => act(`c${c.id}`, () => post(`/moves/${c.id}/register-payment/`, {}), 'Customer refunded')}>Refund</Button>
            )}
          </li>
        ))}
      </ul>

      <Sheet open={!!mode} onClose={() => setMode(null)} title={mode === 'return' ? 'Return products' : 'Create credit note'}
        footer={<><Button variant="secondary" onClick={() => setMode(null)}>Cancel</Button><Button loading={busy === 'submit'} disabled={!Object.values(qtys).some((q) => num(q) > 0)} onClick={submit}>{mode === 'return' ? 'Create Return' : 'Post Credit Note'}</Button></>}>
        <p className="mb-4 text-[14px] text-label-2">
          {mode === 'return'
            ? 'How many units come back? The warehouse will validate the return to put them back in stock.'
            : 'How many units do you credit? Sales and VAT are reversed. If the invoice is still unpaid, the credit reduces it; otherwise you will refund the customer.'}
        </p>
        <ul className="space-y-2">
          {order.lines.filter((l) => max(l) > 0).map((l) => (
            <li key={l.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{l.product_name}</span>
                <span className="text-[12px] text-label-3">{mode === 'return' ? 'Delivered' : 'Invoiced'}: {qty(max(l))} · {money(l.price_unit)} each</span>
              </span>
              <ArrowRight className="size-4 text-label-3" />
              <input className="field !w-20 text-right tnum" type="number" min={0} max={max(l)} value={qtys[l.id!] ?? ''} placeholder="0"
                onChange={(e) => setQtys({ ...qtys, [l.id!]: e.target.value })} />
            </li>
          ))}
        </ul>
      </Sheet>
    </Card>
  )
}
