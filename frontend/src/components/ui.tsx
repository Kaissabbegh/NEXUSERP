import { AnimatePresence, motion } from 'framer-motion'
import { GraduationCap, Loader2, X } from 'lucide-react'
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from '../lib/format'

/* ---------- Buttons ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'

const variants: Record<Variant, string> = {
  primary: 'bg-blue text-white hover:brightness-110',
  secondary: 'bg-surface-2 text-label hover:bg-surface-3',
  ghost: 'text-blue hover:bg-blue/10',
  danger: 'bg-red/15 text-red hover:bg-red/25',
  success: 'bg-green text-black hover:brightness-110',
}

export function Button({
  variant = 'primary',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

/* ---------- Layout primitives ---------- */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-bold leading-tight tracking-[-0.022em]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-label-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ className, children, title, action }: { className?: string; children: ReactNode; title?: string; action?: ReactNode }) {
  return (
    <section className={cx('card p-5', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/* ---------- Status pills ---------- */

export type Tone = 'gray' | 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'teal' | 'yellow'

const tones: Record<Tone, string> = {
  gray: 'bg-white/10 text-label-2',
  blue: 'bg-blue/15 text-blue',
  green: 'bg-green/15 text-green',
  orange: 'bg-orange/15 text-orange',
  red: 'bg-red/15 text-red',
  purple: 'bg-purple/15 text-purple',
  teal: 'bg-teal/15 text-teal',
  yellow: 'bg-yellow/15 text-yellow',
}

export function Pill({ tone = 'gray', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium', tones[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/* ---------- Segmented control (iOS-style) ---------- */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="relative inline-flex rounded-[10px] bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx('relative z-10 rounded-[8px] px-3.5 py-1 text-[13px] font-medium transition', value === o.value ? 'text-label' : 'text-label-2 hover:text-label')}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${options.map((x) => x.value).join()}`} className="absolute inset-0 -z-10 rounded-[8px] bg-surface-3 shadow" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />
          )}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Sheet (slide-over panel) ---------- */

export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className={cx('glass absolute right-0 top-0 flex h-full w-full flex-col border-l border-white/10', wide ? 'max-w-3xl' : 'max-w-lg')}
          >
            <header className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-[19px] font-semibold">{title}</h2>
              <button onClick={onClose} className="rounded-full bg-surface-2 p-1.5 text-label-2 transition hover:text-label" aria-label="Close">
                <X className="size-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}

/* ---------- Lesson callout: ties each screen back to the ERP lessons ---------- */

export function Lesson({ step, title, children }: { step: string; title: string; children: ReactNode }) {
  const key = `nexus.lesson.${title}`
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== 'closed'
    } catch {
      return true
    }
  })
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(key, o ? 'closed' : 'open')
      } catch {
        /* ignore */
      }
      return !o
    })
  }
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-purple/25 bg-gradient-to-br from-purple/[0.12] to-blue/[0.06]">
      <button onClick={toggle} className="flex w-full items-center gap-3 px-5 py-3.5 text-left">
        <span className="grid size-8 place-items-center rounded-full bg-purple/20 text-purple">
          <GraduationCap className="size-4" />
        </span>
        <span className="flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-purple">{step}</span>
          <span className="block text-[15px] font-semibold">{title}</span>
        </span>
        <span className="text-[13px] text-label-2">{open ? 'Hide' : 'Show'}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
            <div className="space-y-2 px-5 pb-5 pl-16 text-[14px] leading-relaxed text-label-2 [&_b]:font-semibold [&_b]:text-label">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------- Feedback ---------- */

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cx('grid place-items-center py-20 text-label-3', className)}>
      <Loader2 className="size-6 animate-spin" />
    </div>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-xl border border-red/30 bg-red/10 px-4 py-3 text-[14px] text-red">{message}</div>
}

export function Empty({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-surface-2 text-label-3">{icon}</div>
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-[14px] text-label-2">{hint}</p>}
    </div>
  )
}

/* ---------- Form fields ---------- */

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-label-3">{hint}</span>}
    </label>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[15px]">
      {label}
      <span className={cx('relative h-[26px] w-[44px] rounded-full transition', checked ? 'bg-green' : 'bg-surface-3')}>
        <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} className={cx('absolute top-[2px] size-[22px] rounded-full bg-white shadow', checked ? 'right-[2px]' : 'left-[2px]')} />
      </span>
    </button>
  )
}
