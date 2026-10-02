import { motion } from 'framer-motion'
import { ArrowRight, Building2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, ErrorBox, PageHeader, Segmented, Spinner } from '../components/ui'
import { cx, date, money, num } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { AgedBalance, AgedBucket } from '../lib/types'

type Kind = 'receivable' | 'payable'
const bucketTone: Record<AgedBucket, string> = { not_due: 'text-label-2', d1_30: 'text-yellow', d31_60: 'text-orange', d61_90: 'text-red', d90: 'text-red' }

/** "Who owes whom": receivables (they owe us) and payables (we owe them) side by side, with arrows. */
export default function Aged() {
  const [params, setParams] = useSearchParams()
  const kind = (params.get('kind') ?? 'receivable') as Kind
  const receivable = useFetch<AgedBalance>('/reports/aged/?kind=receivable')
  const payable = useFetch<AgedBalance>('/reports/aged/?kind=payable')
  const [open, setOpen] = useState<number | null>(null)
  const data = kind === 'receivable' ? receivable.data : payable.data
  const error = receivable.error ?? payable.error
  const theyOwe = num(receivable.data?.totals.total)
  const weOwe = num(payable.data?.totals.total)

  return (
    <>
      <PageHeader title="Who Owes Whom" subtitle="Money customers still owe us, and money we still owe vendors." />

      {error && <ErrorBox message={error} />}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <button onClick={() => setParams({ kind: 'receivable' })} className={cx('card p-5 text-left transition', kind === 'receivable' && 'ring-2 ring-green/60')}>
          <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-green">They owe us · Receivable</div>
          <div className="my-3 flex items-center gap-2 text-[14px]">
            <span className="rounded-lg bg-surface-2 px-2.5 py-1">Customers</span>
            <motion.span animate={{ x: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}><ArrowRight className="size-5 text-green" /></motion.span>
            <span className="rounded-lg bg-blue/20 px-2.5 py-1 text-blue">Nexus Furniture</span>
          </div>
          <div className="text-[28px] font-bold text-green tnum">{money(theyOwe)}</div>
          <p className="text-[13px] text-label-2">Money that will come <b>in</b>. An <b>asset</b> 🔵: it's ours, just not in the bank yet.</p>
        </button>
        <button onClick={() => setParams({ kind: 'payable' })} className={cx('card p-5 text-left transition', kind === 'payable' && 'ring-2 ring-orange/60')}>
          <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-orange">We owe them · Payable</div>
          <div className="my-3 flex items-center gap-2 text-[14px]">
            <span className="rounded-lg bg-blue/20 px-2.5 py-1 text-blue">Nexus Furniture</span>
            <motion.span animate={{ x: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}><ArrowRight className="size-5 text-orange" /></motion.span>
            <span className="rounded-lg bg-surface-2 px-2.5 py-1">Vendors</span>
          </div>
          <div className="text-[28px] font-bold text-orange tnum">{money(weOwe)}</div>
          <p className="text-[13px] text-label-2">Money that must go <b>out</b>. A <b>liability</b> 🟠: a debt we have to pay.</p>
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented<Kind> value={kind} onChange={(v) => setParams({ kind: v })} options={[{ value: 'receivable', label: 'Customers owe us' }, { value: 'payable', label: 'We owe vendors' }]} />
        <span className="text-[13px] text-label-2">Net position: <b className={cx('tnum', theyOwe - weOwe >= 0 ? 'text-green' : 'text-orange')}>{money(theyOwe - weOwe)}</b></span>
      </div>

      {!data ? <Spinner /> : (
        <Card>
          {data.partners.length === 0 ? (
            <p className="py-6 text-center text-label-2">{kind === 'receivable' ? 'No customer owes us anything right now. 🎉' : 'We don\'t owe any vendor right now.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[14px]">
                <thead className="text-left text-[12px] text-label-3">
                  <tr className="border-b border-line">
                    <th className="pb-2 font-medium">{kind === 'receivable' ? 'Customer' : 'Vendor'}</th>
                    {data.buckets.map((b) => <th key={b.key} className="pb-2 text-right font-medium">{b.label}</th>)}
                    <th className="pb-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.partners.map((p) => (
                    <Fragment key={p.partner}>
                      <tr onClick={() => setOpen(open === p.partner ? null : p.partner)} className="cursor-pointer border-b border-line/60 transition hover:bg-white/[0.03]">
                        <td className="py-2.5"><span className="flex items-center gap-2 font-medium"><Building2 className="size-4 text-label-3" />{p.name}</span></td>
                        {data.buckets.map((b) => <td key={b.key} className={cx('py-2.5 text-right tnum', num(p[b.key]) ? bucketTone[b.key] : 'text-label-3')}>{num(p[b.key]) ? money(p[b.key]) : '—'}</td>)}
                        <td className="py-2.5 text-right font-semibold tnum">{money(p.total)}</td>
                      </tr>
                      {open === p.partner && p.documents.map((d) => (
                        <tr key={`${p.partner}-${d.id}`} className="bg-white/[0.02] text-[13px]">
                          <td className="py-2 pl-8" colSpan={2}><Link to={`${kind === 'receivable' ? '/invoices' : '/bills'}/${d.id}`} className="text-blue tnum">{d.name}</Link></td>
                          <td className="py-2 text-label-2" colSpan={2}>due {date(d.due)}</td>
                          <td className={cx('py-2', bucketTone[d.bucket])} colSpan={2}>{d.days_late ? `${d.days_late} days late` : 'on time'}</td>
                          <td className="py-2 text-right tnum">{money(d.residual)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line font-semibold">
                    <td className="pt-3">Total</td>
                    {data.buckets.map((b) => <td key={b.key} className="pt-3 text-right tnum">{money(data.totals[b.key])}</td>)}
                    <td className="pt-3 text-right tnum">{money(data.totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="mt-4 text-[13px] text-label-3">The columns show how late each amount is. The further right, the more worrying: old debts are less likely to be paid (for customers) or may cost penalties (for vendors).</p>
        </Card>
      )}
    </>
  )
}
