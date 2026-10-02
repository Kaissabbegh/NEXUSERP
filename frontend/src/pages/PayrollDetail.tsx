import { ArrowLeft, Banknote, Calculator, FileCheck2, Landmark } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { FlowDiagram, NextStep, stepStates, type Step } from '../components/FlowDiagram'
import { useAction } from '../components/toast'
import { Button, Card, ErrorBox, PageHeader, Pill, Spinner } from '../components/ui'
import { post } from '../lib/api'
import { money } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { PayrollRun } from '../lib/types'
import { payrollTone } from './Payroll'

const NEXT: Record<string, { path: string; label: string; hint: string } | undefined> = {
  draft: { path: 'post', label: 'Post Payroll', hint: 'Records the cost (salaries + employer charges) and the three debts it creates.' },
  posted: { path: 'pay-salaries', label: 'Pay Employees', hint: 'Transfers the net salaries from the bank.' },
  paid: { path: 'pay-authorities', label: 'Pay Social Security & Tax', hint: 'Pays the state what was withheld from salaries plus the employer charges.' },
}

export default function PayrollDetail() {
  const { id } = useParams()
  const { data: r, error, loading, reload } = useFetch<PayrollRun>(`/payroll-runs/${id}/`)
  const { run, busy } = useAction()
  if (loading && !r) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!r) return null

  const order = ['draft', 'posted', 'paid', 'done']
  const at = order.indexOf(r.state)
  const state = stepStates([true, at >= 1, at >= 2, at >= 3], false)
  const entry = (mid: number | null, label: string) => (mid ? [{ label, to: `/entries/${mid}` }] : [])
  const steps: Step[] = [
    { key: 'compute', label: 'Payslips computed', icon: Calculator, state: state(0), docs: [{ label: r.name }], caption: `${r.payslips.length} employees` },
    { key: 'post', label: 'Posted', icon: FileCheck2, state: state(1), docs: entry(r.move, 'Payroll entry'), caption: 'Cost recorded' },
    { key: 'pay', label: 'Employees paid', icon: Banknote, state: state(2), docs: entry(r.payment_move, 'Bank entry'), caption: `${money(r.totals.net)} net` },
    { key: 'state', label: 'State paid', icon: Landmark, state: state(3), docs: entry(r.authorities_move, 'Bank entry'), caption: 'Social security & tax' },
  ]
  const next = NEXT[r.state]
  const t = r.totals

  return (
    <>
      <Link to="/payroll" className="mb-3 inline-flex items-center gap-1 text-[14px] text-blue"><ArrowLeft className="size-4" /> Payroll</Link>
      <PageHeader title={r.name} subtitle={<span className="flex items-center gap-2">{new Date(`${r.period}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} <Pill tone={payrollTone[r.state]} dot>{r.state_display}</Pill></span>} />

      <Card className="mb-4">
        <FlowDiagram steps={steps} />
        {next && (
          <NextStep hint={next.hint}>
            <Button loading={busy === 'next'} onClick={async () => { if (await run('next', () => post(`/payroll-runs/${r.id}/${next.path}/`), 'Done')) reload() }}>{next.label}</Button>
          </NextStep>
        )}
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['Gross salaries', t.gross, 'text-label'],
          ['Employee social security', t.employee_social, 'text-label-2'],
          ['Income tax withheld', t.income_tax, 'text-label-2'],
          ['Net paid to employees', t.net, 'text-green'],
          ['Total cost (gross + employer)', t.cost, 'text-orange'],
        ].map(([label, v, tone]) => (
          <div key={label} className="card p-4"><div className="text-[12px] text-label-2">{label}</div><div className={`mt-1 text-[19px] font-semibold tnum ${tone}`}>{money(v)}</div></div>
        ))}
      </div>

      <Card title="Payslips">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead className="text-left text-[12px] text-label-3">
              <tr className="border-b border-line">
                <th className="pb-2 font-medium">Employee</th>
                <th className="pb-2 text-right font-medium">Gross</th>
                <th className="pb-2 text-right font-medium">− Social (9%)</th>
                <th className="pb-2 text-right font-medium">− Tax (10%)</th>
                <th className="pb-2 text-right font-medium">= Net</th>
                <th className="pb-2 text-right font-medium">Employer (21%)</th>
              </tr>
            </thead>
            <tbody>
              {r.payslips.map((s) => (
                <tr key={s.id} className="border-b border-line/60 last:border-0">
                  <td className="py-2.5"><div className="font-medium">{s.employee_name}</div><div className="text-[12px] text-label-3">{s.job_title}</div></td>
                  <td className="py-2.5 text-right tnum">{money(s.gross)}</td>
                  <td className="py-2.5 text-right tnum text-label-2">{money(s.employee_social)}</td>
                  <td className="py-2.5 text-right tnum text-label-2">{money(s.income_tax)}</td>
                  <td className="py-2.5 text-right font-semibold tnum text-green">{money(s.net)}</td>
                  <td className="py-2.5 text-right tnum text-orange">{money(s.employer_social)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
