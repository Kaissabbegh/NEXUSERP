import { motion } from 'framer-motion'
import { Check, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cx } from '../lib/format'

export type StepState = 'done' | 'current' | 'todo' | 'skipped'

export interface Step {
  key: string
  label: string
  icon: LucideIcon
  state: StepState
  docs: { label: string; to?: string }[]
  caption: string
}

/** Given which steps are complete, the first incomplete one is "current" (unless the document is cancelled). */
export function stepStates(done: boolean[], cancelled: boolean): (i: number) => StepState {
  const firstOpen = cancelled ? -1 : done.findIndex((d) => !d)
  return (i) => (done[i] ? 'done' : i === firstOpen ? 'current' : 'todo')
}

const stateStyle: Record<StepState, string> = {
  done: 'bg-green text-black',
  current: 'bg-blue text-white ring-4 ring-blue/25',
  todo: 'bg-surface-3 text-label-3',
  skipped: 'bg-surface-2 text-label-3',
}

export function FlowDiagram({ steps }: { steps: Step[] }) {
  const cols = ({ 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' } as Record<number, string>)[steps.length] ?? 'sm:grid-cols-5'
  return (
    <div className={cx('relative grid grid-cols-1 gap-4 sm:gap-0', cols)}>
      {steps.map((s, i) => (
        <div key={s.key} className="relative flex items-start gap-3 sm:flex-col sm:items-center sm:text-center">
          {i < steps.length - 1 && (
            <div className="absolute left-[21px] top-11 h-[calc(100%-12px)] w-[2px] bg-surface-3 sm:left-[calc(50%+26px)] sm:top-[21px] sm:h-[2px] sm:w-[calc(100%-52px)]">
              <motion.div
                className="size-full origin-top bg-green sm:origin-left"
                initial={{ scale: 0 }}
                animate={{ scale: s.state === 'done' || s.state === 'skipped' ? (steps[i + 1].state === 'todo' ? 0 : 1) : 0 }}
                transition={{ delay: 0.15 + i * 0.15, duration: 0.4 }}
              />
            </div>
          )}
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.12, type: 'spring', damping: 14 }}
            className={cx('relative z-10 grid size-11 shrink-0 place-items-center rounded-full transition', stateStyle[s.state])}
          >
            {s.state === 'done' ? <Check className="size-5" strokeWidth={3} /> : <s.icon className="size-5" />}
            {s.state === 'current' && <span className="absolute inset-0 animate-ping rounded-full bg-blue/30" />}
          </motion.div>
          <div className="min-w-0 sm:mt-3">
            <div className={cx('text-[14px] font-semibold', s.state === 'todo' && 'text-label-2', s.state === 'skipped' && 'text-label-3 line-through')}>{s.label}</div>
            <div className="mt-0.5 text-[12px] text-label-3">{s.caption}</div>
            <div className="mt-1.5 flex flex-wrap gap-1 sm:justify-center">
              {s.docs.map((d) =>
                d.to ? (
                  <Link key={d.label} to={d.to} className="rounded-md bg-white/5 px-1.5 py-0.5 text-[12px] text-blue tnum hover:bg-white/10">{d.label}</Link>
                ) : (
                  <span key={d.label} className="rounded-md bg-white/5 px-1.5 py-0.5 text-[12px] tnum">{d.label}</span>
                ),
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** "Next step" call-to-action under a flow diagram. */
export function NextStep({ stepLabel, hint, children }: { stepLabel?: string; hint: string; children: React.ReactNode }) {
  return (
    <motion.div layout className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-blue/30 bg-blue/[0.08] p-4">
      <div className="min-w-[200px] flex-1">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-blue">Next step{stepLabel ? ` · ${stepLabel}` : ''}</div>
        <div className="mt-0.5 text-[14px] text-label-2">{hint}</div>
      </div>
      {children}
    </motion.div>
  )
}
