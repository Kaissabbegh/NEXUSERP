import { motion } from 'framer-motion'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAction } from '../components/toast'
import { Button, Card, ErrorBox, Field, PageHeader, Spinner } from '../components/ui'
import { post, put } from '../lib/api'
import { money, num, qty } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Partner, PaymentTerm, Product, PurchaseOrder, PurchaseOrderLine, Tax } from '../lib/types'

type Line = PurchaseOrderLine & { key: number }
let keySeq = 0

export default function PurchaseOrderEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const existing = useFetch<PurchaseOrder>(id ? `/purchase-orders/${id}/` : null)
  const vendors = useFetch<Partner[]>('/partners/?role=vendor').data ?? []
  const products = useFetch<Product[]>('/products/').data ?? []
  const allTaxes = useFetch<Tax[]>('/taxes/').data ?? []
  const taxes = allTaxes.filter((t) => t.scope === 'purchase')
  const terms = useFetch<PaymentTerm[]>('/payment-terms/').data ?? []
  const { run, busy } = useAction()

  const [partner, setPartner] = useState<number | ''>('')
  const [paymentTerm, setPaymentTerm] = useState<number | ''>('')
  const [planned, setPlanned] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([])

  useEffect(() => {
    const o = existing.data
    if (!o) return
    setPartner(o.partner)
    setPaymentTerm(o.payment_term ?? '')
    setPlanned(o.date_planned ?? '')
    setNote(o.note)
    setLines(o.lines.map((l) => ({ ...l, key: ++keySeq })))
  }, [existing.data])

  const vendor = vendors.find((v) => v.id === partner)
  const pickVendor = (v: number | '') => {
    setPartner(v)
    const p = vendors.find((x) => x.id === v)
    if (p && !id) setPaymentTerm(p.payment_term ?? '')
  }

  // Products this vendor supplies first, then everything else (services excluded: nothing to receive or count).
  const sortedProducts = useMemo(() => {
    const buyable = products.filter((p) => p.product_type !== 'service')
    return [...buyable.filter((p) => p.vendor === partner), ...buyable.filter((p) => p.vendor !== partner)]
  }, [products, partner])

  const addLine = () => setLines((ls) => [...ls, { key: ++keySeq, product: 0, quantity: '1', price_unit: '0', tax: null }])
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const pickProduct = (key: number, pid: number) => {
    const p = products.find((x) => x.id === pid)
    if (p) update(key, { product: pid, price_unit: p.cost, tax: p.purchase_tax, description: p.name })
  }

  const totals = useMemo(() => {
    let untaxed = 0
    let tax = 0
    for (const l of lines) {
      const sub = num(l.quantity) * num(l.price_unit)
      untaxed += sub
      const t = allTaxes.find((x) => x.id === l.tax)
      if (t) tax += (sub * num(t.rate)) / 100
    }
    return { untaxed, tax, total: untaxed + tax }
  }, [lines, allTaxes])

  const valid = partner && lines.length > 0 && lines.every((l) => l.product && num(l.quantity) > 0)

  const save = async () => {
    const body = {
      partner,
      payment_term: paymentTerm || null,
      date_planned: planned || null,
      note,
      lines: lines.map(({ product, description, quantity, price_unit, tax }) => ({ product, description, quantity, price_unit, tax })),
    }
    const order = await run('save', () => (id ? put<PurchaseOrder>(`/purchase-orders/${id}/`, body) : post<PurchaseOrder>('/purchase-orders/', body)), id ? 'RFQ updated' : 'RFQ created')
    if (order) navigate(`/purchases/${order.id}`)
  }

  if (id && existing.loading) return <Spinner />
  if (existing.error) return <ErrorBox message={existing.error} />

  return (
    <>
      <Link to={id ? `/purchases/${id}` : '/purchases'} className="mb-3 inline-flex items-center gap-1 text-[14px] text-blue">
        <ArrowLeft className="size-4" /> {id ? existing.data?.name : 'Purchase Orders'}
      </Link>
      <PageHeader
        title={id ? `Edit ${existing.data?.name ?? ''}` : 'New Request for Quotation'}
        subtitle="Ask a vendor for a price. Purchase prices default to the product cost."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(-1)}>Discard</Button>
            <Button onClick={save} loading={busy === 'save'} disabled={!valid}>Save RFQ</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Vendor">
                <select className="field" value={partner} onChange={(e) => pickVendor(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Select a vendor…</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </Field>
              <Field label="Payment terms" hint={vendor ? `What ${vendor.name} gives us` : undefined}>
                <select className="field" value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">None</option>
                  {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Expected arrival">
                <input className="field" type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card title="Products to buy">
            <div className="space-y-2">
              {lines.map((l) => {
                const sub = num(l.quantity) * num(l.price_unit)
                const p = products.find((x) => x.id === l.product)
                return (
                  <motion.div key={l.key} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-3 sm:grid-cols-[2fr_80px_120px_150px_100px_32px] sm:items-end">
                    <Field label="Product">
                      <select className="field !bg-surface-3" value={l.product || ''} onChange={(e) => pickProduct(l.key, Number(e.target.value))}>
                        <option value="">Select…</option>
                        {sortedProducts.map((p) => <option key={p.id} value={p.id}>[{p.sku}] {p.name}{p.vendor === partner ? ' ★' : ''}</option>)}
                      </select>
                    </Field>
                    <Field label="Qty"><input className="field !bg-surface-3 tnum" type="number" min={0} value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} /></Field>
                    <Field label="Unit price"><input className="field !bg-surface-3 tnum" type="number" min={0} step="0.01" value={l.price_unit} onChange={(e) => update(l.key, { price_unit: e.target.value })} /></Field>
                    <Field label="Tax">
                      <select className="field !bg-surface-3" value={l.tax ?? ''} onChange={(e) => update(l.key, { tax: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">None</option>
                        {taxes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </Field>
                    <div className="pb-2.5 text-right font-medium tnum">{money(sub)}</div>
                    <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="mb-1.5 grid size-8 place-items-center rounded-full text-label-3 transition hover:bg-red/15 hover:text-red" aria-label="Remove line">
                      <Trash2 className="size-4" />
                    </button>
                    {p?.on_hand !== null && p?.on_hand !== undefined && (
                      <p className="col-span-full text-[12px] text-label-3">
                        {qty(p.on_hand)} on hand · reorder point {qty(p.reorder_min)} · current cost {money(p.cost)}
                      </p>
                    )}
                  </motion.div>
                )
              })}
            </div>
            <Button variant="ghost" className="mt-3" icon={<Plus className="size-4" />} onClick={addLine}>Add a product</Button>
            {partner !== '' && <p className="mt-2 text-[12px] text-label-3">★ = this vendor is the product's main supplier.</p>}
          </Card>

          <Card>
            <Field label="Notes for the vendor">
              <textarea className="field min-h-20" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </Card>
        </div>

        <div>
          <Card className="sticky top-6" title="Summary">
            <dl className="space-y-2 text-[15px]">
              <div className="flex justify-between"><dt className="text-label-2">Untaxed</dt><dd className="tnum">{money(totals.untaxed)}</dd></div>
              <div className="flex justify-between"><dt className="text-label-2">VAT (reclaimable)</dt><dd className="tnum">{money(totals.tax)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-[19px] font-semibold"><dt>Total</dt><dd className="tnum">{money(totals.total)}</dd></div>
            </dl>
            <p className="mt-4 text-[13px] text-label-3">Saving creates an <b className="text-label-2">RFQ</b>. Nothing is owed and nothing moves until the vendor confirms and the goods arrive.</p>
          </Card>
        </div>
      </div>
    </>
  )
}
