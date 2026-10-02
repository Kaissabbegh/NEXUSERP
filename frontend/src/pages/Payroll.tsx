import { ChevronRight, Plus, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAction } from '../components/toast'
import { Button, Empty, ErrorBox, Field, Lesson, PageHeader, Pill, Sheet, Spinner, type Tone } from '../components/ui'
import { post } from '../lib/api'
import { money } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { PayrollRun } from '../lib/types'

export const payrollTone: Record<PayrollRun['state'], Tone> = { draft: 'gray', posted: 'blue', paid: 'yellow', done: 'green' }

export default function Payroll() {
  const { data, error, loading } = useFetch<PayrollRun[]>('/payroll-runs/')
  const [month, setMonth] = useState<string | null>(null)
  const { run, busy } = useAction()
  const navigate = useNavigate()

  const create = async () => {
    const r = await run('create', () => post<PayrollRun>('/payroll-runs/', { period: `${month}-01` }), 'Payslips computed')
    if (r) navigate(`/payroll/${r.id}`)
  }

  return (
    <>
      <PageHeader title="Payroll" subtitle="Monthly salaries: from gross pay to net pay and payroll charges."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setMonth(new Date().toISOString().slice(0, 7))}>New Payroll</Button>} />

      <Lesson step="Chapter 8 · Payroll" title="Four steps every month">
        <p><b>1. Compute</b> one payslip per employee (gross → deductions → net). <b>2. Post</b>: the salary cost hits the P&L and three debts appear (employees, social security, tax office). <b>3. Pay salaries</b> to employees. <b>4. Pay the state</b> what was withheld and owed.</p>
      </Lesson>

      {error && <ErrorBox message={error} />}
      {loading && !data ? <Spinner /> : !data?.length ? (
        <Empty icon={<Wallet className="size-6" />} title="No payroll yet" hint="Create one for this month." />
      ) : (
        <div className="card divide-y divide-line/60">
          {data.map((r) => (
            <Link key={r.id} to={`/payroll/${r.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03]">
              <span className="w-40 font-medium tnum">{r.name}</span>
              <span className="flex-1 text-label-2">{new Date(`${r.period}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · {r.payslips.length} payslips</span>
              <span className="w-32 text-right tnum">{money(r.totals.cost)}</span>
              <Pill tone={payrollTone[r.state]} dot>{r.state_display}</Pill>
              <ChevronRight className="size-4 text-label-3" />
            </Link>
          ))}
        </div>
      )}

      <Sheet open={!!month} onClose={() => setMonth(null)} title="New Payroll"
        footer={<><Button variant="secondary" onClick={() => setMonth(null)}>Cancel</Button><Button loading={busy === 'create'} disabled={!month} onClick={create}>Compute Payslips</Button></>}>
        <Field label="Month to pay" hint="One payslip will be computed for every active employee.">
          <input className="field" type="month" value={month ?? ''} onChange={(e) => setMonth(e.target.value)} />
        </Field>
      </Sheet>
    </>
  )
}
