import { ChevronRight, Factory, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { MoState } from '../components/status'
import { Button, Empty, ErrorBox, Lesson, PageHeader, Spinner } from '../components/ui'
import { date, money, num, qty } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { ManufacturingOrder } from '../lib/types'

export default function ManufacturingOrders() {
  const { data, error, loading } = useFetch<ManufacturingOrder[]>('/manufacturing-orders/')
  const navigate = useNavigate()

  return (
    <>
      <PageHeader title="Manufacturing Orders" subtitle="Turning components into finished products." actions={<Button icon={<Plus className="size-4" />} onClick={() => navigate('/boms')}>New (from a BoM)</Button>} />

      <Lesson step="Step 7 · Manufacturing" title="What a manufacturing order does">
        <p>A <b>manufacturing order (MO)</b> says "make 2 Oak Desks using the BoM". When you click <b>Produce</b>, the components <b>leave</b> stock and the finished desks <b>enter</b> stock.</p>
        <p>In accounting, value just moves inside the Inventory account: components out, finished goods in. Nothing is earned or spent until the desks are sold.</p>
      </Lesson>

      {error && <ErrorBox message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty icon={<Factory className="size-6" />} title="No manufacturing orders" hint="Open a bill of materials and click Produce." />
      ) : (
        <div className="card divide-y divide-line/60">
          {data.map((m) => (
            <Link key={m.id} to={`/manufacturing/${m.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03]">
              <span className="w-32 font-medium tnum">{m.name}</span>
              <span className="min-w-0 flex-1 truncate">{qty(m.quantity)} × {m.product_name}</span>
              <span className="hidden w-40 truncate text-[13px] text-label-2 md:block">{m.origin}</span>
              <span className="w-28 text-[13px] text-label-2">{date(m.date_done ?? m.date_planned)}</span>
              <span className="w-24 text-right text-[13px] tnum text-label-2">{num(m.unit_cost) ? `${money(m.unit_cost)}/u` : ''}</span>
              <MoState mo={m} />
              <ChevronRight className="size-4 text-label-3" />
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
