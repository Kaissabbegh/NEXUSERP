import { ArrowLeft, Banknote, FileCheck2, FileText, PackageCheck, Pencil, ShoppingCart, Truck, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FlowDiagram, NextStep, stepStates, type Step } from '../components/FlowDiagram'
import { JournalEntry } from '../components/JournalEntry'
import { PickingState, PurchaseState } from '../components/status'
import { useAction } from '../components/toast'
import { Button, Card, ErrorBox, Lesson, PageHeader, Pill, Spinner } from '../components/ui'
import { del, post } from '../lib/api'
import { cx, date, money, num, qty } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Move, PurchaseFlow } from '../lib/types'

function buildSteps(f: PurchaseFlow): Step[] {
  const o = f.order
  const confirmed = o.state === 'purchase'
  const hasGoods = o.lines.some((l) => l.product_type !== 'service')
  const received = f.pickings.length > 0 && f.pickings.every((p) => p.state === 'done')
  const posted = f.bills.filter((b) => b.state === 'posted')
  const billed = o.bill_status === 'billed' && posted.length > 0 && f.bills.every((b) => b.state !== 'draft')
  const paid = billed && posted.every((b) => b.payment_state === 'paid')
  const state = stepStates([true, confirmed, !hasGoods || received, billed, paid], o.state === 'cancel')

  return [
    { key: 'rfq', label: 'RFQ', icon: FileText, state: state(0), docs: [{ label: o.name }], caption: `Sent ${date(o.date_order)}` },
    { key: 'po', label: 'Purchase Order', icon: ShoppingCart, state: state(1), docs: confirmed ? [{ label: o.name }] : [], caption: confirmed ? 'Vendor confirmed' : 'Waiting for vendor price' },
    {
      key: 'receipt', label: 'Receipt', icon: Truck, state: hasGoods ? state(2) : 'skipped',
      docs: f.pickings.map((p) => ({ label: p.name, to: `/transfers?open=${p.id}` })),
      caption: received ? 'Goods in the warehouse' : f.pickings.length ? `Expected ${date(o.date_planned)}` : 'Created on confirmation',
    },
    {
      key: 'bill', label: 'Vendor Bill', icon: FileCheck2, state: state(3),
      docs: f.bills.map((b) => ({ label: b.state === 'draft' ? 'Draft bill' : b.name, to: `/bills/${b.id}` })),
      caption: billed ? 'We owe the vendor' : f.bills.some((b) => b.state === 'draft') ? 'Draft: confirm to post' : 'No bill yet',
    },
    {
      key: 'payment', label: 'Payment', icon: Banknote, state: state(4),
      docs: f.payments.map((p) => ({ label: p.name, to: p.move ? `/entries/${p.move}` : undefined })),
      caption: paid ? 'Vendor paid' : f.payments.length ? 'Partially paid' : 'Not paid yet',
    },
  ]
}

function explain(m: Move): string {
  if (m.journal_code === 'STJ')
    return 'Receipt validated → goods enter the warehouse. Inventory (asset) goes up; the other side waits in "Stock Interim" until the vendor bill arrives.'
  if (m.move_type === 'in_invoice')
    return 'Bill posted → we now OWE the vendor (Accounts Payable, a liability). The interim account is cleared and the VAT we paid becomes reclaimable.'
  if (m.journal_code === 'BNK') return 'Payment sent → money leaves the bank and our debt to the vendor disappears (Payable goes down).'
  return ''
}

