import { ChevronRight, ReceiptText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MoveState } from '../components/status'
import { Empty, ErrorBox, Lesson, PageHeader, Spinner } from '../components/ui'
import { cx, date, money, num } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Move } from '../lib/types'

export default function Invoices() {
  const { data, error, loading } = useFetch<Move[]>('/moves/?type=out_invoice')
  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      <PageHeader title="Customer Invoices" subtitle="Created from sales orders. Posting one records revenue and a receivable." />

      <Lesson step="Step 6 · Accounting" title="An invoice is a journal entry">
        <p>In Odoo-style ERPs an invoice <b>is</b> a journal entry with a nice layout. Posting it debits <b>Accounts Receivable</b> (the customer owes us) and credits <b>Sales</b> and <b>VAT Payable</b>.</p>
        <p>The <b>amount due</b> goes down as payments are registered. The due date comes from the customer's payment terms.</p>
      </Lesson>

      {error && <ErrorBox message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty icon={<ReceiptText className="size-6" />} title="No invoices yet" hint="Create one from a confirmed sales order." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead className="text-left text-[12px] text-label-3">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Amount due</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((m) => {
                const overdue = m.state === 'posted' && num(m.amount_residual) > 0 && m.invoice_date_due && m.invoice_date_due < today
                return (
                  <tr key={m.id} className="border-b border-line/60 transition last:border-0 hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-medium tnum"><Link to={`/invoices/${m.id}`} className="hover:text-blue">{m.state === 'draft' ? 'Draft' : m.name}</Link></td>
                    <td className="px-4 py-3">{m.partner_name}</td>
                    <td className="px-4 py-3 text-label-2">{date(m.date)}</td>
                    <td className={cx('px-4 py-3', overdue ? 'text-red' : 'text-label-2')}>{date(m.invoice_date_due)}</td>
                    <td className="px-4 py-3 text-right tnum">{money(m.amount_total)}</td>
                    <td className="px-4 py-3 text-right font-medium tnum">{m.state === 'posted' ? money(m.amount_residual) : '—'}</td>
                    <td className="px-4 py-3"><MoveState move={m} /></td>
                    <td className="pr-3"><Link to={`/invoices/${m.id}`} className="text-label-3"><ChevronRight className="size-4" /></Link></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
