import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Card, ErrorBox, Lesson, PageHeader, Spinner } from '../components/ui'
import { cx, money, num } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { BalanceSheet as BS, ReportSection } from '../lib/types'

function Block({ title, hint, section, tone }: { title: string; hint: string; section: ReportSection; tone: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between">
        <h3 className={cx('text-[17px] font-semibold', tone)}>{title}</h3>
        <span className={cx('text-[17px] font-semibold tnum', tone)}>{money(section.total)}</span>
      </div>
      <p className="mb-2 text-[12px] text-label-3">{hint}</p>
      <ul>
        {section.lines.map((l) => (
          <li key={`${l.code}${l.name}`}>
            {l.id ? (
              <Link to={`/entries?account=${l.id}&name=${encodeURIComponent(`${l.code} ${l.name}`)}`} className="flex justify-between rounded-lg px-3 py-1.5 text-[14px] text-label-2 transition hover:bg-white/5 hover:text-label">
                <span><span className="mr-2 text-label-3 tnum">{l.code}</span>{l.name}</span>
                <span className="tnum">{money(l.amount)}</span>
              </Link>
            ) : (
              <div className="flex justify-between px-3 py-1.5 text-[14px] italic text-label-2"><span>{l.name}</span><span className="tnum">{money(l.amount)}</span></div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function BalanceSheet() {
  const { data, error, loading } = useFetch<BS>('/reports/balance-sheet/')
  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!data) return null

  const a = num(data.assets.total)
  const l = num(data.liabilities.total)
  const e = num(data.equity.total)
  const total = Math.max(a, l + e, 1)

  return (
    <>
      <PageHeader title="Balance Sheet" subtitle={`A photo of the company today: what we own, and who paid for it.`} />

      <Lesson step="Step 6 · Accounting" title="Own = Owe + Owners">
        <p>The left side lists everything the company <b>owns</b> (assets). The right side shows where the money for those assets came from: <b>debts</b> to others (liabilities) and the <b>owners' share</b> (equity, including profit or loss so far).</p>
        <p>The two sides are always equal. If they weren't, an entry somewhere would be unbalanced.</p>
      </Lesson>

      <Card className="mb-4">
        <div className="mb-2 flex justify-between text-[13px] text-label-2"><span>What we own</span><span>Who paid for it</span></div>
        <div className="grid grid-cols-2 gap-3">
          <motion.div initial={{ height: 0 }} animate={{ height: 140 * (a / total) + 40 }} className="grid place-items-center rounded-xl bg-blue/20 text-center">
            <div><div className="text-[13px] text-blue">Assets</div><div className="text-[20px] font-bold text-blue tnum">{money(a)}</div></div>
          </motion.div>
          <div className="flex flex-col gap-1.5">
            <motion.div initial={{ height: 0 }} animate={{ height: Math.max(140 * (l / total), 36) }} className="grid place-items-center rounded-xl bg-orange/20 text-center">
              <div><div className="text-[12px] text-orange">Liabilities (we owe)</div><div className="font-bold text-orange tnum">{money(l)}</div></div>
            </motion.div>
            <motion.div initial={{ height: 0 }} animate={{ height: Math.max(140 * (Math.abs(e) / total), 36) }} className="grid place-items-center rounded-xl bg-purple/20 text-center">
              <div><div className="text-[12px] text-purple">Equity (owners)</div><div className="font-bold text-purple tnum">{money(e)}</div></div>
            </motion.div>
          </div>
        </div>
        <p className={cx('mt-3 text-center text-[14px] font-medium', data.balanced ? 'text-green' : 'text-red')}>
          {money(a)} = {money(l)} + {money(e)} {data.balanced ? '✓ balanced' : '✗ not balanced'}
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <Block title="Assets" hint="What the company owns, or is owed" section={data.assets} tone="text-blue" />
        </Card>
        <Card>
          <Block title="Liabilities" hint="What the company owes to others" section={data.liabilities} tone="text-orange" />
          <Block title="Equity" hint="The owners' share: money they put in, plus profit (or minus loss)" section={data.equity} tone="text-purple" />
        </Card>
      </div>
    </>
  )
}
