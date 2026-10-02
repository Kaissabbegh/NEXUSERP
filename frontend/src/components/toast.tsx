import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Toast = { id: number; tone: 'success' | 'error'; message: string }
const ToastContext = createContext<(tone: Toast['tone'], message: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((tone: Toast['tone'], message: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, tone, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              className="glass pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl border border-white/10 px-4 py-3 text-[14px] shadow-2xl"
            >
              {t.tone === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red" />}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

/** Runs an async action, toasts the outcome, returns the result (or undefined on error). */
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setBusy(key)
      try {
        const r = await fn()
        if (success) toast('success', success)
        return r
      } catch (e) {
        toast('error', (e as Error).message)
        return undefined
      } finally {
        setBusy(null)
      }
    },
    [toast],
  )
  return { run, busy }
}
