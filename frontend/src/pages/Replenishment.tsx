import { motion } from 'framer-motion'
import { CheckCircle2, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAction } from '../components/toast'
import { Button, Empty, ErrorBox, Lesson, PageHeader, Spinner } from '../components/ui'
import { post } from '../lib/api'
import { cx, money, num, qty } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { PurchaseOrder, ReplenishmentRow } from '../lib/types'

export default function Replenishment() {
  const { data, error, loading } = useFetch<ReplenishmentRow[]>('/replenishment/')
  const [picked, setPicked] = useState<Record<number, string>>({})
  const { run, busy } = useAction()
  const navigate = useNavigate()

  useEffect(() => {
    if (data) setPicked(Object.fromEntries(data.filter((r) => r.vendor).map((r) => [r.id, String(num(r.suggested))])))
  }, [data])

  const selected = Object.entries(picked).filter(([, q]) => num(q) > 0)
  const total = (data ?? []).reduce((s, r) => s + (picked[r.id] ? num(picked[r.id]) * num(r.cost) : 0), 0)

  const order = async () => {
    const items = selected.map(([product, quantity]) => ({ product: Number(product), quantity }))
    const orders = await run('order', () => post<PurchaseOrder[]>('/replenishment/', { items }), 'RFQs created')
    if (orders) navigate(orders.length === 1 ? `/purchases/${orders[0].id}` : '/purchases?state=draft')
  }

  return (
    <>
      <PageHeader
        title="Replenishment"
        subtitle="Products that will run out soon, with a suggested quantity to buy."
        actions={<Button icon={<RefreshCw className="size-4" />} loading={busy === 'order'} disabled={!selected.length} onClick={order}>Create RFQs ({selected.length})</Button>}
      />

      <Lesson step="Step 4 · Procure-to-Pay" title="Reordering rules">
        <p>The ERP looks at the <b>forecast</b>: on hand − reserved for customers + already ordered from vendors. When the forecast drops to the <b>reorder point</b>, it suggests buying enough to get back to twice that level.</p>
        <p>Clicking <b>Create RFQs</b> drafts one request per vendor, using each product's main supplier and current cost.</p>
      </Lesson>

      {error && <ErrorBox message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty icon={<CheckCircle2 className="size-6" />} title="Nothing to reorder" hint="Every product's forecast is above its reorder point." />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] text-[14px]">
              <thead className="text-left text-[12px] text-label-3">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 text-right font-medium">On hand</th>
                  <th className="px-4 py-3 text-right font-medium">Incoming</th>
                  <th className="px-4 py-3 text-right font-medium">Forecast</th>
                  <th className="px-4 py-3 text-right font-medium">Reorder at</th>
                  <th className="px-4 py-3 text-right font-medium">Order qty</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3"><div className="font-medium">{r.name}</div><div className="text-[12px] text-label-3 tnum">{r.sku} · {money(r.cost)} each</div></td>
                    <td className="px-4 py-3">{r.vendor_name ?? <Link to="/products" className="text-orange">Set a vendor</Link>}</td>
                    <td className="px-4 py-3 text-right tnum">{qty(r.on_hand)}</td>
                    <td className="px-4 py-3 text-right tnum text-teal">{num(r.incoming) ? `+${qty(r.incoming)}` : '—'}</td>
                    <td className={cx('px-4 py-3 text-right font-medium tnum', num(r.forecast) <= 0 ? 'text-red' : 'text-orange')}>{qty(r.forecast)}</td>
                    <td className="px-4 py-3 text-right tnum text-label-2">{qty(r.reorder_min)}</td>
                    <td className="px-4 py-3 text-right">
                      <input className="field !w-24 !py-1.5 text-right tnum" type="number" min={0} disabled={!r.vendor} value={picked[r.id] ?? ''} onChange={(e) => setPicked((p) => ({ ...p, [r.id]: e.target.value }))} />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-right text-[14px] text-label-2">Estimated spend (excl. VAT): <b className="text-label tnum">{money(total)}</b></p>
        </>
      )}
    </>
  )
}
