import { motion } from 'framer-motion'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAction } from '../components/toast'
import { Button, Card, ErrorBox, Field, PageHeader, Spinner } from '../components/ui'
import { post, put } from '../lib/api'
import { money, num } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Partner, PaymentTerm, Product, SaleOrder, SaleOrderLine, Tax } from '../lib/types'

type Line = SaleOrderLine & { key: number }
let keySeq = 0

export default function SaleOrderEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const existing = useFetch<SaleOrder>(id ? `/sale-orders/${id}/` : null)
  const customers = useFetch<Partner[]>('/partners/?role=customer').data ?? []
  const products = useFetch<Product[]>('/products/').data ?? []
  const taxes = useFetch<Tax[]>('/taxes/').data ?? []
  const terms = useFetch<PaymentTerm[]>('/payment-terms/').data ?? []
  const { run, busy } = useAction()

  const [partner, setPartner] = useState<number | ''>('')
  const [paymentTerm, setPaymentTerm] = useState<number | ''>('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([])

  useEffect(() => {
    const o = existing.data
    if (!o) return
    setPartner(o.partner)
    setPaymentTerm(o.payment_term ?? '')
    setNote(o.note)
    setLines(o.lines.map((l) => ({ ...l, key: ++keySeq })))
  }, [existing.data])

  const customer = customers.find((c) => c.id === partner)
  const pickCustomer = (v: number | '') => {
    setPartner(v)
    const c = customers.find((x) => x.id === v)
    if (c && !id) setPaymentTerm(c.payment_term ?? '')
  }

  const addLine = () => setLines((ls) => [...ls, { key: ++keySeq, product: 0, quantity: '1', price_unit: '0', discount: '0', tax: null }])
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const pickProduct = (key: number, pid: number) => {
    const p = products.find((x) => x.id === pid)
    if (p) update(key, { product: pid, price_unit: p.sale_price, tax: p.sale_tax, description: p.name })
  }

  const totals = useMemo(() => {
    let untaxed = 0
    let tax = 0
    for (const l of lines) {
      const sub = num(l.quantity) * num(l.price_unit) * (1 - num(l.discount) / 100)
      untaxed += sub
      const t = taxes.find((x) => x.id === l.tax)
      if (t) tax += (sub * num(t.rate)) / 100
    }
    return { untaxed, tax, total: untaxed + tax }
  }, [lines, taxes])

  const valid = partner && lines.length > 0 && lines.every((l) => l.product && num(l.quantity) > 0)

  const save = async () => {
    const body = {
      partner,
      payment_term: paymentTerm || null,
      note,
      lines: lines.map(({ product, description, quantity, price_unit, discount, tax }) => ({ product, description, quantity, price_unit, discount, tax })),
    }
    const order = await run('save', () => (id ? put<SaleOrder>(`/sale-orders/${id}/`, body) : post<SaleOrder>('/sale-orders/', body)), id ? 'Quotation updated' : 'Quotation created')
    if (order) navigate(`/sales/${order.id}`)
  }

  if (id && existing.loading) return <Spinner />
  if (existing.error) return <ErrorBox message={existing.error} />

  return (
    <>
      <Link to={id ? `/sales/${id}` : '/sales'} className="mb-3 inline-flex items-center gap-1 text-[14px] text-blue">
        <ArrowLeft className="size-4" /> {id ? existing.data?.name : 'Sales Orders'}
      </Link>
      <PageHeader
        title={id ? `Edit ${existing.data?.name ?? ''}` : 'New Quotation'}
        subtitle="Pick a customer and products. Prices, taxes and payment terms come from master data."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(-1)}>Discard</Button>
            <Button onClick={save} loading={busy === 'save'} disabled={!valid}>Save Quotation</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer">
                <select className="field" value={partner} onChange={(e) => pickCustomer(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Select a customer…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Payment terms" hint={customer ? `Default for ${customer.name}` : undefined}>
                <select className="field" value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">None</option>
                  {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
            </div>
            {customer && num(customer.credit_limit) > 0 && (
              <p className="mt-3 text-[13px] text-label-2">
                Credit limit {money(customer.credit_limit)} · currently owes {money(customer.open_balance)} ·{' '}
                <span className={num(customer.open_balance) + totals.total > num(customer.credit_limit) ? 'text-red' : 'text-green'}>
                  {money(num(customer.credit_limit) - num(customer.open_balance) - totals.total)} left after this order
                </span>
              </p>
            )}
          </Card>

          <Card title="Order lines">
            <div className="space-y-2">
              {lines.map((l) => {
                const sub = num(l.quantity) * num(l.price_unit) * (1 - num(l.discount) / 100)
                const p = products.find((x) => x.id === l.product)
                return (
                  <motion.div key={l.key} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-3 sm:grid-cols-[2fr_80px_110px_80px_130px_100px_32px] sm:items-end">
                    <Field label="Product">
                      <select className="field !bg-surface-3" value={l.product || ''} onChange={(e) => pickProduct(l.key, Number(e.target.value))}>
                        <option value="">Select…</option>
                        {products.map((p) => <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Qty"><input className="field !bg-surface-3 tnum" type="number" min={0} value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} /></Field>
                    <Field label="Unit price"><input className="field !bg-surface-3 tnum" type="number" min={0} step="0.01" value={l.price_unit} onChange={(e) => update(l.key, { price_unit: e.target.value })} /></Field>
                    <Field label="Disc. %"><input className="field !bg-surface-3 tnum" type="number" min={0} max={100} value={l.discount} onChange={(e) => update(l.key, { discount: e.target.value })} /></Field>
                    <Field label="Tax">
                      <select className="field !bg-surface-3" value={l.tax ?? ''} onChange={(e) => update(l.key, { tax: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">None</option>
                        {taxes.filter((t) => t.scope === 'sale').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </Field>
                    <div className="pb-2.5 text-right font-medium tnum">{money(sub)}</div>
                    <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="mb-1.5 grid size-8 place-items-center rounded-full text-label-3 transition hover:bg-red/15 hover:text-red" aria-label="Remove line">
                      <Trash2 className="size-4" />
                    </button>
                    {p?.on_hand !== null && p?.on_hand !== undefined && (
                      <p className="col-span-full text-[12px] text-label-3">
                        {num(p.on_hand) - num(p.reserved)} available ({num(p.on_hand)} on hand, {num(p.reserved)} reserved for other orders)
                      </p>
                    )}
                  </motion.div>
                )
              })}
            </div>
            <Button variant="ghost" className="mt-3" icon={<Plus className="size-4" />} onClick={addLine}>Add a product</Button>
          </Card>

          <Card>
            <Field label="Terms & conditions / notes">
              <textarea className="field min-h-20" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </Card>
        </div>

        <div>
          <Card className="sticky top-6" title="Summary">
            <dl className="space-y-2 text-[15px]">
              <div className="flex justify-between"><dt className="text-label-2">Untaxed</dt><dd className="tnum">{money(totals.untaxed)}</dd></div>
              <div className="flex justify-between"><dt className="text-label-2">Taxes</dt><dd className="tnum">{money(totals.tax)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-[19px] font-semibold"><dt>Total</dt><dd className="tnum">{money(totals.total)}</dd></div>
            </dl>
            <p className="mt-4 text-[13px] text-label-3">Saving creates a <b className="text-label-2">quotation</b>. Nothing happens in stock or accounting until you confirm it.</p>
          </Card>
        </div>
      </div>
    </>
  )
}
