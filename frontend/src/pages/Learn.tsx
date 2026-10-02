import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, Boxes, Database, Factory, Play, RotateCcw, ShoppingBag, ShoppingCart, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, PageHeader, Pill } from '../components/ui'
import { cx } from '../lib/format'

type ModuleKey = 'sales' | 'inventory' | 'accounting' | 'purchase' | 'contacts' | 'manufacturing'

const MODULES: Record<ModuleKey, { label: string; icon: typeof Users; color: string; x: number; y: number; ready: boolean; to?: string; text: string; data: string[] }> = {
  sales: { label: 'Sales', icon: ShoppingBag, color: '#30d158', x: 50, y: 9, ready: true, to: '/sales',
    text: 'Quotations and sales orders. Confirming an order reserves stock and creates a delivery automatically.',
    data: ['Reads: customers, products, prices, taxes', 'Creates: delivery orders, invoices'] },
  inventory: { label: 'Inventory', icon: Boxes, color: '#ffd60a', x: 88, y: 30, ready: true, to: '/stock',
    text: 'Where the goods are. Every movement (receipt, delivery, adjustment) is a stock move from one location to another.',
    data: ['Reads: products, warehouses', 'Creates: stock valuation journal entries'] },
  accounting: { label: 'Accounting', icon: BookOpen, color: '#0a84ff', x: 88, y: 72, ready: true, to: '/entries',
    text: 'The destination of every business event. Each operation becomes a balanced journal entry (debit = credit).',
    data: ['Reads: chart of accounts, journals, taxes', 'Produces: balance sheet, profit & loss'] },
  purchase: { label: 'Purchasing', icon: ShoppingCart, color: '#ff9f0a', x: 12, y: 72, ready: true, to: '/purchases',
    text: 'Requests for quotation and purchase orders to vendors. Receipts increase stock; vendor bills create payables.',
    data: ['Reads: vendors, products, reorder rules', 'Creates: receipts, vendor bills'] },
  contacts: { label: 'Contacts', icon: Users, color: '#40c8e0', x: 12, y: 30, ready: true, to: '/contacts',
    text: 'Customers and vendors in one list. Their payment terms, credit limits and accounts drive every document.',
    data: ['Used by: sales, purchasing, invoicing, payments'] },
  manufacturing: { label: 'Manufacturing', icon: Factory, color: '#bf5af2', x: 50, y: 91, ready: true, to: '/manufacturing',
    text: 'Bills of materials and work orders: turn components into finished goods. Consumes and produces stock.',
    data: ['Reads: bills of materials, work centers', 'Creates: stock moves, cost entries'] },
}

// The "one order" story: each step lights up a module and shows what happened.
const STORY: { module: ModuleKey; title: string; detail: string }[] = [
  { module: 'contacts', title: 'Customer chosen', detail: 'Sales picks "Atlas Consulting". Payment terms (30 days) and credit limit load automatically.' },
  { module: 'sales', title: 'Order confirmed', detail: 'S00012 for 10 Oak Desks at $890. The quotation becomes a sales order.' },
  { module: 'inventory', title: 'Delivery created & shipped', detail: 'WH/OUT/00012 moves 10 desks from WH/Stock to Customers. On-hand drops from 14 to 4.' },
  { module: 'accounting', title: 'Cost of goods posted', detail: 'Debit Cost of Goods Sold $5,200 / Credit Inventory $5,200. Stock value leaves the balance sheet.' },
  { module: 'accounting', title: 'Invoice posted', detail: 'Debit Receivable $10,680 / Credit Sales $8,900 + VAT Payable $1,780.' },
  { module: 'accounting', title: 'Payment received', detail: 'Debit Bank $10,680 / Credit Receivable $10,680. The invoice is marked Paid.' },
]

