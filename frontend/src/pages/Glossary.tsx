import { motion } from 'framer-motion'
import { ArrowRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { groupSingular, groupTone } from '../components/status'
import { PageHeader, Pill, Segmented } from '../components/ui'
import { GLOSSARY, type GlossaryArea } from '../lib/glossary'

type Filter = 'All' | GlossaryArea
const AREAS: Filter[] = ['All', 'Basics', 'Sales', 'Purchasing', 'Inventory', 'Manufacturing', 'Accounting']

export default function Glossary() {
  const [q, setQ] = useState('')
  const [area, setArea] = useState<Filter>('All')

  const terms = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return GLOSSARY.filter((t) => (area === 'All' || t.area === area) && (!needle || `${t.term} ${t.meaning} ${t.example ?? ''}`.toLowerCase().includes(needle)))
  }, [q, area])

  return (
    <>
      <PageHeader title="Glossary" subtitle={`${GLOSSARY.length} ERP words in plain English. Click a link to see it live in the app.`} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-3" />
          <input className="field !py-2 pl-9" placeholder="Search a word, e.g. liability" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        <Segmented<Filter> value={area} onChange={setArea} options={AREAS.map((a) => ({ value: a, label: a }))} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {terms.map((t, i) => (
          <motion.div key={t.term} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.02 }} className="card flex flex-col p-4">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h3 className="text-[16px] font-semibold">{t.term}</h3>
              {t.family && <Pill tone={groupTone[t.family]}>{groupSingular[t.family]}</Pill>}
              <span className="ml-auto text-[11px] font-medium uppercase tracking-wider text-label-3">{t.area}</span>
            </div>
            <p className="text-[14px] leading-relaxed text-label-2">{t.meaning}</p>
            {t.example && <p className="mt-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-[13px] text-label-2"><span className="text-label-3">e.g. </span>{t.example}</p>}
            {t.link && (
              <Link to={t.link} className="mt-auto inline-flex items-center gap-1 pt-3 text-[13px] text-blue">
                See it in the app <ArrowRight className="size-3.5" />
              </Link>
            )}
          </motion.div>
        ))}
      </div>
      {terms.length === 0 && <p className="py-16 text-center text-label-2">No word matches “{q}”.</p>}
    </>
  )
}
