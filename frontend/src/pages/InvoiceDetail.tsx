import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { JournalEntry } from '../components/JournalEntry'
import { MoveState } from '../components/status'
import { useAction } from '../components/toast'
import { Button, Card, ErrorBox, PageHeader, Spinner } from '../components/ui'
import { post } from '../lib/api'
import { date, money, num, qty } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Move } from '../lib/types'

export default function InvoiceDetail() {
  const { id } = useParams()
  const { data: inv, error, loading, reload } = useFetch<Move>(`/moves/${id}/`)
  const { run, busy } = useAction()
  const [amount, setAmount] = useState('')

  if (loading && !inv) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!inv) return null

  const productLines = (inv.lines ?? []).filter((l) => l.kind === 'product')
  const paidPct = num(inv.amount_total) ? ((num(inv.amount_total) - num(inv.amount_residual)) / num(inv.amount_total)) * 100 : 0

  const act = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    if (await run(key, fn, msg)) {
      setAmount('')
      reload()
    }
  }

  return (
    <>
      <Link to="/invoices" className="mb-3 inline-flex items-center gap-1 text-[14px] text-blue">
        <ArrowLeft className="size-4" /> Invoices
      </Link>
      <PageHeader
        title={inv.state === 'draft' ? 'Draft Invoice' : inv.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{inv.partner_name} <MoveState move={inv} /></span>}
        actions={
          inv.state === 'draft' ? (
            <Button loading={busy === 'post'} onClick={() => act('post', () => post(`/moves/${inv.id}/post/`), 'Invoice posted')}>Confirm Invoice</Button>
          ) : inv.state === 'posted' && num(inv.amount_residual) > 0 ? (
            <div className="flex items-center gap-2">
              <input className="field !w-36 !py-1.5 tnum" type="number" min={0} step="0.01" placeholder={num(inv.amount_residual).toFixed(2)} value={amount} onChange={(e) => setAmount(e.target.value)} />
              <Button variant="success" loading={busy === 'pay'} onClick={() => act('pay', () => post(`/moves/${inv.id}/register-payment/`, { amount: amount || null }), 'Payment registered')}>Register Payment</Button>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        {/* The invoice as the customer sees it */}
        <Card className="bg-gradient-to-b from-surface to-surface-2/40">
          <div className="flex flex-wrap justify-between gap-4 border-b border-line pb-5">
            <div>
              <div className="flex items-center gap-2"><img src="/favicon.svg" alt="" className="size-6" /><span className="font-semibold">Nexus Furniture</span></div>
              <div className="mt-4 text-[12px] uppercase tracking-wider text-label-3">Bill to</div>
              <div className="font-medium">{inv.partner_name}</div>
            </div>
            <dl className="space-y-1 text-right text-[14px]">
              <div><dt className="inline text-label-3">Invoice </dt><dd className="inline font-medium tnum">{inv.state === 'draft' ? '—' : inv.name}</dd></div>
              <div><dt className="inline text-label-3">Date </dt><dd className="inline">{date(inv.date)}</dd></div>
              <div><dt className="inline text-label-3">Due </dt><dd className="inline">{date(inv.invoice_date_due)}</dd></div>
              {inv.sale_order && <div><dt className="inline text-label-3">Order </dt><dd className="inline"><Link className="text-blue" to={`/sales/${inv.sale_order}`}>{inv.sale_order_name}</Link></dd></div>}
            </dl>
          </div>
          <table className="mt-4 w-full text-[14px]">
            <thead className="text-left text-[12px] text-label-3">
              <tr><th className="pb-2 font-medium">Description</th><th className="pb-2 text-right font-medium">Qty</th><th className="pb-2 text-right font-medium">Price</th><th className="pb-2 text-right font-medium">Amount</th></tr>
            </thead>
            <tbody>
              {productLines.map((l) => (
                <tr key={l.id} className="border-t border-line/60">
                  <td className="py-2.5">{l.name}</td>
                  <td className="py-2.5 text-right tnum">{qty(l.quantity)}</td>
                  <td className="py-2.5 text-right tnum">{money(l.price_unit)}</td>
                  <td className="py-2.5 text-right tnum">{money(l.credit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-4 ml-auto max-w-xs space-y-1 text-[14px]">
            <div className="flex justify-between"><dt className="text-label-2">Untaxed</dt><dd className="tnum">{money(inv.amount_untaxed)}</dd></div>
            <div className="flex justify-between"><dt className="text-label-2">VAT</dt><dd className="tnum">{money(inv.amount_tax)}</dd></div>
            <div className="flex justify-between border-t border-line pt-1.5 text-[17px] font-semibold"><dt>Total</dt><dd className="tnum">{money(inv.amount_total)}</dd></div>
            {inv.state === 'posted' && <div className="flex justify-between font-semibold text-blue"><dt>Amount due</dt><dd className="tnum">{money(inv.amount_residual)}</dd></div>}
          </dl>
          {inv.state === 'posted' && (
            <div className="mt-5">
              <div className="mb-1 flex justify-between text-[12px] text-label-3"><span>Paid</span><span>{paidPct.toFixed(0)}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                <motion.div className="h-full rounded-full bg-green" initial={{ width: 0 }} animate={{ width: `${paidPct}%` }} transition={{ duration: 0.7 }} />
              </div>
            </div>
          )}
        </Card>

        {/* What the accountant sees */}
        <div className="space-y-4">
          <div>
            <h2 className="mb-2 text-[17px] font-semibold">Behind the scenes: the journal entry</h2>
            <JournalEntry move={inv} explain={inv.state === 'draft' ? 'Draft: these lines are prepared but not in the books yet. Confirming posts them.' : 'Receivable is debited (customer owes us); Sales and VAT Payable are credited.'} />
          </div>
          {!!inv.payments?.length && (
            <Card title="Payments">
              <ul className="space-y-2">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5 text-[14px]">
                    <Link to={p.move ? `/entries/${p.move}` : '#'} className="font-medium text-blue tnum">{p.name}</Link>
                    <span className="text-label-2">{date(p.date)} · {p.journal_name}</span>
                    <span className="font-semibold text-green tnum">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
