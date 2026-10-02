import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { cx, date, money, num } from '../lib/format'
import type { Move } from '../lib/types'
import { groupSingular, groupTone, MoveState } from './status'
import { Pill } from './ui'

/** A journal entry rendered as a debit/credit table, with a balance check. */
export function JournalEntry({ move, explain, compact }: { move: Move; explain?: string; compact?: boolean }) {
  const lines = move.lines ?? []
  const debit = lines.reduce((s, l) => s + num(l.debit), 0)
  const credit = lines.reduce((s, l) => s + num(l.credit), 0)

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Link to={`/entries/${move.id}`} className="font-semibold tnum hover:text-blue">{move.name}</Link>
          <span className="text-[13px] text-label-3">{move.journal_name} · {date(move.date)}</span>
        </div>
        <MoveState move={move} />
      </div>
      {explain && <p className="border-b border-line bg-white/[0.02] px-4 py-2.5 text-[13px] text-label-2">{explain}</p>}
      <table className="w-full text-[13px]">
        <thead className="text-label-3">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Account</th>
            {!compact && <th className="hidden px-4 py-2 text-left font-medium sm:table-cell">Label</th>}
            <th className="px-4 py-2 text-right font-medium">Debit</th>
            <th className="px-4 py-2 text-right font-medium">Credit</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <motion.tr key={l.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="border-t border-line/60">
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <Pill tone={groupTone[l.account_group]}>{groupSingular[l.account_group]}</Pill>
                  <span className="tnum text-label-2">{l.account_code}</span>
                  <span className={cx(num(l.credit) > 0 && 'pl-4', 'truncate')}>{l.account_name}</span>
                </div>
              </td>
              {!compact && <td className="hidden max-w-[220px] truncate px-4 py-2 text-label-2 sm:table-cell">{l.name}</td>}
              <td className="tnum px-4 py-2 text-right">{num(l.debit) ? money(l.debit) : ''}</td>
              <td className="tnum px-4 py-2 text-right">{num(l.credit) ? money(l.credit) : ''}</td>
            </motion.tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line font-semibold">
            <td className="px-4 py-2" colSpan={compact ? 1 : 2}>
              {Math.abs(debit - credit) < 0.005 ? <span className="text-green">✓ Balanced</span> : <span className="text-red">Unbalanced</span>}
            </td>
            <td className="tnum px-4 py-2 text-right">{money(debit)}</td>
            <td className="tnum px-4 py-2 text-right">{money(credit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
