import { motion } from 'framer-motion'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, ErrorBox, Lesson, PageHeader, Segmented, Spinner } from '../components/ui'
import { cx, money, num } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { ProfitLoss as PL, ReportSection } from '../lib/types'

type Period = 'month' | 'quarter' | 'year' | 'all'

function range(p: Period): string {
  const now = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (p === 'all') return ''
  const from = p === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1)
    : p === 'quarter' ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    : new Date(now.getFullYear(), 0, 1)
  return `?date_from=${iso(from)}&date_to=${iso(now)}`
}

function Section({ title, section, tone }: { title: string; section: ReportSection; tone: string }) {
  return (
    <div>
      <div className="flex items-center justify-between py-2">
        <h3 className={cx('text-[15px] font-semibold', tone)}>{title}</h3>
        <span className={cx('font-semibold tnum', tone)}>{money(section.total)}</span>
      </div>
      <ul>
        {section.lines.map((l) => (
          <li key={l.code}>
            <Link to={`/entries?account=${l.id}&name=${encodeURIComponent(`${l.code} ${l.name}`)}`} className="flex justify-between rounded-lg px-3 py-1.5 text-[14px] text-label-2 transition hover:bg-white/5 hover:text-label">
              <span><span className="mr-2 text-label-3 tnum">{l.code}</span>{l.name}</span>
              <span className="tnum">{money(l.amount)}</span>
            </Link>
          </li>
        ))}
        {section.lines.length === 0 && <li className="px-3 py-1.5 text-[14px] text-label-3">Nothing in this period</li>}
      </ul>
    </div>
  )
}

export default function ProfitLoss() {
  const [period, setPeriod] = useState<Period>('all')
  const { data, error, loading } = useFetch<PL>(`/reports/profit-loss/${range(period)}`)

  const revenue = num(data?.revenue.total)
  const bars = data
    ? [
        { label: 'Revenue', value: revenue, color: 'bg-green' },
        { label: 'Cost of goods', value: num(data.cost_of_revenue.total), color: 'bg-orange' },
        { label: 'Expenses', value: num(data.expenses.total), color: 'bg-red' },
        { label: num(data.net_profit) >= 0 ? 'Net profit' : 'Net loss', value: Math.abs(num(data.net_profit)), color: num(data.net_profit) >= 0 ? 'bg-blue' : 'bg-pink' },
      ]
    : []
  const max = Math.max(1, ...bars.map((b) => b.value))

  return (
    <>
      <PageHeader title="Profit & Loss" subtitle="Did we make money? Income minus everything it cost to earn it." actions={
        <Segmented<Period> value={period} onChange={setPeriod} options={[{ value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }, { value: 'year', label: 'Year' }, { value: 'all', label: 'All' }]} />
      } />

      <Lesson step="Step 6 · Accounting" title="Reading a P&L">
        <p><b>Revenue</b> − <b>Cost of goods sold</b> = <b>Gross profit</b>: what the products themselves earned. Then subtract running <b>expenses</b> (rent, salaries) to get <b>net profit</b>.</p>
        <p>A company can sell a lot and still make a loss if its expenses are too high. That's exactly what the demo company shows!</p>
      </Lesson>

      {error && <ErrorBox message={error} />}
      {loading && !data ? <Spinner /> : data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <Card>
            <Section title="Revenue" section={data.revenue} tone="text-green" />
            <div className="my-2 border-t border-line" />
            <Section title="Cost of goods sold" section={data.cost_of_revenue} tone="text-orange" />
            <div className="my-3 flex justify-between rounded-xl bg-white/5 px-3 py-2.5 font-semibold">
              <span>Gross profit {data.gross_margin !== null && <span className="ml-1 text-[13px] font-normal text-label-2">({num(data.gross_margin)}% margin)</span>}</span>
              <span className="tnum">{money(data.gross_profit)}</span>
            </div>
            <Section title="Operating expenses" section={data.expenses} tone="text-red" />
            <div className={cx('mt-4 flex justify-between rounded-xl px-4 py-3 text-[19px] font-bold', num(data.net_profit) >= 0 ? 'bg-blue/15 text-blue' : 'bg-pink/15 text-pink')}>
              <span>{num(data.net_profit) >= 0 ? 'Net profit' : 'Net loss'}</span>
              <span className="tnum">{money(data.net_profit)}</span>
            </div>
          </Card>

          <Card title="At a glance">
            <div className="space-y-3">
              {bars.map((b, i) => (
                <div key={b.label}>
                  <div className="mb-1 flex justify-between text-[13px]"><span className="text-label-2">{b.label}</span><span className="font-medium tnum">{money(b.value)}</span></div>
                  <div className="h-3 overflow-hidden rounded-full bg-surface-3">
                    <motion.div className={cx('h-full rounded-full', b.color)} initial={{ width: 0 }} animate={{ width: `${(b.value / max) * 100}%` }} transition={{ delay: i * 0.08, duration: 0.6 }} />
                  </div>
                </div>
              ))}
            </div>
            {revenue > 0 && (
              <p className="mt-5 text-[13px] text-label-2">
                Out of every <b className="text-label">$100</b> of sales, <b className="text-orange">${((num(data.cost_of_revenue.total) / revenue) * 100).toFixed(0)}</b> paid for the goods,{' '}
                <b className="text-red">${((num(data.expenses.total) / revenue) * 100).toFixed(0)}</b> paid running costs, leaving{' '}
                <b className={num(data.net_profit) >= 0 ? 'text-blue' : 'text-pink'}>${((num(data.net_profit) / revenue) * 100).toFixed(0)}</b>.
              </p>
            )}
          </Card>
        </div>
      )}
    </>
  )
}
