import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { groupLabel, groupTone } from '../components/status'
import { Card, ErrorBox, Lesson, PageHeader, Pill, Spinner } from '../components/ui'
import { cx, money, num } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Account, AccountGroup } from '../lib/types'

const ORDER: AccountGroup[] = ['asset', 'liability', 'equity', 'income', 'expense']
const SIGN: Record<AccountGroup, number> = { asset: 1, expense: 1, liability: -1, equity: -1, income: -1 }

export default function Accounts() {
  const { data, error, loading } = useFetch<Account[]>('/accounts/')
  const navigate = useNavigate()
  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!data) return null

  // Natural balance: assets/expenses are debit-normal, the rest credit-normal.
  const totals = Object.fromEntries(ORDER.map((g) => [g, data.filter((a) => a.internal_group === g).reduce((s, a) => s + num(a.balance) * SIGN[g], 0)])) as Record<AccountGroup, number>
  const profit = totals.income - totals.expense

  return (
    <>
      <PageHeader title="Chart of Accounts" subtitle="Every accounting bucket the company uses, with live balances from posted entries." />

      <Lesson step="Step 2 · Master data" title="Reading the chart of accounts">
        <p><b>Assets</b> (what we own) = <b>Liabilities</b> (what we owe) + <b>Equity</b> (owners' share) + <b>Profit</b> (income − expenses). This equation always holds because every entry has equal debits and credits.</p>
        <p>You never post here directly. Invoices, deliveries and payments create the entries automatically, based on the accounts set on products, categories, taxes and contacts.</p>
      </Lesson>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Assets', v: totals.asset, tone: 'text-blue' },
          { label: 'Liabilities', v: totals.liability, tone: 'text-orange' },
          { label: 'Equity', v: totals.equity, tone: 'text-purple' },
          { label: 'Profit (Income − Expenses)', v: profit, tone: 'text-green' },
        ].map((x, i) => (
          <motion.div key={x.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card p-4">
            <div className="text-[12px] text-label-2">{x.label}</div>
            <div className={cx('mt-1 text-[22px] font-semibold tnum', x.tone)}>{money(x.v)}</div>
          </motion.div>
        ))}
      </div>
      <div className="mb-6 rounded-xl bg-surface-2 px-4 py-3 text-center text-[14px] text-label-2">
        <span className="text-blue tnum">{money(totals.asset)}</span> = <span className="text-orange tnum">{money(totals.liability)}</span> + <span className="text-purple tnum">{money(totals.equity)}</span> + <span className="text-green tnum">{money(profit)}</span>
        {Math.abs(totals.asset - totals.liability - totals.equity - profit) < 0.01 && <span className="ml-2 text-green">✓ balanced</span>}
      </div>

      <div className="space-y-4">
        {ORDER.map((g) => (
          <Card key={g} title={groupLabel[g]} action={<span className="text-[15px] font-semibold tnum">{money(totals[g])}</span>}>
            <ul className="-mx-2">
              {data.filter((a) => a.internal_group === g).map((a) => (
                <li key={a.id}>
                  <button onClick={() => navigate(`/entries?account=${a.id}&name=${encodeURIComponent(`${a.code} ${a.name}`)}`)} className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-white/5">
                    <span className="w-16 pt-0.5 text-[13px] text-label-3 tnum">{a.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{a.name}</span>
                        <Pill tone={groupTone[g]}>{a.type_display}</Pill>
                      </span>
                      {a.description && <span className="mt-0.5 block text-[13px] text-label-2">{a.description}</span>}
                    </span>
                    <span className={cx('pt-0.5 font-medium tnum', num(a.balance) === 0 && 'text-label-3')}>{money(num(a.balance) * SIGN[g])}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  )
}
