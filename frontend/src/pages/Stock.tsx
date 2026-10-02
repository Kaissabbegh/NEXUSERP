import { motion } from 'framer-motion'
import { AlertTriangle, ClipboardCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAction } from '../components/toast'
import { Button, ErrorBox, Field, Lesson, PageHeader, Pill, Sheet, Spinner } from '../components/ui'
import { post } from '../lib/api'
import { cx, money, num, qty } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { StockRow } from '../lib/types'

export default function Stock() {
  const { data, error, loading, reload } = useFetch<StockRow[]>('/stock/')
  const [counting, setCounting] = useState<{ row: StockRow; counted: string } | null>(null)
  const { run, busy } = useAction()

  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!data) return null

  const total = data.reduce((s, r) => s + num(r.value), 0)
  const max = Math.max(1, ...data.map((r) => num(r.on_hand)))
  const diff = counting ? num(counting.counted) - num(counting.row.on_hand) : 0

  const saveCount = async () => {
    if (!counting) return
    const ok = await run('count', () => post('/stock/adjust/', { product: counting.row.id, counted: counting.counted }), 'Stock count recorded')
    if (ok) {
      setCounting(null)
      reload()
    }
  }

  return (
    <>
      <PageHeader title="Stock" subtitle={<>Main Warehouse · total value <b className="text-label tnum">{money(total)}</b></>}
        actions={<Link to="/replenishment"><Button variant="secondary">Replenishment</Button></Link>} />

      <Lesson step="Step 5 · Inventory" title="On hand vs. available">
        <p><b>On hand</b> is what's physically on the shelf. <b>Reserved</b> is promised to confirmed orders that haven't shipped yet. <b>Available</b> = on hand − reserved. <b>Incoming</b> is ordered from vendors but not received.</p>
        <p>Stock value (on hand × cost) equals the balance of account <b>110100 Inventory</b>. Use <b>Count</b> after a physical count: any difference is posted as a gain or loss.</p>
      </Lesson>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-[14px]">
          <thead className="text-left text-[12px] text-label-3">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Level</th>
              <th className="px-4 py-3 text-right font-medium">On hand</th>
              <th className="px-4 py-3 text-right font-medium">Reserved</th>
              <th className="px-4 py-3 text-right font-medium">Available</th>
              <th className="px-4 py-3 text-right font-medium">Incoming</th>
              <th className="px-4 py-3 text-right font-medium">Unit cost</th>
              <th className="px-4 py-3 text-right font-medium">Value</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => {
              const pct = (num(r.on_hand) / max) * 100
              const resPct = (num(r.reserved) / max) * 100
              return (
                <tr key={r.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium">
                      {r.name}
                      {r.low && <Pill tone="orange"><AlertTriangle className="size-3" /> Low</Pill>}
                    </div>
                    <div className="text-[12px] text-label-3 tnum">{r.sku} · {r.category}</div>
                  </td>
                  <td className="w-[18%] px-4 py-3">
                    <div className="relative h-2 overflow-hidden rounded-full bg-surface-3">
                      <motion.div className={cx('absolute inset-y-0 left-0 rounded-full', r.low ? 'bg-orange' : 'bg-teal')} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: i * 0.03, duration: 0.6 }} />
                      <motion.div className="absolute inset-y-0 rounded-full bg-white/40" style={{ left: `${Math.max(pct - resPct, 0)}%` }} initial={{ width: 0 }} animate={{ width: `${Math.min(resPct, pct)}%` }} transition={{ delay: 0.3 + i * 0.03 }} />
                    </div>
                    {num(r.reorder_min) > 0 && <div className="mt-1 text-[11px] text-label-3">Reorder at {qty(r.reorder_min)}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tnum">{qty(r.on_hand)}</td>
                  <td className="px-4 py-3 text-right tnum text-label-2">{num(r.reserved) ? qty(r.reserved) : '—'}</td>
                  <td className={cx('px-4 py-3 text-right font-medium tnum', num(r.available) < 0 ? 'text-red' : r.low ? 'text-orange' : 'text-green')}>{qty(r.available)}</td>
                  <td className="px-4 py-3 text-right tnum text-teal">{num(r.incoming) ? `+${qty(r.incoming)}` : '—'}</td>
                  <td className="px-4 py-3 text-right tnum text-label-2">{money(r.cost)}</td>
                  <td className="px-4 py-3 text-right tnum">{money(r.value)}</td>
                  <td className="pr-3">
                    <button onClick={() => setCounting({ row: r, counted: String(num(r.on_hand)) })} className="rounded-full px-2.5 py-1 text-[13px] text-blue transition hover:bg-blue/10">Count</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line font-semibold">
              <td className="px-4 py-3" colSpan={7}>Total stock value</td>
              <td className="px-4 py-3 text-right tnum">{money(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <Sheet open={!!counting} onClose={() => setCounting(null)} title={`Count ${counting?.row.name ?? ''}`}
        footer={<><Button variant="secondary" onClick={() => setCounting(null)}>Cancel</Button><Button icon={<ClipboardCheck className="size-4" />} loading={busy === 'count'} disabled={!counting || counting.counted === '' || diff === 0} onClick={saveCount}>Apply Count</Button></>}>
        {counting && (
          <div className="space-y-4">
            <div className="rounded-xl bg-surface-2 p-4 text-[14px]">The system thinks there are <b className="tnum">{qty(counting.row.on_hand)} {counting.row.uom}</b> on the shelf. Go and count them, then type what you really found.</div>
            <Field label="Counted quantity"><input className="field tnum" type="number" min={0} value={counting.counted} onChange={(e) => setCounting({ ...counting, counted: e.target.value })} autoFocus /></Field>
            {diff !== 0 && counting.counted !== '' && (
              <div className={cx('rounded-xl p-4 text-[14px]', diff < 0 ? 'bg-red/10 text-red' : 'bg-green/10 text-green')}>
                {diff < 0 ? 'Missing' : 'Extra'} {qty(Math.abs(diff))} {counting.row.uom} worth <b className="tnum">{money(Math.abs(diff) * num(counting.row.cost))}</b>.
                <div className="mt-1 text-label-2">
                  {diff < 0
                    ? 'Posted as: Debit 630000 Inventory Differences (expense, a loss) / Credit 110100 Inventory.'
                    : 'Posted as: Debit 110100 Inventory / Credit 630000 Inventory Differences (reduces expenses, a gain).'}
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </>
  )
}
