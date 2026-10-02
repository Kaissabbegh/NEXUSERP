import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, ChevronRight, FileText, Landmark, PackageCheck, PlayCircle, Plus, ReceiptText, ShoppingBag, ShoppingCart, Truck, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, ErrorBox, PageHeader, Pill, Spinner } from '../components/ui'
import { useAuth } from '../lib/auth'
import { money, moneyCompact, num, qty, relative } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Dashboard as D } from '../lib/types'

function Kpi({ label, value, hint, tone, i }: { label: string; value: string; hint?: string; tone: string; i: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card p-5">
      <div className="text-[13px] font-medium text-label-2">{label}</div>
      <div className={`mt-2 text-[28px] font-semibold tracking-[-0.02em] tnum ${tone}`}>{value}</div>
      {hint && <div className="mt-1 text-[12px] text-label-3">{hint}</div>}
    </motion.div>
  )
}

type Stage = { label: string; count: number | string; icon: LucideIcon; to: string; color: string }

function Pipeline({ title, stages, extra }: { title: string; stages: Stage[]; extra?: ReactNode }) {
  return (
    <Card className="mt-4" title={title} action={extra}>
      <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
        {stages.map((p, i) => (
          <div key={p.label} className="contents md:flex md:flex-1 md:items-center md:gap-2">
            <Link to={p.to} className="flex flex-1 items-center gap-3 rounded-xl bg-surface-2 p-3 transition hover:bg-surface-3">
              <span className={`grid size-9 place-items-center rounded-full ${p.color}`}>
                <p.icon className="size-4" />
              </span>
              <span>
                <span className="block text-[18px] font-semibold tnum">{p.count}</span>
                <span className="block text-[12px] text-label-2">{p.label}</span>
              </span>
            </Link>
            {i < stages.length - 1 && <ArrowRight className="hidden size-4 shrink-0 text-label-3 md:block" />}
          </div>
        ))}
      </div>
    </Card>
  )
}

