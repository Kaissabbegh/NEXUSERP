import { ArrowLeft, Banknote, FileCheck2, FileText, Pencil, ShoppingBag, Truck, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AfterSales } from '../components/AfterSales'
import { FlowDiagram, NextStep, stepStates, type Step } from '../components/FlowDiagram'
import { JournalEntry } from '../components/JournalEntry'
import { OrderState, PickingState } from '../components/status'
import { useAction } from '../components/toast'
import { Button, Card, ErrorBox, Lesson, PageHeader, Pill, Spinner } from '../components/ui'
import { del, post } from '../lib/api'
import { cx, date, money, num, qty } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Move, SaleFlow } from '../lib/types'

function buildSteps(f: SaleFlow): Step[] {
  const o = f.order
  const confirmed = o.state === 'sale'
  const hasGoods = o.lines.some((l) => l.product_type !== 'service')
  const delivered = f.pickings.length > 0 && f.pickings.every((p) => p.state === 'done')
  const posted = f.invoices.filter((i) => i.state === 'posted')
  const invoiced = o.invoice_status === 'invoiced' && posted.length > 0 && f.invoices.every((i) => i.state !== 'draft')
  const paid = invoiced && posted.every((i) => i.payment_state === 'paid')

  const state = stepStates([true, confirmed, !hasGoods || delivered, invoiced, paid], o.state === 'cancel')

  return [
    { key: 'quotation', label: 'Quotation', icon: FileText, state: state(0), docs: [{ label: o.name }], caption: `Created ${date(o.date_order)}` },
    { key: 'order', label: 'Sales Order', icon: ShoppingBag, state: state(1), docs: confirmed ? [{ label: o.name }] : [], caption: confirmed ? 'Confirmed' : 'Waiting for customer approval' },
    {
      key: 'delivery', label: 'Delivery', icon: Truck, state: hasGoods ? state(2) : 'skipped',
      docs: f.pickings.map((p) => ({ label: p.name, to: `/transfers?open=${p.id}` })),
      caption: !hasGoods ? 'Services only: nothing to ship' : delivered ? 'Goods left the warehouse' : f.pickings.length ? 'Ready to ship' : 'Created on confirmation',
    },
    {
      key: 'invoice', label: 'Invoice', icon: FileCheck2, state: state(3),
      docs: f.invoices.map((i) => ({ label: i.state === 'draft' ? 'Draft invoice' : i.name, to: `/invoices/${i.id}` })),
      caption: invoiced ? 'Customer billed' : f.invoices.some((i) => i.state === 'draft') ? 'Draft: confirm to post' : 'Not billed yet',
    },
    {
      key: 'payment', label: 'Payment', icon: Banknote, state: state(4),
      docs: f.payments.map((p) => ({ label: p.name, to: p.move ? `/entries/${p.move}` : undefined })),
      caption: paid ? 'Cash collected' : f.payments.length ? 'Partially paid' : 'Awaiting payment',
    },
  ]
}


function explain(m: Move): string {
  if (m.journal_name === 'Inventory Valuation')
    return 'Delivery validated → goods leave the warehouse. Their cost moves from Inventory (an asset) to Cost of Goods Sold (an expense).'
  if (m.move_type === 'out_invoice')
    return 'Invoice posted → we earned revenue. The customer now owes us the total (Receivable); VAT collected is owed to the state.'
  if (m.move_type === 'out_refund')
    return 'Credit note → the opposite of an invoice: sales and VAT owed go down, and the customer owes us less (or we owe them a refund).'
  if (m.journal_name === 'Bank') return 'Payment → money moves between the bank and the customer, and what they owe (or we owe them) is cleared.'
  return ''
}

