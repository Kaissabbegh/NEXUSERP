import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { ErrorBox, Lesson, PageHeader, Pill, Spinner } from '../components/ui'
import { cx, money, num, qty } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { StockRow } from '../lib/types'

export default function Stock() {
  const { data, error, loading } = useFetch<StockRow[]>('/stock/')
  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!data) return null

  const total = data.reduce((s, r) => s + num(r.value), 0)
  const max = Math.max(1, ...data.map((r) => num(r.on_hand)))

  return (
    <>
      <PageHeader title="Stock" subtitle={<>Main Warehouse · total value <b className="text-label tnum">{money(total)}</b></>} />

      <Lesson step="Step 5 · Inventory" title="On hand vs. available">
        <p><b>On hand</b> is what's physically on the shelf. <b>Reserved</b> is promised to confirmed orders that haven't shipped yet. <b>Available</b> = on hand − reserved: what sales can still promise.</p>
        <p>Stock value (on hand × cost) equals the balance of account <b>110100 Inventory</b> in the chart of accounts. Inventory and accounting always agree.</p>
      </Lesson>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-[14px]">
          <thead className="text-left text-[12px] text-label-3">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Level</th>
              <th className="px-4 py-3 text-right font-medium">On hand</th>
              <th className="px-4 py-3 text-right font-medium">Reserved</th>
              <th className="px-4 py-3 text-right font-medium">Available</th>
              <th className="px-4 py-3 text-right font-medium">Unit cost</th>
              <th className="px-4 py-3 text-right font-medium">Value</th>
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
                  <td className="w-[22%] px-4 py-3">
                    <div className="relative h-2 overflow-hidden rounded-full bg-surface-3">
                      <motion.div className={cx('absolute inset-y-0 left-0 rounded-full', r.low ? 'bg-orange' : 'bg-teal')} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: i * 0.04, duration: 0.6 }} />
                      <motion.div className="absolute inset-y-0 rounded-full bg-white/40" style={{ left: `${Math.max(pct - resPct, 0)}%` }} initial={{ width: 0 }} animate={{ width: `${Math.min(resPct, pct)}%` }} transition={{ delay: 0.3 + i * 0.04 }} />
                    </div>
                    {num(r.reorder_min) > 0 && <div className="mt-1 text-[11px] text-label-3">Reorder at {qty(r.reorder_min)}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tnum">{qty(r.on_hand)}</td>
                  <td className="px-4 py-3 text-right tnum text-label-2">{num(r.reserved) ? qty(r.reserved) : '—'}</td>
                  <td className={cx('px-4 py-3 text-right font-medium tnum', num(r.available) < 0 ? 'text-red' : r.low ? 'text-orange' : 'text-green')}>{qty(r.available)}</td>
                  <td className="px-4 py-3 text-right tnum text-label-2">{money(r.cost)}</td>
                  <td className="px-4 py-3 text-right tnum">{money(r.value)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line font-semibold">
              <td className="px-4 py-3" colSpan={6}>Total stock value</td>
              <td className="px-4 py-3 text-right tnum">{money(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}
