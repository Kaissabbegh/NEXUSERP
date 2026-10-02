import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, Ban, Check, FileText, Info, Lightbulb, Loader2, Package, Pause, Play, RotateCcw, SkipForward,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { JournalEntry } from '../components/JournalEntry'
import { ACTOR_ICONS, SCENARIO_COLORS, SCENARIO_ICONS } from '../components/scenarioIcons'
import { Button, Card, ErrorBox, Pill, Segmented, Spinner } from '../components/ui'
import { post } from '../lib/api'
import { cx, money, num, qty } from '../lib/format'
import type { Bucket, ScenarioMeta, ScenarioStepResult } from '../lib/types'

type Speed = '1' | '2'

const DOT: Record<string, string> = { asset: 'bg-blue', liability: 'bg-orange', equity: 'bg-purple', income: 'bg-green', expense: 'bg-red' }

/** Number that glides to its new value. */
function AnimatedMoney({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min((t - start) / 700, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(a + (value - a) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{money(shown)}</>
}

function Buckets({ now, before }: { now: Bucket[]; before: Bucket[] | null }) {
  const prev = Object.fromEntries((before ?? now).map((b) => [b.code, num(b.amount)]))
  return (
    <ul className="space-y-1.5">
      {now.map((b) => {
        const delta = num(b.amount) - (prev[b.code] ?? 0)
        const moved = Math.abs(delta) >= 0.005
        return (
          <motion.li key={b.code} layout animate={{ backgroundColor: moved ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0)' }}
            className={cx('flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px]', b.code === 'profit' && 'mt-2 border-t border-line pt-3')}>
            <span className={cx('size-2 shrink-0 rounded-full', DOT[b.group])} />
            <span className={cx('min-w-0 flex-1 truncate', moved ? 'text-label' : 'text-label-2', b.code === 'profit' && 'font-semibold')}>{b.label}</span>
            <AnimatePresence>
              {moved && (
                <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className={cx('rounded-full px-1.5 py-0.5 text-[11px] font-semibold tnum', delta > 0 ? 'bg-green/15 text-green' : 'bg-red/15 text-red')}>
                  {delta > 0 ? '+' : '−'}{money(Math.abs(delta)).replace('-', '')}
                </motion.span>
              )}
            </AnimatePresence>
            <span className={cx('w-24 text-right font-medium tnum', !moved && 'text-label-2')}><AnimatedMoney value={num(b.amount)} /></span>
          </motion.li>
        )
      })}
    </ul>
  )
}

export default function ScenarioPlayer() {
  const { key } = useParams()
  const [meta, setMeta] = useState<ScenarioMeta | null>(null)
  const [runId, setRunId] = useState<number | null>(null)
  const [startBalances, setStartBalances] = useState<Bucket[] | null>(null)
  const [results, setResults] = useState<ScenarioStepResult[]>([])
  const [viewing, setViewing] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<Speed>('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const started = useRef(false)

  const finished = results.at(-1)?.finished ?? false

  const start = useCallback(async () => {
    setError(null)
    setResults([])
    setViewing(0)
    setPlaying(true)
    try {
      const r = await post<{ run: number; scenario: ScenarioMeta; balances: Bucket[] }>(`/scenarios/${key}/start/`)
      setMeta(r.scenario)
      setStartBalances(r.balances)
      setRunId(r.run)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [key])

  const next = useCallback(async () => {
    if (!runId || busy || finished) return
    setBusy(true)
    try {
      const r = await post<ScenarioStepResult>(`/scenario-runs/${runId}/next/`)
      setResults((rs) => [...rs, r])
    } catch (e) {
      setError((e as Error).message)
      setPlaying(false)
    } finally {
      setBusy(false)
    }
  }, [runId, busy, finished])

  // Always show the newest step when one arrives.
  useEffect(() => {
    if (results.length) setViewing(results.length - 1)
  }, [results.length])

  // Start once when the page opens (refs survive StrictMode's double effect).
  useEffect(() => {
    if (started.current) return
    started.current = true
    start()
  }, [start])

  // Run the first step as soon as the run exists.
  useEffect(() => {
    if (runId && results.length === 0) next()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  // Auto-play: give the reader time proportional to the text, then run the next step.
  const current = results[viewing]
  const onLatest = viewing === results.length - 1
  useEffect(() => {
    setProgress(0)
    if (!playing || busy || finished || !onLatest || !current) return
    const words = `${current.explanation} ${current.takeaway}`.split(/\s+/).length
    const total = Math.max(5500, words * 220) / Number(speed)
    const began = performance.now()
    const id = setInterval(() => {
      const p = (performance.now() - began) / total
      setProgress(Math.min(p, 1))
      if (p >= 1) {
        clearInterval(id)
        next()
      }
    }, 80)
    return () => clearInterval(id)
  }, [playing, busy, finished, onLatest, current, speed, next])

  if (error && !meta) return <ErrorBox message={error} />
  if (!meta) return <Spinner />

  const Icon = SCENARIO_ICONS[meta.icon] ?? Play
  const c = SCENARIO_COLORS[meta.color] ?? SCENARIO_COLORS.blue
  const ActorIcon = current ? ACTOR_ICONS[current.actor] ?? FileText : FileText
  const before = viewing === 0 ? startBalances : results[viewing - 1]?.balances ?? null

  return (
    <>
      <Link to="/scenarios" className="mb-3 inline-flex items-center gap-1 text-[14px] text-blue"><ArrowLeft className="size-4" /> All scenarios</Link>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <span className={cx('grid size-14 place-items-center rounded-2xl', c.bg, c.text)}><Icon className="size-7" /></span>
        <div className="min-w-0 flex-1">
          <div className={cx('text-[12px] font-semibold uppercase tracking-wider', c.text)}>{meta.lesson}</div>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.022em]">{meta.title}</h1>
          <p className="text-[14px] text-label-2">{meta.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!finished && (
            <Button variant="secondary" icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={() => setPlaying((p) => !p)}>
              {playing ? 'Pause' : 'Auto-play'}
            </Button>
          )}
          {!finished && <Button variant="secondary" icon={busy ? <Loader2 className="size-4 animate-spin" /> : <SkipForward className="size-4" />} disabled={busy} onClick={() => { setViewing(results.length - 1); next() }}>Next step</Button>}
          {finished && <Button icon={<RotateCcw className="size-4" />} onClick={start}>Play again</Button>}
          <Segmented<Speed> value={speed} onChange={setSpeed} options={[{ value: '1', label: '1×' }, { value: '2', label: '2×' }]} />
        </div>
      </div>

      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_1fr_300px]">
        {/* Timeline */}
        <Card className="h-fit !p-3">
          <ol className="space-y-1">
            {meta.steps.map((s, i) => {
              const r = results[i]
              const isRunning = busy && i === results.length
              const StepActor = ACTOR_ICONS[s.actor] ?? FileText
              return (
                <li key={i}>
                  <button disabled={!r} onClick={() => { setViewing(i); setPlaying(false) }}
                    className={cx('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition', viewing === i && r ? 'bg-white/10' : r && 'hover:bg-white/5', !r && 'opacity-50')}>
                    <span className={cx('grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold',
                      r?.outcome === 'blocked' ? 'bg-red text-white' : r ? 'bg-green text-black' : isRunning ? cx(c.solid, 'text-white') : 'bg-surface-3 text-label-2')}>
                      {isRunning ? <Loader2 className="size-3.5 animate-spin" /> : r?.outcome === 'blocked' ? <Ban className="size-3.5" /> : r ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{s.title}</span>
                      <span className="flex items-center gap-1 text-[11px] text-label-3"><StepActor className="size-3" />{s.actor}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </Card>

        {/* Current step */}
        <div className="min-w-0 space-y-4">
          <AnimatePresence mode="wait">
            {!current ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="card grid place-items-center p-16 text-label-2">
                <Loader2 className="mb-3 size-6 animate-spin" />Setting the scene…
              </motion.div>
            ) : (
              <motion.div key={viewing} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }} className="space-y-4">
                <Card className={cx(current.outcome === 'blocked' && 'border-red/40')}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Pill tone="gray">Step {current.index + 1} of {meta.steps.length}</Pill>
                    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium', c.bg, c.text)}>
                      <ActorIcon className="size-3.5" />{current.actor}
                    </span>
                    {current.outcome === 'blocked' && <Pill tone="red"><Ban className="size-3" /> Blocked by the ERP</Pill>}
                  </div>
                  <h2 className="text-[22px] font-semibold tracking-[-0.015em]">{current.title}</h2>
                  <p className="mt-3 text-[16px] leading-relaxed text-label">{current.explanation}</p>
                  {current.takeaway && (
                    <div className="mt-4 flex gap-2.5 rounded-xl bg-purple/10 px-4 py-3 text-[14px] text-purple">
                      <Lightbulb className="mt-0.5 size-4 shrink-0" /><span>{current.takeaway}</span>
                    </div>
                  )}
                  {current.note && (
                    <div className="mt-3 flex gap-2.5 rounded-xl bg-white/5 px-4 py-2.5 text-[13px] text-label-2">
                      <Info className="mt-0.5 size-4 shrink-0" /><span>{current.note}</span>
                    </div>
                  )}
                  {current.documents.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {current.documents.map((d) => (
                        <Link key={`${d.kind}${d.label}`} to={d.url} className="inline-flex items-center gap-1.5 rounded-full bg-blue/10 px-3 py-1 text-[13px] text-blue transition hover:bg-blue/20">
                          {d.label} <ArrowRight className="size-3.5" />
                        </Link>
                      ))}
                    </div>
                  )}
                  {onLatest && playing && !finished && (
                    <div className="mt-5 h-1 overflow-hidden rounded-full bg-surface-3">
                      <div className={cx('h-full rounded-full', c.solid)} style={{ width: `${progress * 100}%` }} />
                    </div>
                  )}
                </Card>

                {current.stock.length > 0 && (
                  <Card title="Stock changes">
                    <ul className="space-y-2">
                      {current.stock.map((s) => {
                        const d = num(s.after) - num(s.before)
                        return (
                          <li key={s.sku} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-[14px]">
                            <Package className="size-4 shrink-0 text-label-3" />
                            <span className="min-w-0 flex-1 truncate">{s.name}</span>
                            <span className="text-label-2 tnum">{qty(s.before)}</span>
                            <ArrowRight className="size-3.5 text-label-3" />
                            <span className="font-semibold tnum">{qty(s.after)}</span>
                            <span className={cx('w-12 text-right font-semibold tnum', d > 0 ? 'text-green' : 'text-red')}>{d > 0 ? '+' : '−'}{qty(Math.abs(d))}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </Card>
                )}

                {current.entries.length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="text-[15px] font-semibold">Journal {current.entries.length > 1 ? 'entries' : 'entry'} created automatically</h3>
                    {current.entries.map((e) => <JournalEntry key={e.id} move={e} compact />)}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-line px-4 py-3 text-[14px] text-label-2">No journal entry in this step: nothing happened to the money yet.</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {finished && onLatest && (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="card flex flex-wrap items-center gap-4 border-green/30 p-5">
              <span className="grid size-11 place-items-center rounded-full bg-green text-black"><Check className="size-5" strokeWidth={3} /></span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">Scenario complete</div>
                <div className="text-[14px] text-label-2">Every document above is real: open them, or try another scenario.</div>
              </div>
              <Link to="/scenarios"><Button variant="secondary">Other scenarios</Button></Link>
              <Button icon={<RotateCcw className="size-4" />} onClick={start}>Play again</Button>
            </motion.div>
          )}
        </div>

        {/* Money buckets */}
        <Card className="h-fit xl:sticky xl:top-6" title="Money buckets">
          <p className="-mt-2 mb-3 text-[12px] text-label-3">Live balances. Badges show what this step changed.</p>
          {current ? <Buckets now={current.balances} before={before} /> : startBalances && <Buckets now={startBalances} before={null} />}
        </Card>
      </div>
    </>
  )
}
