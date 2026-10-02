import { Building2, Plus, Search, User, Users } from 'lucide-react'
import { useState } from 'react'
import { Button, Empty, ErrorBox, Field, Lesson, PageHeader, Pill, Segmented, Sheet, Spinner, Toggle } from '../components/ui'
import { useAction } from '../components/toast'
import { patch, post } from '../lib/api'
import { money, num } from '../lib/format'
import { useDebounced, useFetch } from '../lib/hooks'
import type { Partner, PaymentTerm } from '../lib/types'

type Role = 'all' | 'customer' | 'vendor'

const blank: Partial<Partner> = { name: '', is_company: true, is_customer: true, is_vendor: false, email: '', phone: '', street: '', city: '', country: '', vat: '', payment_term: null, credit_limit: '0' }

export default function Contacts() {
  const [role, setRole] = useState<Role>('all')
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const { data, error, loading, reload } = useFetch<Partner[]>(`/partners/?role=${role === 'all' ? '' : role}&search=${encodeURIComponent(q)}`)
  const terms = useFetch<PaymentTerm[]>('/payment-terms/').data ?? []
  const [editing, setEditing] = useState<Partial<Partner> | null>(null)
  const { run, busy } = useAction()

  const save = async () => {
    if (!editing) return
    const body = { ...editing, credit_limit: editing.credit_limit || '0' }
    const ok = await run('save', () => (editing.id ? patch(`/partners/${editing.id}/`, body) : post('/partners/', body)), editing.id ? 'Contact updated' : 'Contact created')
    if (ok) {
      setEditing(null)
      reload()
    }
  }
  const set = <K extends keyof Partner>(k: K, v: Partner[K]) => setEditing((e) => ({ ...e, [k]: v }))

  return (
    <>
      <PageHeader title="Contacts" subtitle="Customers and vendors: master data every document points to." actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing({ ...blank })}>New Contact</Button>} />

      <Lesson step="Step 2 · Master data" title="Why one contact record matters">
        <p>Odoo-style ERPs keep <b>customers and vendors in one list</b>. The same company can be both.</p>
        <p>When you pick a customer on a quotation, the ERP pulls their <b>payment terms</b> (when the invoice is due) and checks their <b>credit limit</b> on confirmation. Try lowering a customer's limit below their open balance, then confirm an order for them.</p>
      </Lesson>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented<Role> value={role} onChange={setRole} options={[{ value: 'all', label: 'All' }, { value: 'customer', label: 'Customers' }, { value: 'vendor', label: 'Vendors' }]} />
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-3" />
          <input className="field !py-2 pl-9" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {error && <ErrorBox message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : data?.length === 0 ? (
        <Empty icon={<Users className="size-6" />} title="No contacts found" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data?.map((p) => (
            <button key={p.id} onClick={() => setEditing(p)} className="card flex items-start gap-3 p-4 text-left transition hover:bg-surface-2">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-surface-3 to-surface-2 text-label-2">
                {p.is_company ? <Building2 className="size-5" /> : <User className="size-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block truncate text-[13px] text-label-2">{[p.city, p.country].filter(Boolean).join(', ') || p.email || '—'}</span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {p.is_customer && <Pill tone="green">Customer</Pill>}
                  {p.is_vendor && <Pill tone="orange">Vendor</Pill>}
                  {p.payment_term_name && <Pill>{p.payment_term_name}</Pill>}
                </span>
              </span>
              {num(p.open_balance) > 0 && (
                <span className="text-right">
                  <span className="block text-[12px] text-label-3">Owes</span>
                  <span className="block text-[14px] font-semibold text-blue tnum">{money(p.open_balance)}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? editing.name || 'Contact' : 'New Contact'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} loading={busy === 'save'} disabled={!editing?.name}>Save</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Name">
              <input className="field" value={editing.name ?? ''} onChange={(e) => set('name', e.target.value)} autoFocus />
            </Field>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Toggle label="Company" checked={!!editing.is_company} onChange={(v) => set('is_company', v)} />
              <Toggle label="Customer" checked={!!editing.is_customer} onChange={(v) => set('is_customer', v)} />
              <Toggle label="Vendor" checked={!!editing.is_vendor} onChange={(v) => set('is_vendor', v)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email"><input className="field" value={editing.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
              <Field label="Phone"><input className="field" value={editing.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
            </div>
            <Field label="Street"><input className="field" value={editing.street ?? ''} onChange={(e) => set('street', e.target.value)} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City"><input className="field" value={editing.city ?? ''} onChange={(e) => set('city', e.target.value)} /></Field>
              <Field label="Country"><input className="field" value={editing.country ?? ''} onChange={(e) => set('country', e.target.value)} /></Field>
            </div>
            <Field label="Tax ID"><input className="field" value={editing.vat ?? ''} onChange={(e) => set('vat', e.target.value)} /></Field>

            <div className="border-t border-line pt-4">
              <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-label-3">Sales & accounting</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Payment terms" hint="Sets the invoice due date.">
                  <select className="field" value={editing.payment_term ?? ''} onChange={(e) => set('payment_term', e.target.value ? Number(e.target.value) : null)}>
                    <option value="">None</option>
                    {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
                <Field label="Credit limit" hint="0 means no limit.">
                  <input className="field tnum" type="number" min={0} value={editing.credit_limit ?? '0'} onChange={(e) => set('credit_limit', e.target.value)} />
                </Field>
              </div>
              {editing.id && (
                <div className="mt-4 rounded-xl bg-surface-2 p-3 text-[14px]">
                  <span className="text-label-2">Open balance: </span>
                  <span className="font-semibold tnum">{money(editing.open_balance)}</span>
                  <span className="text-label-3"> (posted invoices not yet paid, booked on account 121000 Receivable)</span>
                </div>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </>
  )
}
