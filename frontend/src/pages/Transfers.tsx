import { ArrowRight, ArrowLeftRight } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { PickingState } from '../components/status'
import { useAction } from '../components/toast'
import { Button, Empty, ErrorBox, Lesson, PageHeader, Pill, Segmented, Sheet, Spinner, type Tone } from '../components/ui'
import { post } from '../lib/api'
import { date, money, num, qty } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Picking } from '../lib/types'

type K = '' | 'outgoing' | 'incoming' | 'adjustment' | 'return'
const kindTone: Record<Picking['kind'], Tone> = { outgoing: 'orange', incoming: 'green', adjustment: 'purple', return: 'yellow' }

export default function Transfers() {
  const [params, setParams] = useSearchParams()
  const kind = (params.get('kind') ?? '') as K
  const openId = Number(params.get('open')) || null
  const { data, error, loading, reload } = useFetch<Picking[]>(`/pickings/?kind=${kind}`)
  const { run, busy } = useAction()
  const open = data?.find((p) => p.id === openId) ?? null

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next)
  }

  const validate = async (p: Picking) => {
    if (await run('validate', () => post(`/pickings/${p.id}/validate/`), `${p.name} validated`)) reload()
  }

  return (
    <>
      <PageHeader title="Transfers" subtitle="Every movement of goods between locations." />

      <Lesson step="Step 5 · Inventory" title="Stock moves between locations">
        <p>The ERP never just edits a quantity. Goods always <b>move from one location to another</b>: Vendors → WH/Stock (receipt), WH/Stock → Customers (delivery), Inventory adjustment → WH/Stock (opening stock or a count correction).</p>
        <p>On-hand quantity is simply everything that moved <b>in</b> minus everything that moved <b>out</b>, which gives a full audit trail.</p>
      </Lesson>

      <div className="mb-4">
        <Segmented<K> value={kind} onChange={(v) => setParam('kind', v || null)} options={[{ value: '', label: 'All' }, { value: 'outgoing', label: 'Deliveries' }, { value: 'incoming', label: 'Receipts' }, { value: 'return', label: 'Returns' }, { value: 'adjustment', label: 'Adjustments' }]} />
      </div>

      {error && <ErrorBox message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty icon={<ArrowLeftRight className="size-6" />} title="No transfers" />
      ) : (
        <div className="card divide-y divide-line/60">
          {data.map((p) => (
            <button key={p.id} onClick={() => setParam('open', String(p.id))} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]">
              <span className="w-32 font-medium tnum">{p.name}</span>
              <Pill tone={kindTone[p.kind]}>{p.kind_display}</Pill>
              <span className="min-w-0 flex-1 truncate text-[14px] text-label-2">{p.partner_name ?? p.origin}</span>
              <span className="hidden items-center gap-1.5 text-[12px] text-label-3 md:flex">{p.source_location_name}<ArrowRight className="size-3" />{p.dest_location_name}</span>
              <span className="w-24 text-right text-[13px] text-label-2">{date(p.date_done ?? p.scheduled_date)}</span>
              <PickingState picking={p} />
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={!!open}
        onClose={() => setParam('open', null)}
        title={open?.name ?? ''}
        footer={open?.state === 'ready' ? <Button variant="success" loading={busy === 'validate'} onClick={() => validate(open)}>Validate</Button> : undefined}
      >
        {open && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={kindTone[open.kind]}>{open.kind_display}</Pill>
              <PickingState picking={open} />
              {open.sale_order && <Link to={`/sales/${open.sale_order}`} className="text-[14px] text-blue">From {open.origin}</Link>}
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-4">
              <div className="flex-1 text-center">
                <div className="text-[12px] text-label-3">From</div>
                <div className="font-medium">{open.source_location_name}</div>
              </div>
              <ArrowRight className="size-5 text-blue" />
              <div className="flex-1 text-center">
                <div className="text-[12px] text-label-3">To</div>
                <div className="font-medium">{open.dest_location_name}</div>
              </div>
            </div>
            <table className="w-full text-[14px]">
              <thead className="text-left text-[12px] text-label-3">
                <tr className="border-b border-line"><th className="pb-2 font-medium">Product</th><th className="pb-2 text-right font-medium">Quantity</th><th className="pb-2 text-right font-medium">Value at cost</th></tr>
              </thead>
              <tbody>
                {open.moves.map((m) => (
                  <tr key={m.id} className="border-b border-line/60 last:border-0">
                    <td className="py-2.5"><div className="font-medium">{m.product_name}</div><div className="text-[12px] text-label-3 tnum">{m.product_sku}</div></td>
                    <td className="py-2.5 text-right tnum">{qty(m.quantity)} {m.uom_name}</td>
                    <td className="py-2.5 text-right tnum text-label-2">{num(m.unit_cost) ? money(num(m.unit_cost) * num(m.quantity)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {open.valuation_entry ? (
              <p className="text-[14px] text-label-2">Valuation entry: <Link to={`/entries/${open.valuation_entry.id}`} className="text-blue tnum">{open.valuation_entry.name}</Link></p>
            ) : open.state === 'ready' ? (
              <p className="rounded-xl bg-blue/10 p-3 text-[14px] text-label-2">Validating confirms the goods physically moved. The ERP then updates on-hand quantities and posts a stock valuation journal entry.</p>
            ) : null}
          </div>
        )}
      </Sheet>
    </>
  )
}