export default function PurchaseOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useFetch<PurchaseFlow>(`/purchase-orders/${id}/flow/`)
  const { run, busy } = useAction()
  const [payAmount, setPayAmount] = useState('')

  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!data) return null

  const o = data.order
  const steps = buildSteps(data)
  const current = steps.find((s) => s.state === 'current')
  const readyReceipt = data.pickings.find((p) => p.state === 'ready')
  const draftBill = data.bills.find((b) => b.state === 'draft')
  const openBill = data.bills.find((b) => b.state === 'posted' && num(b.amount_residual) > 0)

  const act = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    if (await run(key, fn, msg)) reload()
  }

  const nextAction = (() => {
    if (o.state === 'draft')
      return { label: 'Confirm Order', hint: 'The vendor accepted our request. This creates a receipt for the warehouse.', run: () => act('next', () => post(`/purchase-orders/${o.id}/confirm/`), `${o.name} confirmed`) }
    if (o.state !== 'purchase') return null
    if (readyReceipt)
      return { label: `Receive ${readyReceipt.name}`, hint: 'The truck arrived. Validating adds the goods to stock and updates their average cost.', run: () => act('next', () => post(`/pickings/${readyReceipt.id}/validate/`), 'Goods received') }
    if (draftBill)
      return { label: 'Confirm Bill', hint: 'Posts the vendor bill: we now owe them (Accounts Payable).', run: () => act('next', () => post(`/moves/${draftBill.id}/post/`), 'Bill posted') }
    if (o.bill_status === 'to_bill')
      return { label: 'Create Bill', hint: "Record the vendor's invoice for the quantities we actually received.", run: () => act('next', () => post(`/purchase-orders/${o.id}/create-bill/`), 'Draft bill created') }
    if (openBill)
      return {
        label: 'Pay Vendor',
        hint: `Send money for ${openBill.name}. Leave the amount empty to pay the full ${money(openBill.amount_residual)}.`,
        run: () => act('next', () => post(`/moves/${openBill.id}/register-payment/`, { amount: payAmount || null }), 'Payment sent').then(() => setPayAmount('')),
        pay: true,
      }
    return null
  })()

  const stockMoves = data.pickings.flatMap((p) => p.moves.map((m) => ({ ...m, picking: p })))

  return (
    <>
      <Link to="/purchases" className="mb-3 inline-flex items-center gap-1 text-[14px] text-blue">
        <ArrowLeft className="size-4" /> Purchase Orders
      </Link>
      <PageHeader
        title={o.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{o.partner_name} · {date(o.date_order)} <PurchaseState order={o} /></span>}
        actions={
          o.state === 'draft' ? (
            <>
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => navigate(`/purchases/${o.id}/edit`)}>Edit</Button>
              <Button variant="danger" icon={<X className="size-4" />} loading={busy === 'del'} onClick={() => run('del', () => del(`/purchase-orders/${o.id}/`), 'RFQ deleted').then((r) => r !== undefined && navigate('/purchases'))}>Delete</Button>
            </>
          ) : o.state === 'purchase' && data.pickings.every((p) => p.state !== 'done') && data.bills.every((b) => b.state !== 'posted') ? (
            <Button variant="danger" loading={busy === 'cancel'} onClick={() => act('cancel', () => post(`/purchase-orders/${o.id}/cancel/`), 'Order cancelled')}>Cancel Order</Button>
          ) : null
        }
      />

      <Card className="mb-4">
        <FlowDiagram steps={steps} />
        {nextAction && (
          <NextStep stepLabel={current?.label} hint={nextAction.hint}>
            {'pay' in nextAction && (
              <input className="field !w-36 tnum" type="number" min={0} step="0.01" placeholder={num(openBill?.amount_residual).toFixed(2)} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            )}
            <Button onClick={nextAction.run} loading={busy === 'next'}>{nextAction.label}</Button>
          </NextStep>
        )}
        {o.state === 'cancel' && <p className="mt-6 text-center text-[14px] text-label-2">This order was cancelled. Its receipt and draft bills were cancelled too.</p>}
      </Card>

      <Lesson step="Step 4 · Procure-to-Pay" title="Three-way match: order = receipt = bill">
        <p>Good companies only pay for what they <b>ordered</b> and actually <b>received</b>. That's why the bill is created from the <b>received</b> quantities, not the ordered ones.</p>
        <p>Watch the <b>Accounting impact</b>: the receipt puts goods into Inventory, the bill creates a debt (Payable), and the payment removes the debt and the cash.</p>
      </Lesson>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <Card title="Order lines">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[14px]">
                <thead className="text-left text-[12px] text-label-3">
                  <tr className="border-b border-line">
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 text-right font-medium">Ordered</th>
                    <th className="pb-2 text-right font-medium">Received</th>
                    <th className="pb-2 text-right font-medium">Billed</th>
                    <th className="pb-2 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {o.lines.map((l) => (
                    <tr key={l.id} className="border-b border-line/60 last:border-0">
                      <td className="py-2.5">
                        <div className="font-medium">{l.product_name}</div>
                        <div className="text-[12px] text-label-3">{money(l.price_unit)} × {qty(l.quantity)} {l.uom_name}{l.tax_name ? ` · ${l.tax_name}` : ''}</div>
                      </td>
                      <td className="py-2.5 text-right tnum">{qty(l.quantity)}</td>
                      <td className={cx('py-2.5 text-right tnum', num(l.qty_received) >= num(l.quantity) ? 'text-green' : 'text-label-2')}>{qty(l.qty_received)}</td>
                      <td className={cx('py-2.5 text-right tnum', num(l.qty_billed) >= num(l.quantity) ? 'text-green' : 'text-label-2')}>{qty(l.qty_billed)}</td>
                      <td className="py-2.5 text-right tnum">{money(l.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-4 ml-auto max-w-xs space-y-1 text-[14px]">
              <div className="flex justify-between"><dt className="text-label-2">Untaxed</dt><dd className="tnum">{money(o.amount_untaxed)}</dd></div>
              <div className="flex justify-between"><dt className="text-label-2">VAT</dt><dd className="tnum">{money(o.amount_tax)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1.5 text-[17px] font-semibold"><dt>Total</dt><dd className="tnum">{money(o.amount_total)}</dd></div>
            </dl>
          </Card>

          <Card title="Stock impact">
            {stockMoves.length === 0 ? (
              <p className="text-[14px] text-label-2">{o.state === 'draft' ? 'An RFQ never touches stock. Confirm it to create a receipt.' : 'No physical goods on this order.'}</p>
            ) : (
              <ul className="space-y-2">
                {stockMoves.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
                    <PackageCheck className={cx('size-4 shrink-0', m.state === 'done' ? 'text-green' : 'text-label-3')} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">{m.product_name}</div>
                      <div className="text-[12px] text-label-3">{m.picking.source_location_name} → {m.picking.dest_location_name}</div>
                    </div>
                    <span className={cx('font-semibold tnum', m.state === 'done' ? 'text-green' : 'text-label-3')}>+{qty(m.quantity)}</span>
                    <PickingState picking={m.picking} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Accounting impact" action={<Pill tone="blue">{data.entries.length} entries</Pill>}>
          {data.entries.length === 0 ? (
            <p className="text-[14px] text-label-2">
              {o.state === 'draft' ? 'Nothing yet. An RFQ is just a question to the vendor.' : 'Nothing yet. The first entry appears when goods are received.'}
            </p>
          ) : (
            <div className="space-y-3">
              {data.entries.map((m) => <JournalEntry key={m.id} move={m} explain={explain(m)} compact />)}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
