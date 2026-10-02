import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAction } from '../components/toast'
import { Button, Card, ErrorBox, Field, PageHeader, Pill, Spinner } from '../components/ui'
import { post } from '../lib/api'
import { cx, date, money, num } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { FixedAsset, Partner } from '../lib/types'
import { assetTone } from './Assets'

export default function AssetDetail() {
  const { id } = useParams()
  const { data: a, error, loading, reload } = useFetch<FixedAsset>(`/fixed-assets/${id}/`)
  const vendors = useFetch<Partner[]>('/partners/?role=vendor').data ?? []
  const [vendor, setVendor] = useState<number | ''>('')
  const { run, busy } = useAction()

  if (loading && !a) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!a) return null
  const act = async (key: string, path: string, body: unknown, msg: string) => {
    if (await run(key, () => post(`/fixed-assets/${a.id}/${path}/`, body), msg)) reload()
  }
  const schedule = a.schedule ?? []
  const nextIdx = schedule.findIndex((r) => !r.posted)

  return (
    <>
      <Link to="/assets" className="mb-3 inline-flex items-center gap-1 text-[14px] text-blue"><ArrowLeft className="size-4" /> Fixed Assets</Link>
      <PageHeader title={a.name} subtitle={<span className="flex items-center gap-2">{a.account_name} · {a.useful_life_months} months <Pill tone={assetTone[a.state]} dot>{a.state_display}</Pill></span>}
        actions={a.state === 'running' && nextIdx >= 0 ? <Button loading={busy === 'dep'} onClick={() => act('dep', 'depreciate', {}, 'Depreciation posted')}>Post next depreciation ({date(schedule[nextIdx].date)})</Button> : null} />

      {a.state === 'draft' && (
        <Card className="mb-4" title="Buy this asset">
          <p className="mb-3 text-[14px] text-label-2">Buying creates a vendor bill posted to <b className="text-label">{a.account_name}</b> (an asset), not to expenses.</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Vendor">
              <select className="field" value={vendor} onChange={(e) => setVendor(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Select…</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
            <Button loading={busy === 'buy'} disabled={!vendor} onClick={() => act('buy', 'purchase', { vendor }, 'Asset purchased')}>Create Bill</Button>
          </div>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4"><div className="text-[12px] text-label-2">Purchase value</div><div className="text-[20px] font-semibold tnum">{money(a.value)}</div></div>
        <div className="card p-4"><div className="text-[12px] text-label-2">Depreciated so far</div><div className="text-[20px] font-semibold text-red tnum">{money(a.depreciated)}</div></div>
        <div className="card p-4"><div className="text-[12px] text-label-2">Book value</div><div className="text-[20px] font-semibold text-blue tnum">{money(a.book_value)}</div></div>
        <div className="card p-4"><div className="text-[12px] text-label-2">Per month</div><div className="text-[20px] font-semibold tnum">{money(a.monthly_depreciation)}</div></div>
      </div>

      <Card title="Book value over time">
        <div className="flex h-32 items-end gap-[2px]">
          {schedule.map((r, i) => (
            <motion.div key={r.date} initial={{ height: 0 }} animate={{ height: `${(num(r.book_value) / Math.max(num(a.value), 1)) * 100}%` }} transition={{ delay: Math.min(i, 60) * 0.01 }}
              title={`${date(r.date)}: ${money(r.book_value)}`} className={cx('min-w-0 flex-1 rounded-t-sm', r.posted ? 'bg-blue' : 'bg-surface-3')} />
          ))}
        </div>
        <p className="mt-2 text-[12px] text-label-3">Blue = depreciation already posted. The value reaches zero at the end of its useful life.</p>
      </Card>

      <Card className="mt-4" title="Depreciation schedule">
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-[14px]">
            <thead className="sticky top-0 bg-surface text-left text-[12px] text-label-3">
              <tr className="border-b border-line"><th className="pb-2 font-medium">Month</th><th className="pb-2 text-right font-medium">Depreciation</th><th className="pb-2 text-right font-medium">Book value after</th><th className="pb-2 text-right font-medium">Entry</th></tr>
            </thead>
            <tbody>
              {schedule.map((r, i) => (
                <tr key={r.date} className={cx('border-b border-line/60', i === nextIdx && 'bg-blue/[0.08]')}>
                  <td className="py-2">{date(r.date)}</td>
                  <td className="py-2 text-right tnum">{money(r.amount)}</td>
                  <td className="py-2 text-right tnum">{money(r.book_value)}</td>
                  <td className="py-2 text-right">{r.move ? <Link to={`/entries/${r.move}`} className="text-blue">Posted</Link> : <span className="text-label-3">{i === nextIdx ? 'Next' : 'Planned'}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