export default function SaleOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useFetch<SaleFlow>(`/sale-orders/${id}/flow/`)
  const { run, busy } = useAction()
  const [payAmount, setPayAmount] = useState('')

  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!data) return null

  const o = data.order
  // The flow diagram follows the sale itself; returns and credit notes are shown under After-sales.
  const deliveries = data.pickings.filter((p) => p.kind === 'outgoing')
  const returns = data.pickings.filter((p) => p.kind === 'return')
  const invoices = data.invoices.filter((i) => i.move_type === 'out_invoice')
  const credits = data.invoices.filter((i) => i.move_type === 'out_refund')
  const steps = buildSteps({ ...data, pickings: deliveries, invoices })
  const current = steps.find((s) => s.state === 'current')
  const readyPicking = deliveries.find((p) => p.state === 'ready')
  const draftInvoice = invoices.find((i) => i.state === 'draft')
  const openInvoice = invoices.find((i) => i.state === 'posted' && num(i.amount_residual) > 0)

  const act = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    if (await run(key, fn, msg)) reload()
  }

  const nextAction = (() => {
    if (o.state === 'draft')
      return { label: 'Confirm Order', hint: 'Turns the quotation into a sales order and creates the delivery.', run: () => act('next', () => post(`/sale-orders/${o.id}/confirm/`), `${o.name} confirmed`) }
    if (o.state !== 'sale') return null
    if (readyPicking)
      return { label: `Validate Delivery ${readyPicking.name}`, hint: 'The warehouse ships the goods. Stock goes down and a cost entry is posted.', run: () => act('next', () => post(`/pickings/${readyPicking.id}/validate/`), `${readyPicking.name} delivered`) }
    if (draftInvoice)
      return { label: 'Confirm Invoice', hint: 'Posts the invoice: revenue, VAT and receivable hit the books.', run: () => act('next', () => post(`/moves/${draftInvoice.id}/post/`), 'Invoice posted') }
    if (o.invoice_status === 'to_invoice')
      return { label: 'Create Invoice', hint: 'Prepares a draft invoice from the order lines.', run: () => act('next', () => post(`/sale-orders/${o.id}/create-invoice/`), 'Draft invoice created') }
    if (openInvoice)
      return {
        label: `Register Payment`,
        hint: `Records money received for ${openInvoice.name}. Leave the amount empty to pay the full ${money(openInvoice.amount_residual)}.`,
        run: () => act('next', () => post(`/moves/${openInvoice.id}/register-payment/`, { amount: payAmount || null }), 'Payment registered').then(() => setPayAmount('')),
        pay: true,
      }
    return null
  })()

  const stockMoves = data.pickings.flatMap((p) => p.moves.map((m) => ({ ...m, picking: p })))
  const canReturn = o.state === 'sale' && o.lines.some((l) => num(l.qty_delivered) > 0)
  const canCredit = invoices.some((i) => i.state === 'posted')

  return (
    <>
      <Link to="/sales" className="mb-3 inline-flex items-center gap-1 text-[14px] text-blue">
        <ArrowLeft className="size-4" /> Sales Orders
      </Link>
      <PageHeader
        title={o.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{o.partner_name} · {date(o.date_order)} <OrderState order={o} /></span>}
        actions={
          o.state === 'draft' ? (
            <>
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => navigate(`/sales/${o.id}/edit`)}>Edit</Button>
              <Button variant="danger" icon={<X className="size-4" />} loading={busy === 'del'} onClick={() => run('del', () => del(`/sale-orders/${o.id}/`), 'Quotation deleted').then((r) => r !== undefined && navigate('/sales'))}>Delete</Button>
            </>
          ) : o.state === 'sale' && data.pickings.every((p) => p.state !== 'done') && data.invoices.every((i) => i.state !== 'posted') ? (
            <Button variant="danger" loading={busy === 'cancel'} onClick={() => act('cancel', () => post(`/sale-orders/${o.id}/cancel/`), 'Order cancelled')}>Cancel Order</Button>
          ) : null
        }
      />

      <Card className="mb-4">
        <FlowDiagram steps={steps} />
        {nextAction && (
          <NextStep stepLabel={current?.label} hint={nextAction.hint}>
            {'pay' in nextAction && (
              <input className="field !w-36 tnum" type="number" min={0} step="0.01" placeholder={num(openInvoice?.amount_residual).toFixed(2)} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            )}
            <Button onClick={nextAction.run} loading={busy === 'next'}>{nextAction.label}</Button>
          </NextStep>
        )}
        {o.state === 'cancel' && <p className="mt-6 text-center text-[14px] text-label-2">This order was cancelled. Its delivery and draft invoices were cancelled too.</p>}
      </Card>

      <Lesson step="Step 3 · Order-to-Cash" title="Follow the money and the goods">
        <p>Each button above is one real-world event. Watch the <b>Stock impact</b> and <b>Accounting impact</b> panels below fill in as you go. Nobody types an accounting entry: the ERP derives them from master data.</p>
      </Lesson>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <Card title="Order lines">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[14px]">
                <thead className="text-left text-[12px] text-label-3">
                  <tr className="border-b border-line">
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 text-right font-medium">Qty</th>
                    <th className="pb-2 text-right font-medium">Delivered</th>
                    <th className="pb-2 text-right font-medium">Invoiced</th>
                    <th className="pb-2 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {o.lines.map((l) => (
                    <tr key={l.id} className="border-b border-line/60 last:border-0">
                      <td className="py-2.5">
                        <div className="font-medium">{l.product_name}</div>
                        <div className="text-[12px] text-label-3">{money(l.price_unit)} × {qty(l.quantity)} {l.uom_name}{num(l.discount) ? ` · −${num(l.discount)}%` : ''}{l.tax_name ? ` · ${l.tax_name}` : ''}</div>
                      </td>
                      <td className="py-2.5 text-right tnum">{qty(l.quantity)}</td>
                      <td className={cx('py-2.5 text-right tnum', num(l.qty_delivered) >= num(l.quantity) ? 'text-green' : 'text-label-2')}>{l.product_type === 'service' ? '—' : qty(l.qty_delivered)}</td>
                      <td className={cx('py-2.5 text-right tnum', num(l.qty_invoiced) >= num(l.quantity) ? 'text-green' : 'text-label-2')}>{qty(l.qty_invoiced)}</td>
                      <td className="py-2.5 text-right tnum">{money(l.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-4 ml-auto max-w-xs space-y-1 text-[14px]">
              <div className="flex justify-between"><dt className="text-label-2">Untaxed</dt><dd className="tnum">{money(o.amount_untaxed)}</dd></div>
              <div className="flex justify-between"><dt className="text-label-2">Taxes</dt><dd className="tnum">{money(o.amount_tax)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1.5 text-[17px] font-semibold"><dt>Total</dt><dd className="tnum">{money(o.amount_total)}</dd></div>
            </dl>
          </Card>

          <Card title="Stock impact">
            {stockMoves.length === 0 ? (
              <p className="text-[14px] text-label-2">{o.state === 'draft' ? 'A quotation never touches stock. Confirm it to create a delivery order.' : 'No physical goods on this order.'}</p>
            ) : (
              <ul className="space-y-2">
                {stockMoves.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
                    <Truck className={cx('size-4 shrink-0', m.state === 'done' ? 'text-green' : 'text-label-3')} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">{m.product_name}</div>
                      <div className="text-[12px] text-label-3">{m.picking.source_location_name} → {m.picking.dest_location_name}</div>
                    </div>
                    <span className={cx('font-semibold tnum', m.state !== 'done' ? 'text-label-3' : m.picking.kind === 'return' ? 'text-green' : 'text-red')}>{m.picking.kind === 'return' ? '+' : '−'}{qty(m.quantity)}</span>
                    <PickingState picking={m.picking} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <AfterSales order={o} returns={returns} credits={credits} canReturn={canReturn} canCredit={canCredit} onChange={reload} />
        </div>

        <Card title="Accounting impact" action={<Pill tone="blue">{data.entries.length} entries</Pill>}>
          {data.entries.length === 0 ? (
            <p className="text-[14px] text-label-2">
              {o.state === 'draft' ? 'Nothing yet. Quotations and confirmed orders are commitments, not accounting events.' : 'Nothing yet. The first entry appears when goods are delivered (cost) or the invoice is posted (revenue).'}
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
