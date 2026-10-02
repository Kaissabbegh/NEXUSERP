import { ArrowLeft, CheckCircle2, Factory, FileText, XCircle } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { FlowDiagram, NextStep, stepStates, type Step } from '../components/FlowDiagram'
import { JournalEntry } from '../components/JournalEntry'
import { MoState } from '../components/status'
import { useAction } from '../components/toast'
import { Button, Card, ErrorBox, PageHeader, Spinner } from '../components/ui'
import { post } from '../lib/api'
import { cx, date, money, num, qty } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { ManufacturingOrder } from '../lib/types'

export default function ManufacturingDetail() {
  const { id } = useParams()
  const { data: mo, error, loading, reload } = useFetch<ManufacturingOrder>(`/manufacturing-orders/${id}/`)
  const { run, busy } = useAction()

  if (loading && !mo) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!mo) return null

  const comps = mo.components ?? []
  const allOk = comps.every((c) => c.ok)
  const total = comps.reduce((s, c) => s + num(c.value), 0)
  const state = stepStates([true, mo.state !== 'draft', mo.state === 'done'], mo.state === 'cancel')
  const steps: Step[] = [
    { key: 'draft', label: 'Planned', icon: FileText, state: state(0), docs: [{ label: mo.name }], caption: date(mo.date_planned) },
    { key: 'confirmed', label: 'Confirmed', icon: CheckCircle2, state: state(1), docs: [], caption: mo.state === 'draft' ? 'Not started' : 'Ready for the workshop' },
    { key: 'done', label: 'Produced', icon: Factory, state: state(2), docs: (mo.entries ?? []).map((e) => ({ label: e.name, to: `/entries/${e.id}` })), caption: mo.date_done ? date(mo.date_done) : 'Waiting' },
  ]
  const act = async (key: string, path: string, msg: string) => {
    if (await run(key, () => post(`/manufacturing-orders/${mo.id}/${path}/`), msg)) reload()
  }

  return (
    <>
      <Link to="/manufacturing" className="mb-3 inline-flex items-center gap-1 text-[14px] text-blue"><ArrowLeft className="size-4" /> Manufacturing Orders</Link>
      <PageHeader
        title={mo.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{qty(mo.quantity)} × {mo.product_name}{mo.origin ? ` · ${mo.origin}` : ''} <MoState mo={mo} /></span>}
        actions={mo.state !== 'done' && mo.state !== 'cancel' ? <Button variant="danger" loading={busy === 'cancel'} onClick={() => act('cancel', 'cancel', 'Order cancelled')}>Cancel</Button> : null}
      />

      <Card className="mb-4">
        <FlowDiagram steps={steps} />
        {mo.state === 'draft' && (
          <NextStep stepLabel="Confirmed" hint="Confirm to schedule the work. Nothing moves in stock yet.">
            <Button loading={busy === 'next'} onClick={() => act('next', 'confirm', 'Manufacturing order confirmed')}>Confirm</Button>
          </NextStep>
        )}
        {mo.state === 'confirmed' && (
          <NextStep stepLabel="Produced" hint={allOk ? 'The workshop built the products. Components leave stock and finished goods enter it.' : 'Some components are missing. Buy them first (Replenishment), then produce.'}>
            <Button loading={busy === 'next'} disabled={!allOk} onClick={() => act('next', 'produce', `${qty(mo.quantity)} ${mo.product_name} produced`)}>Produce</Button>
          </NextStep>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card title="Components">
          <table className="w-full text-[14px]">
            <thead className="text-left text-[12px] text-label-3">
              <tr className="border-b border-line"><th className="pb-2 font-medium">Component</th><th className="pb-2 text-right font-medium">Needed</th><th className="pb-2 text-right font-medium">{mo.state === 'done' ? 'Unit cost' : 'Available'}</th><th className="pb-2 text-right font-medium">Value</th></tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.product} className="border-b border-line/60 last:border-0">
                  <td className="py-2.5"><div className="font-medium">{c.name}</div><div className="text-[12px] text-label-3 tnum">{c.sku}</div></td>
                  <td className="py-2.5 text-right tnum">{qty(c.quantity)} {c.uom}</td>
                  <td className={cx('py-2.5 text-right tnum', mo.state !== 'done' && (c.ok ? 'text-green' : 'text-red'))}>
                    {mo.state === 'done' ? money(c.cost) : <span className="inline-flex items-center gap-1">{c.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}{qty(c.available)}</span>}
                  </td>
                  <td className="py-2.5 text-right tnum">{money(c.value)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold"><td className="pt-3" colSpan={3}>Cost of {qty(mo.quantity)} {mo.product_name}</td><td className="pt-3 text-right tnum">{money(mo.state === 'done' ? num(mo.unit_cost) * num(mo.quantity) : total)}</td></tr>
            </tfoot>
          </table>
          {mo.state === 'done' && <p className="mt-3 text-[13px] text-label-2">Each unit cost <b className="text-label tnum">{money(mo.unit_cost)}</b> to make. The product's average cost was updated with it.</p>}
        </Card>

        <Card title="Accounting impact">
          {(mo.entries ?? []).length === 0 ? (
            <p className="text-[14px] text-label-2">Nothing yet. When you produce, the components' value moves to the finished product, inside the same Inventory account.</p>
          ) : (
            (mo.entries ?? []).map((e) => <JournalEntry key={e.id} move={e} compact explain="Components (credit) leave inventory; the finished product (debit) enters it at the same total value. Total stock value doesn't change." />)
          )}
        </Card>
      </div>
    </>
  )
}
