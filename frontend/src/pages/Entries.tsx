import { ChevronRight, FileText, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ManualEntrySheet } from '../components/ManualEntrySheet'
import { MoveState } from '../components/status'
import { Button, Empty, ErrorBox, Lesson, PageHeader, Spinner } from '../components/ui'
import { date, money } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Move } from '../lib/types'

export default function Entries() {
  const [params, setParams] = useSearchParams()
  const account = params.get('account')
  const { data, error, loading } = useFetch<Move[]>(`/moves/?state=posted${account ? `&account=${account}` : ''}`)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  return (
    <>
      <PageHeader title="Journal Entries" subtitle="The general ledger: every posted entry, newest first."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New Entry</Button>} />
      <ManualEntrySheet open={creating} onClose={() => setCreating(false)} onDone={(m) => navigate(`/entries/${m.id}`)} />

      <Lesson step="Step 6 · Accounting" title="Where every module ends up">
        <p>Each line here was created by an operation in another module: <b>INV</b> = customer invoices, <b>STJ</b> = stock valuation from deliveries and adjustments, <b>BILL</b> = vendor bills, <b>BNK</b> = payments. <b>MISC</b> entries are typed by hand for things no module covers, like rent or salaries: try <b>New Entry</b>.</p>
      </Lesson>

      {account && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue/15 py-1 pl-3 pr-1 text-[13px] text-blue">
          Filtered by account {params.get('name')}
          <button onClick={() => setParams({})} className="rounded-full p-1 hover:bg-blue/20" aria-label="Clear filter"><X className="size-3.5" /></button>
        </div>
      )}

      {error && <ErrorBox message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty icon={<FileText className="size-6" />} title="No entries" />
      ) : (
        <div className="card divide-y divide-line/60">
          {data.map((m) => (
            <Link key={m.id} to={m.move_type === 'out_invoice' ? `/invoices/${m.id}` : m.move_type === 'in_invoice' ? `/bills/${m.id}` : `/entries/${m.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03]">
              <span className="w-32 font-medium tnum">{m.name}</span>
              <span className="w-40 text-[13px] text-label-2">{m.journal_name}</span>
              <span className="min-w-0 flex-1 truncate text-[14px]">{m.partner_name ?? ''}{m.ref ? <span className="text-label-3"> · {m.ref}</span> : null}</span>
              <span className="w-28 text-[13px] text-label-2">{date(m.date)}</span>
              <span className="w-28 text-right font-medium tnum">{money(m.amount_total)}</span>
              <MoveState move={m} />
              <ChevronRight className="size-4 text-label-3" />
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
