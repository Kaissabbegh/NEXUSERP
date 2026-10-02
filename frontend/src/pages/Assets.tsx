import { ChevronRight, Plus, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAction } from '../components/toast'
import { Button, Empty, ErrorBox, Field, Lesson, PageHeader, Pill, Sheet, Spinner, type Tone } from '../components/ui'
import { post } from '../lib/api'
import { date, money, num } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Account, FixedAsset } from '../lib/types'

export const assetTone: Record<FixedAsset['state'], Tone> = { draft: 'gray', running: 'blue', closed: 'green' }

export default function Assets() {
  const { data, error, loading } = useFetch<FixedAsset[]>('/fixed-assets/')
  const accounts = (useFetch<Account[]>('/accounts/').data ?? []).filter((a) => a.account_type === 'asset_fixed' && a.code !== '152000')
  const [creating, setCreating] = useState<Partial<FixedAsset> | null>(null)
  const { run, busy } = useAction()
  const navigate = useNavigate()

  const create = async () => {
    const a = await run('create', () => post<FixedAsset>('/fixed-assets/', creating), 'Asset created')
    if (a) navigate(`/assets/${a.id}`)
  }

  return (
    <>
      <PageHeader title="Fixed Assets" subtitle="Things the company owns and uses for years: vehicles, machines, computers."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setCreating({ name: '', account: accounts[0]?.id, value: '', useful_life_months: 60, acquisition_date: new Date().toISOString().slice(0, 10) })}>New Asset</Button>} />

      <Lesson step="Chapter 7 · Fixed assets" title="Not an expense, a little expense every month">
        <p>A van used for 5 years is an <b>asset</b>, not this month's expense. Its cost is spread over its useful life with <b>depreciation</b>: each month a small expense is booked and the asset's <b>book value</b> goes down.</p>
      </Lesson>

      {error && <ErrorBox message={error} />}
      {loading && !data ? <Spinner /> : !data?.length ? <Empty icon={<Truck className="size-6" />} title="No fixed assets" /> : (
        <div className="card divide-y divide-line/60">
          {data.map((a) => (
            <Link key={a.id} to={`/assets/${a.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03]">
              <div className="min-w-[200px] flex-1"><div className="font-medium">{a.name}</div><div className="text-[13px] text-label-2">{a.account_name} · bought {date(a.acquisition_date)} · {a.useful_life_months} months</div></div>
              <div className="text-right"><div className="text-[12px] text-label-3">Book value</div><div className="font-semibold tnum">{money(a.book_value)} <span className="text-[12px] font-normal text-label-3">/ {money(a.value)}</span></div></div>
              <div className="hidden h-2 w-28 overflow-hidden rounded-full bg-surface-3 md:block"><div className="h-full bg-blue" style={{ width: `${(num(a.book_value) / Math.max(num(a.value), 1)) * 100}%` }} /></div>
              <Pill tone={assetTone[a.state]} dot>{a.state_display}</Pill>
              <ChevronRight className="size-4 text-label-3" />
            </Link>
          ))}
        </div>
      )}

      <Sheet open={!!creating} onClose={() => setCreating(null)} title="New Fixed Asset"
        footer={<><Button variant="secondary" onClick={() => setCreating(null)}>Cancel</Button><Button loading={busy === 'create'} disabled={!creating?.name || !creating.value} onClick={create}>Create</Button></>}>
        {creating && (
          <div className="space-y-4">
            <Field label="Name"><input className="field" value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} autoFocus /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Asset account">
                <select className="field" value={creating.account} onChange={(e) => setCreating({ ...creating, account: Number(e.target.value) })}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                </select>
              </Field>
              <Field label="Purchase value (excl. VAT)"><input className="field tnum" type="number" min={0} value={creating.value} onChange={(e) => setCreating({ ...creating, value: e.target.value })} /></Field>
              <Field label="Useful life (months)"><input className="field tnum" type="number" min={1} value={creating.useful_life_months} onChange={(e) => setCreating({ ...creating, useful_life_months: Number(e.target.value) })} /></Field>
              <Field label="Acquisition date"><input className="field" type="date" value={creating.acquisition_date} onChange={(e) => setCreating({ ...creating, acquisition_date: e.target.value })} /></Field>
            </div>
            {num(creating.value) > 0 && <p className="rounded-xl bg-surface-2 px-4 py-3 text-[14px]">Monthly depreciation: <b className="tnum">{money(num(creating.value) / Math.max(creating.useful_life_months ?? 1, 1))}</b></p>}
          </div>
        )}
      </Sheet>
    </>
  )
}