function RevenueChart({ data }: { data: D['monthly_revenue'] }) {
  const max = Math.max(1, ...data.map((d) => num(d.revenue)))
  return (
    <div className="flex h-48 items-end gap-1.5 sm:gap-3">
      {data.map((d, i) => {
        const h = (num(d.revenue) / max) * 100
        const label = new Date(`${d.month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short' })
        return (
          <div key={d.month} className="group flex h-full min-w-0 flex-1 flex-col items-center gap-2">
            <span className="hidden text-[12px] font-medium text-label-2 opacity-0 transition group-hover:opacity-100 sm:block tnum">{moneyCompact(d.revenue)}</span>
            <div className="relative w-full max-w-12 flex-1">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(h, 2)}%` }}
                transition={{ delay: 0.1 + i * 0.06, type: 'spring', damping: 20 }}
                className="absolute inset-x-0 bottom-0 rounded-t-lg bg-gradient-to-t from-blue/60 to-blue group-hover:to-teal"
              />
            </div>
            <span className="text-[12px] text-label-3">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, error, loading } = useFetch<D>('/dashboard/')

  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!data) return null
  const k = data.kpis

  const o2c: Stage[] = [
    { label: 'Quotations', count: k.quotations, icon: FileText, to: '/sales?state=draft', color: 'text-blue bg-blue/15' },
    { label: 'To deliver', count: k.to_deliver, icon: Truck, to: '/transfers?kind=outgoing', color: 'text-orange bg-orange/15' },
    { label: 'To invoice', count: k.to_invoice, icon: ShoppingBag, to: '/sales?state=sale', color: 'text-yellow bg-yellow/15' },
    { label: 'They owe us', count: money(k.receivable), icon: ReceiptText, to: '/reports/aged?kind=receivable', color: 'text-green bg-green/15' },
  ]
  const p2p: Stage[] = [
    { label: 'RFQs', count: k.rfqs, icon: FileText, to: '/purchases?state=draft', color: 'text-blue bg-blue/15' },
    { label: 'To receive', count: k.to_receive, icon: PackageCheck, to: '/transfers?kind=incoming', color: 'text-teal bg-teal/15' },
    { label: 'To bill', count: k.to_bill, icon: ShoppingCart, to: '/purchases?state=purchase', color: 'text-yellow bg-yellow/15' },
    { label: 'We owe vendors', count: money(k.payable), icon: Landmark, to: '/reports/aged?kind=payable', color: 'text-orange bg-orange/15' },
  ]

  return (
    <>
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${user?.first_name || user?.username}`}
        subtitle="Here's how Nexus Furniture is doing."
        actions={
          <>
            <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => navigate('/purchases/new')}>New RFQ</Button>
            <Button icon={<Plus className="size-4" />} onClick={() => navigate('/sales/new')}>New Quotation</Button>
          </>
        }
      />

      <Link to="/scenarios" className="group mb-4 flex items-center gap-4 rounded-2xl border border-pink/25 bg-gradient-to-r from-pink/[0.14] via-purple/[0.10] to-blue/[0.06] p-4 transition hover:border-pink/40">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-pink text-white"><PlayCircle className="size-6" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Watch the ERP work: 5 guided scenarios</span>
          <span className="block text-[13px] text-label-2">Sell, buy, manufacture, chase a late payer, close the month. Each step plays by itself and is explained.</span>
        </span>
        <ArrowRight className="size-5 shrink-0 text-label-3 transition group-hover:translate-x-0.5 group-hover:text-label" />
      </Link>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi i={0} label="Revenue this month" value={money(k.revenue_month)} hint="Posted invoices, excl. tax" tone="text-label" />
        <Kpi i={1} label="Customers owe us" value={money(k.receivable)} hint={num(k.overdue) ? `${money(k.overdue)} overdue` : 'Nothing overdue'} tone="text-green" />
        <Kpi i={2} label="We owe vendors" value={money(k.payable)} hint="Posted bills not yet paid" tone="text-orange" />
        <Kpi i={3} label="Stock value" value={money(k.stock_value)} hint="On hand × cost" tone="text-teal" />
      </div>

      <Pipeline title="Selling · Order-to-Cash" stages={o2c} />
      <Pipeline title="Buying · Procure-to-Pay" stages={p2p}
        extra={k.to_produce ? <Link to="/manufacturing" className="text-[13px] text-purple">{k.to_produce} manufacturing order{k.to_produce > 1 ? 's' : ''} to produce →</Link> : undefined} />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Revenue by month">
          {data.monthly_revenue.length ? <RevenueChart data={data.monthly_revenue} /> : <p className="text-label-2">No posted invoices yet.</p>}
        </Card>

        <Card title="Low stock" action={<Link to="/stock" className="text-[13px] text-blue">View all</Link>}>
          {data.low_stock.length === 0 ? (
            <p className="text-[14px] text-label-2">All products are above their reorder point.</p>
          ) : (
            <ul className="space-y-2">
              {data.low_stock.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl bg-orange/[0.08] px-3 py-2.5">
                  <AlertTriangle className="size-4 shrink-0 text-orange" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{p.name}</div>
                    <div className="text-[12px] text-label-2">{qty(p.on_hand)} on hand · reorder at {qty(p.reorder_min)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4" title="Recent orders" action={<Link to="/sales" className="text-[13px] text-blue">All orders</Link>}>
        <ul className="-mx-2">
          {data.recent_orders.map((o) => (
            <li key={o.id}>
              <Link to={`/sales/${o.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/5">
                <span className="w-16 font-medium tnum">{o.name}</span>
                <span className="flex-1 truncate text-label-2">{o.partner}</span>
                <Pill tone={o.state === 'Quotation' ? 'blue' : o.state === 'Sales Order' ? 'green' : 'gray'}>{o.state}</Pill>
                <span className="hidden w-28 text-right tnum sm:block">{money(o.amount)}</span>
                <span className="hidden w-20 text-right text-[12px] text-label-3 md:block">{relative(o.at)}</span>
                <ChevronRight className="size-4 text-label-3" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
