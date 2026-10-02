import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SCENARIO_COLORS, SCENARIO_ICONS } from '../components/scenarioIcons'
import { ErrorBox, Lesson, PageHeader, Spinner } from '../components/ui'
import { cx } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { ScenarioMeta } from '../lib/types'

export default function Scenarios() {
  const { data, error, loading } = useFetch<ScenarioMeta[]>('/scenarios/')

  return (
    <>
      <PageHeader title="Guided Scenarios" subtitle="Pick a story. The ERP plays it for real, one business event at a time, and explains every step." />

      <Lesson step="How it works" title="Watch the ERP work by itself">
        <p>Each scenario creates <b>real documents</b> in NexusERP (orders, deliveries, invoices, payments…). After every step you'll see <b>who</b> did it, <b>what changed</b> in stock, the <b>journal entry</b> it produced, and how the <b>money buckets</b> moved.</p>
        <p>It plays automatically. You can pause, go step by step, and open any document it created.</p>
      </Lesson>

      {error && <ErrorBox message={error} />}
      {loading && !data ? <Spinner /> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.map((s, i) => {
            const Icon = SCENARIO_ICONS[s.icon] ?? Play
            const c = SCENARIO_COLORS[s.color] ?? SCENARIO_COLORS.blue
            return (
              <motion.div key={s.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <Link to={`/scenarios/${s.key}`} className="card group flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:bg-surface-2">
                  <div className="mb-4 flex items-center gap-3">
                    <span className={cx('grid size-12 place-items-center rounded-[14px]', c.bg, c.text)}><Icon className="size-6" /></span>
                    <div className="min-w-0">
                      <div className={cx('text-[11px] font-semibold uppercase tracking-wider', c.text)}>Scenario {i + 1} · {s.lesson}</div>
                      <h2 className="text-[19px] font-semibold tracking-[-0.01em]">{s.title}</h2>
                    </div>
                  </div>
                  <p className="text-[14px] text-label-2">{s.subtitle}</p>
                  <ol className="mt-4 space-y-1.5">
                    {s.steps.map((st, j) => (
                      <li key={j} className="flex items-center gap-2 text-[13px] text-label-2">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-label">{j + 1}</span>
                        <span className="truncate">{st.title}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-auto pt-5">
                    <span className={cx('inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium text-white transition group-hover:brightness-110', c.solid)}>
                      <Play className="size-4 fill-current" /> Play scenario
                    </span>
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      )}
    </>
  )
}
