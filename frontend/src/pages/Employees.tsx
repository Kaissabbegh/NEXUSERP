import { Plus, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useAction } from '../components/toast'
import { Button, Card, ErrorBox, Field, Lesson, PageHeader, Sheet, Spinner } from '../components/ui'
import { patch, post } from '../lib/api'
import { date, money, num } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Department, Employee } from '../lib/types'

export default function Employees() {
  const { data, error, loading, reload } = useFetch<Employee[]>('/employees/')
  const departments = useFetch<Department[]>('/departments/').data ?? []
  const [editing, setEditing] = useState<Partial<Employee> | null>(null)
  const { run, busy } = useAction()

  const save = async () => {
    if (!editing) return
    const ok = await run('save', () => (editing.id ? patch(`/employees/${editing.id}/`, editing) : post('/employees/', editing)), 'Employee saved')
    if (ok) {
      setEditing(null)
      reload()
    }
  }

  const active = (data ?? []).filter((e) => e.active)
  const monthly = active.reduce((s, e) => s + num(e.wage) + num(e.preview.employer_social), 0)

  return (
    <>
      <PageHeader title="Employees" subtitle={<>{active.length} people · monthly cost to the company <b className="text-label tnum">{money(monthly)}</b></>}
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing({ name: '', job_title: '', department: departments[0]?.id, wage: '2000', email: '', active: true })}>New Employee</Button>} />

      <Lesson step="Chapter 8 · HR" title="Employees are master data for HR">
        <p>Each employee record holds the <b>job</b>, <b>department</b>, <b>hire date</b> and <b>contract wage</b>. Payroll reads it every month, exactly as Sales reads a product's price.</p>
        <p>The card shows each person's monthly <b>gross</b> (contract), <b>net</b> (what they receive) and the <b>total cost</b> for the company (gross + employer charges).</p>
      </Lesson>

      {error && <ErrorBox message={error} />}
      {loading && !data ? <Spinner /> : departments.map((d) => {
        const people = (data ?? []).filter((e) => e.department === d.id)
        if (!people.length) return null
        return (
          <div key={d.id} className="mb-5">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-label-3">{d.name} · {people.length}</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {people.map((e) => (
                <button key={e.id} onClick={() => setEditing(e)} className="card p-4 text-left transition hover:bg-surface-2">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-indigo to-purple text-[14px] font-semibold">{e.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{e.name}</span>
                      <span className="block truncate text-[13px] text-label-2">{e.job_title} · since {date(e.hire_date)}</span>
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-[12px]">
                    <div className="rounded-lg bg-white/5 p-2"><dt className="text-label-3">Gross</dt><dd className="font-semibold tnum">{money(e.wage)}</dd></div>
                    <div className="rounded-lg bg-green/10 p-2"><dt className="text-label-3">Net pay</dt><dd className="font-semibold text-green tnum">{money(e.preview.net)}</dd></div>
                    <div className="rounded-lg bg-orange/10 p-2"><dt className="text-label-3">Total cost</dt><dd className="font-semibold text-orange tnum">{money(num(e.wage) + num(e.preview.employer_social))}</dd></div>
                  </dl>
                </button>
              ))}
            </div>
          </div>
        )
      })}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? editing.name ?? '' : 'New Employee'}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button loading={busy === 'save'} disabled={!editing?.name || !editing.job_title} onClick={save}>Save</Button></>}>
        {editing && (
          <div className="space-y-4">
            <Field label="Full name"><input className="field" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Job title"><input className="field" value={editing.job_title} onChange={(e) => setEditing({ ...editing, job_title: e.target.value })} /></Field>
              <Field label="Department">
                <select className="field" value={editing.department} onChange={(e) => setEditing({ ...editing, department: Number(e.target.value) })}>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="Monthly gross wage"><input className="field tnum" type="number" min={0} value={editing.wage} onChange={(e) => setEditing({ ...editing, wage: e.target.value })} /></Field>
              <Field label="Email"><input className="field" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
            </div>
            {editing.preview && (
              <Card className="!bg-surface-2" title="One month of pay">
                <dl className="space-y-1.5 text-[14px]">
                  <div className="flex justify-between"><dt>Gross (contract)</dt><dd className="tnum">{money(editing.preview.gross)}</dd></div>
                  <div className="flex justify-between text-label-2"><dt>− Employee social security (9%)</dt><dd className="tnum">{money(editing.preview.employee_social)}</dd></div>
                  <div className="flex justify-between text-label-2"><dt>− Income tax withheld (10%)</dt><dd className="tnum">{money(editing.preview.income_tax)}</dd></div>
                  <div className="flex justify-between border-t border-line pt-1.5 font-semibold text-green"><dt>= Net pay</dt><dd className="tnum">{money(editing.preview.net)}</dd></div>
                  <div className="flex justify-between pt-2 text-label-2"><dt>+ Employer charges (21%), paid by the company</dt><dd className="tnum">{money(editing.preview.employer_social)}</dd></div>
                  <div className="flex justify-between font-semibold text-orange"><dt>Total cost for the company</dt><dd className="tnum">{money(num(editing.preview.gross) + num(editing.preview.employer_social))}</dd></div>
                </dl>
                <p className="mt-3 flex items-center gap-1.5 text-[12px] text-label-3"><UserRound className="size-3.5" />Simplified rates for learning. Real payroll follows each country's law.</p>
              </Card>
            )}
          </div>
        )}
      </Sheet>
    </>
  )
}
