import { ChevronRight, Plus, ShoppingCart } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BillState, PurchaseState, ReceiptState } from '../components/status'
import { Button, Empty, ErrorBox, Lesson, PageHeader, Segmented, Spinner } from '../components/ui'
import { date, money } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { PurchaseOrder } from '../lib/types'

type F = '' | 'draft' | 'purchase' | 'cancel'

export default function Purchases() {
  const [params, setParams] = useSearchParams()
  const state = (params.get('state') ?? '') as F
  const { data, error, loading } = useFetch<PurchaseOrder[]>(`/purchase-orders/?state=${state}`)
  const navigate = useNavigate()

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle="Buying from vendors: RFQ → Purchase Order → Receipt → Vendor Bill → Payment."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/replenishment')}>Replenishment</Button>
            <Button icon={<Plus className="size-4" />} onClick={() => navigate('/purchases/new')}>New RFQ</Button>
          </>
        }
      />

      <Lesson step="Step 4 · Procure-to-Pay" title="The mirror image of selling">
        <p>An <b>RFQ</b> (Request for Quotation) asks a vendor for a price. When they agree, you <b>confirm</b> it and it becomes a <b>Purchase Order</b>: a receipt is created for the warehouse.</p>
        <p>When goods arrive, stock goes <b>up</b>. When the vendor's bill arrives, you now <b>owe them money</b> (Accounts Payable, a liability). Paying the bill clears the debt.</p>
      </Lesson>

      <div className="mb-4">
        <Segmented<F> value={state} onChange={(v) => setParams(v ? { state: v } : {})}
          options={[{ value: '', label: 'All' }, { value: 'draft', label: 'RFQs' }, { value: 'purchase', label: 'Purchase Orders' }, { value: 'cancel', label: 'Cancelled' }]} />
      </div>

      {error && <ErrorBox message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty icon={<ShoppingCart className="size-6" />} title="Nothing here yet" hint="Create an RFQ to start buying." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-[14px]">
            <thead className="text-left text-[12px] text-label-3">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Order date</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Receipt</th>
                <th className="px-4 py-3 font-medium">Billing</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id} className="border-b border-line/60 transition last:border-0 hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-medium tnum"><Link to={`/purchases/${o.id}`} className="hover:text-blue">{o.name}</Link></td>
                  <td className="px-4 py-3">{o.partner_name}</td>
                  <td className="px-4 py-3 text-label-2">{date(o.date_order)}</td>
                  <td className="px-4 py-3"><PurchaseState order={o} /></td>
                  <td className="px-4 py-3"><ReceiptState status={o.receipt_status} /></td>
                  <td className="px-4 py-3"><BillState status={o.bill_status} /></td>
                  <td className="px-4 py-3 text-right font-medium tnum">{money(o.amount_total)}</td>
                  <td className="pr-3"><Link to={`/purchases/${o.id}`} className="text-label-3"><ChevronRight className="size-4" /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
