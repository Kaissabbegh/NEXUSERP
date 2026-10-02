import { motion } from 'framer-motion'
import {
  AlertTriangle, ArrowLeft, ArrowRight, Briefcase, Check, CheckCircle2, ClipboardList, Clock, ExternalLink, Gauge, Lightbulb,
  Link2, PlayCircle, Target, Users, XCircle,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { CHAPTER_COLORS, CHAPTER_ICONS } from '../components/academyIcons'
import { Button, Card } from '../components/ui'
import { CHAPTERS, loadProgress, saveProgress, type Chapter, type Quiz } from '../lib/academy'
import { cx } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { ScenarioMeta } from '../lib/types'

function Section({ id, title, icon, children }: { id: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-3 flex items-center gap-2 text-[20px] font-semibold tracking-[-0.01em]">{icon}{title}</h2>
      {children}
    </section>
  )
}

function QuizBlock({ quiz, onPassed }: { quiz: Quiz[]; onPassed: () => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const answered = Object.keys(answers).length
  const score = quiz.filter((q, i) => answers[i] === q.answer).length
  const finished = answered === quiz.length
  useEffect(() => {
    if (finished && score / quiz.length >= 0.7) onPassed()
  }, [finished, score, quiz.length, onPassed])

  return (
    <div className="space-y-4">
      {quiz.map((q, i) => {
        const picked = answers[i]
        return (
          <Card key={i}>
            <div className="mb-3 font-medium"><span className="mr-2 text-label-3 tnum">{i + 1}.</span>{q.q}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {q.options.map((o, j) => {
                const isPicked = picked === j
                const show = picked !== undefined
                return (
                  <button key={j} disabled={show} onClick={() => setAnswers({ ...answers, [i]: j })}
                    className={cx('flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-[14px] transition',
                      !show && 'border-line bg-surface-2 hover:bg-surface-3',
                      show && j === q.answer && 'border-green/50 bg-green/15 text-green',
                      show && isPicked && j !== q.answer && 'border-red/50 bg-red/15 text-red',
                      show && !isPicked && j !== q.answer && 'border-transparent bg-surface-2 text-label-3')}>
                    {show && j === q.answer ? <CheckCircle2 className="size-4 shrink-0" /> : show && isPicked ? <XCircle className="size-4 shrink-0" /> : <span className="size-4 shrink-0 rounded-full border border-label-3" />}
                    {o}
                  </button>
                )
              })}
            </div>
            {picked !== undefined && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-[13px] text-label-2">
                <b className={picked === q.answer ? 'text-green' : 'text-red'}>{picked === q.answer ? 'Correct. ' : 'Not quite. '}</b>{q.why}
              </motion.p>
            )}
          </Card>
        )
      })}
      {finished && (
        <div className={cx('flex flex-wrap items-center gap-3 rounded-2xl p-4', score / quiz.length >= 0.7 ? 'bg-green/15 text-green' : 'bg-orange/15 text-orange')}>
          <span className="text-[17px] font-semibold">Score: {score}/{quiz.length}</span>
          <span className="flex-1 text-[14px]">{score / quiz.length >= 0.7 ? 'Chapter completed.' : 'Re-read the sections above and try again.'}</span>
          <Button variant="secondary" onClick={() => setAnswers({})}>Retry</Button>
        </div>
      )}
    </div>
  )
}

function ProcessFlow({ steps, color }: { steps: NonNullable<Chapter['process']>[number]['steps']; color: string }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <ol className="flex min-w-max gap-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-stretch gap-2">
            <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
              className="w-48 rounded-2xl border border-white/[0.06] bg-surface-2 p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <span className={cx('grid size-6 place-items-center rounded-full text-[11px] font-bold text-black', color)}>{i + 1}</span>
                <span className="text-[14px] font-semibold leading-tight">{s.label}</span>
              </div>
              {s.doc && <div className="mb-1 text-[12px] text-blue">📄 {s.doc}</div>}
              <div className="text-[12px] text-label-3">👤 {s.who}</div>
              <div className="mt-1.5 text-[12px] leading-snug text-label-2">{s.effect}</div>
            </motion.div>
            {i < steps.length - 1 && <ArrowRight className="size-4 shrink-0 self-center text-label-3" />}
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function AcademyChapter() {
  const { slug } = useParams()
  const idx = CHAPTERS.findIndex((c) => c.slug === slug)
  const ch = CHAPTERS[idx]
  const [done, setDone] = useState(loadProgress)
  const scenarios = useFetch<ScenarioMeta[]>('/scenarios/').data ?? []
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [slug])
  if (!ch) return <Navigate to="/academy" replace />

  const c = CHAPTER_COLORS[ch.color]
  const Icon = CHAPTER_ICONS[ch.icon]
  const prev = CHAPTERS[idx - 1]
  const next = CHAPTERS[idx + 1]
  const complete = () => {
    if (done[ch.slug]) return
    const p = { ...done, [ch.slug]: true }
    saveProgress(p)
    setDone(p)
  }

  const toc = [
    ['overview', 'Overview'], ch.roles && ['roles', 'Who does what'], ch.process && ['process', 'Process'], ['concepts', 'Key concepts'],
    ch.accounting && ['accounting', 'Accounting impact'], ch.integrations && ['integrations', 'Integration'], ch.kpis && ['kpis', 'KPIs'],
    ['practices', 'Best practices'], ch.consultant && ['consultant', 'Consultant toolkit'], ['try', 'Try it'], ['quiz', 'Quiz'],
  ].filter(Boolean) as [string, string][]
  const chapterScenarios = (ch.scenarios ?? []).map((k) => scenarios.find((s) => s.key === k)).filter(Boolean) as ScenarioMeta[]

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_220px]">
      <div className="min-w-0 space-y-10">
        <div>
          <Link to="/academy" className="mb-4 inline-flex items-center gap-1 text-[14px] text-blue"><ArrowLeft className="size-4" /> ERP Academy</Link>
          <div className="flex flex-wrap items-start gap-4">
            <span className={cx('grid size-14 shrink-0 place-items-center rounded-2xl', c.bg, c.text)}><Icon className="size-7" /></span>
            <div className="min-w-0 flex-1">
              <div className={cx('text-[12px] font-semibold uppercase tracking-wider', c.text)}>Chapter {ch.number} · {ch.department}</div>
              <h1 className="text-[32px] font-bold leading-tight tracking-[-0.022em]">{ch.title}</h1>
              <p className="mt-1 text-[16px] text-label-2">{ch.summary}</p>
              <div className="mt-2 flex items-center gap-3 text-[13px] text-label-3">
                <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{ch.minutes} min</span>
                {done[ch.slug] && <span className="inline-flex items-center gap-1 text-green"><CheckCircle2 className="size-3.5" />Completed</span>}
              </div>
            </div>
          </div>
        </div>

        <Section id="overview" title="Overview" icon={<Target className={cx('size-5', c.text)} />}>
          <Card className={cx('mb-4 border', c.border)}>
            <div className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-label-3">By the end of this chapter you can</div>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {ch.goals.map((g) => <li key={g} className="flex gap-2 text-[14px]"><Check className={cx('mt-0.5 size-4 shrink-0', c.text)} />{g}</li>)}
            </ul>
          </Card>
          <div className="space-y-3 text-[16px] leading-relaxed text-label">
            {ch.intro.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </Section>

        {ch.roles && (
          <Section id="roles" title="Who does what" icon={<Users className={cx('size-5', c.text)} />}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ch.roles.map((r) => (
                <div key={r.name} className="card p-4"><div className="font-semibold">{r.name}</div><div className="mt-1 text-[14px] text-label-2">{r.does}</div></div>
              ))}
            </div>
          </Section>
        )}

        {ch.process && (
          <Section id="process" title="Process" icon={<ArrowRight className={cx('size-5', c.text)} />}>
            <div className="space-y-5">
              {ch.process.map((p) => (
                <div key={p.title}>
                  <h3 className="mb-2 text-[15px] font-semibold text-label-2">{p.title}</h3>
                  <ProcessFlow steps={p.steps} color={c.solid} />
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section id="concepts" title="Key concepts" icon={<Lightbulb className={cx('size-5', c.text)} />}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {ch.concepts.map((k) => (
              <div key={k.term} className="card p-4"><div className={cx('font-semibold', c.text)}>{k.term}</div><div className="mt-1 text-[14px] leading-relaxed text-label-2">{k.meaning}</div></div>
            ))}
          </div>
        </Section>

        {ch.accounting && (
          <Section id="accounting" title="Accounting impact" icon={<ClipboardList className={cx('size-5', c.text)} />}>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-[14px]">
                <thead className="text-left text-[12px] text-label-3"><tr className="border-b border-line"><th className="px-4 py-3 font-medium">Event</th><th className="px-4 py-3 font-medium">Debit</th><th className="px-4 py-3 font-medium">Credit</th><th className="px-4 py-3 font-medium">Why</th></tr></thead>
                <tbody>
                  {ch.accounting.map((a) => (
                    <tr key={a.event} className="border-b border-line/60 last:border-0 align-top">
                      <td className="px-4 py-3 font-medium">{a.event}</td>
                      <td className="px-4 py-3 text-blue">{a.debit}</td>
                      <td className="px-4 py-3 text-orange">{a.credit}</td>
                      <td className="px-4 py-3 text-label-2">{a.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12px] text-label-3">Debit increases assets & expenses; credit increases liabilities, equity & income. Every entry balances.</p>
          </Section>
        )}

        {ch.integrations && (
          <Section id="integrations" title="Integration with other modules" icon={<Link2 className={cx('size-5', c.text)} />}>
            <ul className="space-y-2">
              {ch.integrations.map((i) => (
                <li key={i.module} className="flex flex-wrap gap-x-3 rounded-xl bg-surface px-4 py-3 text-[14px]"><span className="font-semibold">{i.module}</span><span className="text-label-2">{i.how}</span></li>
              ))}
            </ul>
          </Section>
        )}

        {ch.kpis && (
          <Section id="kpis" title="KPIs to watch" icon={<Gauge className={cx('size-5', c.text)} />}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {ch.kpis.map((k) => (
                <div key={k.name} className="card p-4">
                  <div className="font-semibold">{k.name}</div>
                  <code className="mt-1.5 block rounded-lg bg-white/5 px-2.5 py-1.5 text-[13px] text-teal">{k.formula}</code>
                  <div className="mt-1.5 text-[13px] text-label-2">{k.why}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section id="practices" title="Best practices & common mistakes" icon={<CheckCircle2 className={cx('size-5', c.text)} />}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Card className="border border-green/25">
              <div className="mb-2 flex items-center gap-2 font-semibold text-green"><CheckCircle2 className="size-4" />Do</div>
              <ul className="space-y-2 text-[14px] text-label-2">{ch.bestPractices.map((b) => <li key={b} className="flex gap-2"><span className="text-green">•</span>{b}</li>)}</ul>
            </Card>
            <Card className="border border-red/25">
              <div className="mb-2 flex items-center gap-2 font-semibold text-red"><AlertTriangle className="size-4" />Avoid</div>
              <ul className="space-y-2 text-[14px] text-label-2">{ch.mistakes.map((m) => <li key={m} className="flex gap-2"><span className="text-red">•</span>{m}</li>)}</ul>
            </Card>
          </div>
        </Section>

        {ch.consultant && (
          <Section id="consultant" title="Consultant toolkit" icon={<Briefcase className={cx('size-5', c.text)} />}>
            <p className="mb-3 text-[14px] text-label-2">Use this when you implement this module for a client.</p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {([['Questions to ask the client', ch.consultant.questions], ['Data to collect & migrate', ch.consultant.data], ['What to configure', ch.consultant.configure]] as const).map(([t, items]) => (
                <Card key={t} title={t}><ul className="space-y-2 text-[14px] text-label-2">{items.map((x) => <li key={x} className="flex gap-2"><span className={c.text}>›</span>{x}</li>)}</ul></Card>
              ))}
            </div>
          </Section>
        )}

        <Section id="try" title="Try it in NexusERP" icon={<PlayCircle className={cx('size-5', c.text)} />}>
          {chapterScenarios.length > 0 && (
            <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {chapterScenarios.map((s) => (
                <Link key={s.key} to={`/scenarios/${s.key}`} className="card flex items-center gap-3 p-4 transition hover:bg-surface-2">
                  <span className="grid size-10 place-items-center rounded-full bg-pink text-white"><PlayCircle className="size-5" /></span>
                  <span className="min-w-0 flex-1"><span className="block font-semibold">Scenario: {s.title}</span><span className="block truncate text-[13px] text-label-2">{s.subtitle}</span></span>
                  <ArrowRight className="size-4 text-label-3" />
                </Link>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(ch.tryIt ?? []).map((t) => (
              <Link key={t.to + t.label} to={t.to} className="inline-flex items-center gap-1.5 rounded-full bg-blue/10 px-3.5 py-1.5 text-[14px] text-blue transition hover:bg-blue/20">{t.label}<ExternalLink className="size-3.5" /></Link>
            ))}
          </div>
        </Section>

        <Section id="quiz" title="Check your understanding" icon={<CheckCircle2 className={cx('size-5', c.text)} />}>
          <QuizBlock key={ch.slug} quiz={ch.quiz} onPassed={complete} />
        </Section>

        <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-6">
          {prev ? <Link to={`/academy/${prev.slug}`}><Button variant="secondary" icon={<ArrowLeft className="size-4" />}>{prev.number}. {prev.title}</Button></Link> : <span />}
          {next ? <Link to={`/academy/${next.slug}`}><Button>{next.number}. {next.title} <ArrowRight className="size-4" /></Button></Link>
            : <Link to="/academy"><Button variant="success">Back to the Academy</Button></Link>}
        </div>
      </div>

      {/* Table of contents */}
      <nav className="hidden xl:block">
        <div className="sticky top-8 space-y-1">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-label-3">On this page</div>
          {toc.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="block rounded-lg px-2.5 py-1.5 text-[13px] text-label-2 transition hover:bg-white/5 hover:text-label">{label}</a>
          ))}
          <div className="mt-6 border-t border-line pt-4 text-[12px] text-label-3">
            {CHAPTERS.map((x) => (
              <Link key={x.slug} to={`/academy/${x.slug}`} className={cx('flex items-center gap-2 rounded-lg px-2.5 py-1 transition hover:bg-white/5', x.slug === ch.slug && 'bg-white/10 text-label')}>
                {done[x.slug] ? <CheckCircle2 className="size-3 text-green" /> : <span className="w-3 text-center tnum">{x.number}</span>}
                <span className="truncate">{x.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </div>
  )
}
