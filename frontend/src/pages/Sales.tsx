import { ChevronRight, Plus, ShoppingBag } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DeliveryState, InvoiceState, OrderState } from '../components/status'
import { Button, Empty, ErrorBox, Lesson, PageHeader, Segmented, Spinner } from '../components/ui'
import { date, money } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { SaleOrder } from '../lib/types'

type F = '' | 'draft' | 'sale' | 'cancel'

export default function Sales() {
  const [params, setParams] = useSearchParams()
  const state = (params.get('state') ?? '') as F
  const { data, error, loading } = useFetch<SaleOrder[]>(`/sale-orders/?state=${state}`)
  const navigate = useNavigate()

  return (
    <>
      <PageHeader title="Sales Orders" subtitle="Quotations become orders, then deliveries, invoices and payments." actions={<Button icon={<Plus className="size-4" />} onClick={() => navigate('/sales/new')}>New Quotation</Button>} />

      <Lesson step="Step 3 · Order-to-Cash" title="Quotation → Order → Delivery → Invoice → Payment">
        <p>A <b>quotation</b> is only a proposal: it changes nothing in stock or accounting. <b>Confirming</b> it turns it into a <b>sales order</b>, which creates a delivery order in Inventory.</p>
        <p>Open any order to see its live <b>flow diagram</b> and the journal entries each step produced.</p>
      </Lesson>

      <div className="mb-4">
        <Segmented<F>
          value={state}
          onChange={(v) => setParams(v ? { state: v } : {})}
          options={[{ value: '', label: 'All' }, { value: 'draft', label: 'Quotations' }, { value: 'sale', label: 'Orders' }, { value: 'cancel', label: 'Cancelled' }]}
        />
      </div>

      {error && <ErrorBox message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty icon={<ShoppingBag className="size-6" />} title="Nothing here yet" hint="Create a quotation to start the Order-to-Cash flow." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead className="text-left text-[12px] text-label-3">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Delivery</th>
                <th className="px-4 py-3 font-medium">Invoicing</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id} className="border-b border-line/60 transition last:border-0 hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-medium tnum"><Link to={`/sales/${o.id}`} className="hover:text-blue">{o.name}</Link></td>
                  <td className="px-4 py-3">{o.partner_name}</td>
                  <td className="px-4 py-3 text-label-2">{date(o.date_order)}</td>
                  <td className="px-4 py-3"><OrderState order={o} /></td>
                  <td className="px-4 py-3"><DeliveryState status={o.delivery_status} /></td>
                  <td className="px-4 py-3"><InvoiceState status={o.invoice_status} /></td>
                  <td className="px-4 py-3 text-right font-medium tnum">{money(o.amount_total)}</td>
                  <td className="pr-3"><Link to={`/sales/${o.id}`} className="text-label-3"><ChevronRight className="size-4" /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
