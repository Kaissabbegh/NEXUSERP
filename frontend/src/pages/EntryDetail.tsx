import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { JournalEntry } from '../components/JournalEntry'
import { ErrorBox, PageHeader, Spinner } from '../components/ui'
import { date } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Move } from '../lib/types'

export default function EntryDetail() {
  const { id } = useParams()
  const { data, error, loading } = useFetch<Move>(`/moves/${id}/`)
  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!data) return null

  return (
    <>
      <Link to="/entries" className="mb-3 inline-flex items-center gap-1 text-[14px] text-blue">
        <ArrowLeft className="size-4" /> Journal Entries
      </Link>
      <PageHeader title={data.name} subtitle={`${data.move_type_display} · ${data.journal_name} · ${date(data.date)}${data.ref ? ` · ref ${data.ref}` : ''}`} />
      <div className="max-w-3xl">
        <JournalEntry move={data} />
        <p className="mt-4 text-[14px] text-label-2">
          Rule of double entry: total debits always equal total credits. <b className="text-label">Debit</b> increases assets and expenses; <b className="text-label">credit</b> increases liabilities, equity and income.
        </p>
        {data.sale_order && <Link to={`/sales/${data.sale_order}`} className="mt-3 inline-block text-[14px] text-blue">Open source order {data.sale_order_name} →</Link>}
      </div>
    </>
  )
}