export default function Learn() {
  const [selected, setSelected] = useState<ModuleKey>('sales')
  const [step, setStep] = useState(-1)
  const playing = step >= 0 && step < STORY.length

  useEffect(() => {
    if (!playing) return
    const t = setTimeout(() => setStep((s) => s + 1), 2200)
    return () => clearTimeout(t)
  }, [step, playing])

  const active = playing ? STORY[step].module : step >= STORY.length ? null : selected
  const m = MODULES[selected]

  return (
    <>
      <PageHeader title="ERP Map" subtitle="Step 1 — one database, many modules, every action flows to the others." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card className="relative">
          <div className="relative mx-auto aspect-square max-w-[560px]">
            <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
              {(Object.keys(MODULES) as ModuleKey[]).map((k) => {
                const mod = MODULES[k]
                const lit = active === k
                return (
                  <g key={k}>
                    <line x1="50" y1="50" x2={mod.x} y2={mod.y} stroke={lit ? mod.color : 'rgba(235,235,245,0.12)'} strokeWidth={lit ? 0.6 : 0.35} strokeDasharray={mod.ready ? undefined : '1 1'} />
                    {lit && (
                      <motion.circle r="1.1" fill={mod.color} initial={{ cx: 50, cy: 50 }} animate={{ cx: [50, mod.x, 50], cy: [50, mod.y, 50] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} />
                    )}
                  </g>
                )
              })}
            </svg>

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <motion.div animate={{ boxShadow: ['0 0 0 0 rgba(10,132,255,0.35)', '0 0 0 18px rgba(10,132,255,0)'] }} transition={{ duration: 2, repeat: Infinity }} className="grid size-24 place-items-center rounded-full bg-gradient-to-br from-blue to-indigo text-center sm:size-28">
                <div>
                  <Database className="mx-auto size-6" />
                  <div className="mt-1 text-[11px] font-semibold leading-tight">One shared<br />database</div>
                </div>
              </motion.div>
            </div>

            {(Object.keys(MODULES) as ModuleKey[]).map((k) => {
              const mod = MODULES[k]
              const lit = active === k
              return (
                <button
                  key={k}
                  onClick={() => (setStep(-1), setSelected(k))}
                  style={{ left: `${mod.x}%`, top: `${mod.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                >
                  <motion.div animate={{ scale: lit ? 1.1 : 1 }} className={cx('flex flex-col items-center gap-1.5 rounded-2xl px-3 py-2.5 transition', lit ? 'bg-white/10' : 'hover:bg-white/5')}>
                    <span className="grid size-12 place-items-center rounded-[14px] text-black shadow-lg" style={{ background: mod.color, opacity: mod.ready ? 1 : 0.55 }}>
                      <mod.icon className="size-6" />
                    </span>
                    <span className="text-[12px] font-medium">{mod.label}</span>
                  </motion.div>
                </button>
              )
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Watch one order flow through the ERP">
            <p className="mb-4 text-[14px] text-label-2">A customer orders 10 Oak Desks. Watch how one entry at the source updates every department, with nothing typed twice.</p>
            <div className="mb-4 flex gap-2">
              <Button icon={step >= STORY.length ? <RotateCcw className="size-4" /> : <Play className="size-4" />} onClick={() => setStep(0)} disabled={playing}>
                {step >= STORY.length ? 'Replay' : 'Play'}
              </Button>
            </div>
            <ol className="space-y-2">
              {STORY.map((s, i) => {
                const mod = MODULES[s.module]
                const state = step > i ? 'done' : step === i ? 'now' : 'todo'
                return (
                  <motion.li key={i} animate={{ opacity: state === 'todo' && step >= 0 ? 0.35 : 1 }} className={cx('rounded-xl p-3 transition', state === 'now' ? 'bg-white/10' : 'bg-surface-2')}>
                    <div className="flex items-center gap-2">
                      <span className="grid size-5 place-items-center rounded-full text-[11px] font-bold text-black" style={{ background: mod.color }}>{i + 1}</span>
                      <span className="text-[14px] font-medium">{s.title}</span>
                      <span className="ml-auto text-[12px] text-label-3">{mod.label}</span>
                    </div>
                    <AnimatePresence>
                      {(state !== 'todo' || step < 0) && (
                        <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-1.5 pl-7 text-[13px] text-label-2">
                          {s.detail}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </motion.li>
                )
              })}
            </ol>
          </Card>

          <Card>
            <div className="mb-2 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-[10px] text-black" style={{ background: m.color }}>
                <m.icon className="size-4" />
              </span>
              <h3 className="text-[17px] font-semibold">{m.label}</h3>
              {m.ready ? <Pill tone="green">Live in NexusERP</Pill> : <Pill tone="gray">Coming in a later step</Pill>}
            </div>
            <p className="text-[14px] text-label-2">{m.text}</p>
            <ul className="mt-3 space-y-1 text-[13px] text-label-2">
              {m.data.map((d) => <li key={d}>• {d}</li>)}
            </ul>
            {m.to && <Link to={m.to} className="mt-3 inline-block text-[14px] text-blue">Open {m.label} →</Link>}
          </Card>
        </div>
      </div>
    </>
  )
}
