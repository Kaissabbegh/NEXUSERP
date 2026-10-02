import { Plus, Receipt } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAction } from '../components/toast'
import { Button, Empty, ErrorBox, Field, Lesson, PageHeader, Pill, Sheet, Spinner, type Tone } from '../components/ui'
import { post } from '../lib/api'
import { cx, date, money } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Account, Employee, ExpenseClaim } from '../lib/types'

const tone: Record<ExpenseClaim['state'], Tone> = { submitted: 'blue', approved: 'yellow', paid: 'green', refused: 'red' }

export default function Expenses() {
  const { data, error, loading, reload } = useFetch<ExpenseClaim[]>('/expenses/')
  const employees = useFetch<Employee[]>('/employees/').data ?? []
  const accounts = (useFetch<Account[]>('/accounts/').data ?? []).filter((a) => a.code.startsWith('6'))
  const [params, setParams] = useSearchParams()
  const highlight = Number(params.get('open')) || null
  const [creating, setCreating] = useState<Partial<ExpenseClaim> | null>(null)
  const { run, busy } = useAction()

  const act = async (c: ExpenseClaim, path: string, msg: string) => {
    if (await run(`${c.id}${path}`, () => post(`/expenses/${c.id}/${path}/`), msg)) reload()
  }
  const create = async () => {
    if (await run('create', () => post('/expenses/', creating), 'Claim submitted')) {
      setCreating(null)
      reload()
    }
  }

  return (
    <>
      <PageHeader title="Expense Claims" subtitle="Employees paid for something with their own money and get it back."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setCreating({ employee: employees[0]?.id, description: '', account: accounts.find((a) => a.code === '640000')?.id, amount: '' })}>New Claim</Button>} />

      <Lesson step="Chapter 8 · Expenses" title="Submit → Approve → Reimburse">
        <p>An employee <b>submits</b> a receipt. When the manager <b>approves</b>, the cost is recorded (an expense) and the company <b>owes the employee</b>. <b>Reimbursing</b> pays that debt from the bank.</p>
      </Lesson>

      {error && <ErrorBox message={error} />}
      {loading && !data ? <Spinner /> : !data?.length ? <Empty icon={<Receipt className="size-6" />} title="No claims" /> : (
        <div className="card divide-y divide-line/60">
          {data.map((c) => (
            <div key={c.id} className={cx('flex flex-wrap items-center gap-3 px-4 py-3', highlight === c.id && 'bg-blue/[0.08]')} onClick={() => highlight === c.id && setParams({})}>
              <div className="min-w-[200px] flex-1">
                <div className="font-medium">{c.description}</div>
                <div className="text-[13px] text-label-2">{c.employee_name} · {c.account_name} · {date(c.date)}</div>
              </div>
              <span className="w-24 text-right font-semibold tnum">{money(c.amount)}</span>
              <Pill tone={tone[c.state]} dot>{c.state_display}</Pill>
              <div className="flex gap-2">
                {c.state === 'submitted' && (
                  <>
                    <Button className="!h-8" loading={busy === `${c.id}approve`} onClick={() => act(c, 'approve', 'Approved and posted')}>Approve</Button>
                    <Button className="!h-8" variant="danger" loading={busy === `${c.id}refuse`} onClick={() => act(c, 'refuse', 'Refused')}>Refuse</Button>
                  </>
                )}
                {c.state === 'approved' && <Button className="!h-8" variant="success" loading={busy === `${c.id}reimburse`} onClick={() => act(c, 'reimburse', 'Employee reimbursed')}>Reimburse</Button>}
                {c.move && <Link to={`/entries/${c.move}`}><Button className="!h-8" variant="ghost">Entry</Button></Link>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!creating} onClose={() => setCreating(null)} title="New Expense Claim"
        footer={<><Button variant="secondary" onClick={() => setCreating(null)}>Cancel</Button><Button loading={busy === 'create'} disabled={!creating?.description || !creating.amount} onClick={create}>Submit</Button></>}>
        {creating && (
          <div className="space-y-4">
            <Field label="Employee">
              <select className="field" value={creating.employee} onChange={(e) => setCreating({ ...creating, employee: Number(e.target.value) })}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="What was it for?"><input className="field" value={creating.description} onChange={(e) => setCreating({ ...creating, description: e.target.value })} autoFocus /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category (expense account)">
                <select className="field" value={creating.account} onChange={(e) => setCreating({ ...creating, account: Number(e.target.value) })}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                </select>
              </Field>
              <Field label="Amount"><input className="field tnum" type="number" min={0} step="0.01" value={creating.amount} onChange={(e) => setCreating({ ...creating, amount: e.target.value })} /></Field>
            </div>
          </div>
        )}
      </Sheet>
    </>
  )
}
