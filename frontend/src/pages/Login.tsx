import { motion } from 'framer-motion'
import { useState, type FormEvent } from 'react'
import { Button, ErrorBox } from '../components/ui'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('demo')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(username, password)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-gradient-to-br from-blue/30 via-purple/20 to-transparent blur-3xl" />
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto mb-5 size-16 drop-shadow-[0_8px_30px_rgba(10,132,255,0.5)]" />
          <h1 className="text-[28px] font-bold tracking-[-0.022em]">Sign in to NexusERP</h1>
          <p className="mt-1.5 text-[15px] text-label-2">The ERP you learn by using.</p>
        </div>
        <form onSubmit={submit} className="card space-y-3 p-5">
          <input className="field" placeholder="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="field" placeholder="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          {error && <ErrorBox message={error} />}
          <Button type="submit" loading={busy} className="h-11 w-full text-[15px]">
            Continue
          </Button>
        </form>
        <p className="mt-5 text-center text-[13px] text-label-3">Demo credentials are in backend/.env</p>
      </motion.div>
    </div>
  )
}
