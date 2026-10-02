import { motion } from 'framer-motion'
import { Award, BookOpen, CheckCircle2, Clock, Map as MapIcon, PlayCircle, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CHAPTER_COLORS, CHAPTER_ICONS } from '../components/academyIcons'
import { Button, Card } from '../components/ui'
import { CHAPTERS, loadProgress, saveProgress } from '../lib/academy'
import { cx } from '../lib/format'

const DEPARTMENTS = [
  { name: 'Sales & CRM', modules: 'Leads, quotations, orders, returns', chapter: 'crm-sales', color: 'green' },
  { name: 'Purchasing', modules: 'RFQs, purchase orders, vendor bills', chapter: 'purchasing', color: 'orange' },
  { name: 'Inventory', modules: 'Warehouses, transfers, valuation, counts', chapter: 'inventory', color: 'yellow' },
  { name: 'Manufacturing', modules: 'Bills of materials, production', chapter: 'manufacturing', color: 'purple' },
  { name: 'Accounting', modules: 'Journals, VAT, assets, closing', chapter: 'accounting', color: 'blue' },
  { name: 'HR & Payroll', modules: 'Employees, payslips, expenses', chapter: 'hr-payroll', color: 'indigo' },
]

export default function Academy() {
  const [done, setDone] = useState(loadProgress)
  const completed = CHAPTERS.filter((c) => done[c.slug]).length
  const pct = Math.round((completed / CHAPTERS.length) * 100)
  const minutes = CHAPTERS.reduce((s, c) => s + c.minutes, 0)
  const next = CHAPTERS.find((c) => !done[c.slug])
  const R = 34
  const C = 2 * Math.PI * R

  return (
    <>
      {/* Hero */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-purple/25 via-blue/15 to-transparent p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-purple/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-6">
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-purple">
              <BookOpen className="size-3.5" /> ERP Academy
            </div>
            <h1 className="text-[34px] font-bold leading-tight tracking-[-0.025em]">Learn how a complete SME ERP works</h1>
            <p className="mt-2 max-w-2xl text-[16px] text-label-2">
              {CHAPTERS.length} chapters, from “what is an ERP” to running a real implementation project. Each chapter explains the process,
              the documents, the accounting behind it, best practices and consultant tips, then lets you try it live in NexusERP and test yourself.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {next ? (
                <Link to={`/academy/${next.slug}`}><Button icon={<PlayCircle className="size-4" />}>{completed ? 'Continue' : 'Start'}: {next.title}</Button></Link>
              ) : (
                <Button variant="success" icon={<Award className="size-4" />}>Course completed!</Button>
              )}
              <Link to="/scenarios"><Button variant="secondary">Guided scenarios</Button></Link>
              <Link to="/learn"><Button variant="secondary" icon={<MapIcon className="size-4" />}>ERP Map</Button></Link>
            </div>
          </div>
          <div className="relative grid size-28 place-items-center">
            <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
              <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
              <motion.circle cx="40" cy="40" r={R} fill="none" stroke="#bf5af2" strokeWidth="7" strokeLinecap="round"
                strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - pct / 100) }} transition={{ duration: 1 }} />
            </svg>
            <div className="text-center"><div className="text-[24px] font-bold tnum">{pct}%</div><div className="text-[11px] text-label-2">{completed}/{CHAPTERS.length} done</div></div>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [BookOpen, `${CHAPTERS.length} chapters`, 'Every department + implementation'],
          [Clock, `~${Math.round(minutes / 60 * 10) / 10} hours`, 'Self-paced reading'],
          [PlayCircle, '10 scenarios', 'Watch the ERP work by itself'],
          [CheckCircle2, `${CHAPTERS.reduce((s, c) => s + c.quiz.length, 0)} quiz questions`, 'With explanations'],
        ].map(([Icon, title, hint], i) => {
          const I = Icon as typeof BookOpen
          return (
            <div key={i} className="card flex items-center gap-3 p-4">
              <I className="size-5 shrink-0 text-purple" />
              <div><div className="font-semibold">{title as string}</div><div className="text-[12px] text-label-2">{hint as string}</div></div>
            </div>
          )
        })}
      </div>

      {/* The ERP at a glance */}
      <Card className="mb-6" title="The ERP at a glance">
        <p className="mb-4 text-[14px] text-label-2">Six departments around one shared database. Every department’s operations end up in Accounting. Click one to open its chapter.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEPARTMENTS.map((d) => {
            const ch = CHAPTERS.find((c) => c.slug === d.chapter)!
            const Icon = CHAPTER_ICONS[ch.icon]
            const c = CHAPTER_COLORS[d.color]
            return (
              <Link key={d.name} to={`/academy/${d.chapter}`} className={cx('flex items-center gap-3 rounded-2xl border bg-surface-2 p-4 transition hover:bg-surface-3', c.border)}>
                <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl', c.bg, c.text)}><Icon className="size-5" /></span>
                <span className="min-w-0"><span className="block font-semibold">{d.name}</span><span className="block text-[13px] text-label-2">{d.modules}</span></span>
              </Link>
            )
          })}
        </div>
      </Card>

      {/* Learning path */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[20px] font-semibold">Learning path</h2>
        {completed > 0 && (
          <button onClick={() => { saveProgress({}); setDone({}) }} className="inline-flex items-center gap-1 text-[13px] text-label-3 hover:text-label"><RotateCcw className="size-3.5" />Reset progress</button>
        )}
      </div>
      <ol className="space-y-2">
        {CHAPTERS.map((ch, i) => {
          const Icon = CHAPTER_ICONS[ch.icon]
          const c = CHAPTER_COLORS[ch.color]
          const isDone = !!done[ch.slug]
          return (
            <motion.li key={ch.slug} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
              <Link to={`/academy/${ch.slug}`} className="card flex items-center gap-4 p-4 transition hover:bg-surface-2">
                <span className={cx('grid size-10 shrink-0 place-items-center rounded-full text-[14px] font-bold', isDone ? 'bg-green text-black' : cx(c.bg, c.text))}>
                  {isDone ? <CheckCircle2 className="size-5" /> : ch.number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{ch.title}</span>
                    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', c.bg, c.text)}><Icon className="size-3" />{ch.department}</span>
                  </span>
                  <span className="mt-0.5 block text-[13px] text-label-2">{ch.summary}</span>
                </span>
                <span className="hidden shrink-0 text-right text-[12px] text-label-3 sm:block">{ch.minutes} min<br />{ch.quiz.length} questions</span>
              </Link>
            </motion.li>
          )
        })}
      </ol>
    </>
  )
}
