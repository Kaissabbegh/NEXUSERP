import { ChevronRight, ReceiptText } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { MoveState } from '../components/status'
import { Empty, ErrorBox, Lesson, PageHeader, Segmented, Spinner } from '../components/ui'
import { cx, date, money, num } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Move } from '../lib/types'

export default function Invoices({ kind = 'customer' }: { kind?: 'customer' | 'vendor' }) {
  const vendor = kind === 'vendor'
  const base = vendor ? '/bills' : '/invoices'
  const [params, setParams] = useSearchParams()
  const credits = !vendor && params.get('type') === 'credit'
  const { data, error, loading } = useFetch<Move[]>(`/moves/?type=${vendor ? 'in_invoice' : credits ? 'out_refund' : 'out_invoice'}`)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      {vendor ? (
        <>
          <PageHeader title="Vendor Bills" subtitle="Invoices we received from suppliers. Posting one records what we owe them." />
          <Lesson step="Step 4 · Procure-to-Pay" title="A bill is a debt we must pay">
            <p>A vendor bill is the supplier's invoice to us. Posting it credits <b>Accounts Payable</b>: we <b>owe</b> the vendor until we pay. The VAT on it goes to <b>VAT Receivable</b>, because the state lets us deduct it.</p>
            <p>The <b>amount due</b> is what we still owe. The due date comes from the vendor's payment terms.</p>
          </Lesson>
        </>
      ) : (
        <>
          <PageHeader title="Customer Invoices" subtitle="Created from sales orders. Posting one records revenue and a receivable." />
          <Lesson step="Step 6 · Accounting" title="An invoice is a journal entry">
            <p>In Odoo-style ERPs an invoice <b>is</b> a journal entry with a nice layout. Posting it debits <b>Accounts Receivable</b> (the customer owes us) and credits <b>Sales</b> and <b>VAT Payable</b>.</p>
            <p>The <b>amount due</b> goes down as payments are registered. The due date comes from the customer's payment terms.</p>
          </Lesson>
        </>
      )}

      {!vendor && (
        <div className="mb-4">
          <Segmented<'inv' | 'credit'> value={credits ? 'credit' : 'inv'} onChange={(v) => setParams(v === 'credit' ? { type: 'credit' } : {})}
            options={[{ value: 'inv', label: 'Invoices' }, { value: 'credit', label: 'Credit notes' }]} />
        </div>
      )}
      {error && <ErrorBox message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty icon={<ReceiptText className="size-6" />} title={vendor ? 'No bills yet' : 'No invoices yet'} hint={vendor ? 'Create one from a received purchase order.' : 'Create one from a confirmed sales order.'} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead className="text-left text-[12px] text-label-3">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">{vendor ? 'Vendor' : 'Customer'}</th>
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
                    <td className="px-4 py-3 font-medium tnum"><Link to={`${base}/${m.id}`} className="hover:text-blue">{m.state === 'draft' ? 'Draft' : m.name}</Link></td>
                    <td className="px-4 py-3">{m.partner_name}</td>
                    <td className="px-4 py-3 text-label-2">{date(m.date)}</td>
                    <td className={cx('px-4 py-3', overdue ? 'text-red' : 'text-label-2')}>{date(m.invoice_date_due)}</td>
                    <td className="px-4 py-3 text-right tnum">{money(m.amount_total)}</td>
                    <td className="px-4 py-3 text-right font-medium tnum">{m.state === 'posted' ? money(m.amount_residual) : '—'}</td>
                    <td className="px-4 py-3"><MoveState move={m} /></td>
                    <td className="pr-3"><Link to={`${base}/${m.id}`} className="text-label-3"><ChevronRight className="size-4" /></Link></td>
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
