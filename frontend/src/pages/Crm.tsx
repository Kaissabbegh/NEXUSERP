import { motion } from 'framer-motion'
import { ArrowRight, Building2, Plus, Trophy, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAction } from '../components/toast'
import { Button, Card, ErrorBox, Field, Lesson, PageHeader, Pill, Sheet, Spinner, type Tone } from '../components/ui'
import { post } from '../lib/api'
import { cx, money, num, relative } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Lead, LeadStage } from '../lib/types'

const STAGES: { key: LeadStage; label: string; tone: Tone; hint: string }[] = [
  { key: 'new', label: 'New', tone: 'gray', hint: 'Just arrived, not checked yet' },
  { key: 'qualified', label: 'Qualified', tone: 'blue', hint: 'Budget, need and timing confirmed' },
  { key: 'proposition', label: 'Proposition', tone: 'purple', hint: 'Quotation sent' },
  { key: 'won', label: 'Won', tone: 'green', hint: 'Customer signed' },
  { key: 'lost', label: 'Lost', tone: 'red', hint: 'Not this time' },
]

type Summary = { stages: Record<string, { count: number; revenue: string }>; weighted_pipeline: number; win_rate: number | null }

export default function Crm() {
  const { data, error, loading, reload } = useFetch<Lead[]>('/leads/')
  const summary = useFetch<Summary>('/leads/summary/')
  const [params, setParams] = useSearchParams()
  const openId = Number(params.get('open')) || null
  const open = data?.find((l) => l.id === openId) ?? null
  const [creating, setCreating] = useState<Partial<Lead> | null>(null)
  const [lostReason, setLostReason] = useState('')
  const { run, busy } = useAction()

  const refresh = () => {
    reload()
    summary.reload()
  }
  const act = async (key: string, path: string, msg: string, body: unknown = {}) => {
    if (open && (await run(key, () => post(`/leads/${open.id}/${path}/`, body), msg))) refresh()
  }
  const create = async () => {
    const lead = await run('create', () => post<Lead>('/leads/', creating), 'Lead created')
    if (lead) {
      setCreating(null)
      refresh()
      setParams({ open: String(lead.id) })
    }
  }

  return (
    <>
      <PageHeader title="CRM Pipeline" subtitle="Every possible sale, from first contact to signed order."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setCreating({ name: '', company_name: '', contact_name: '', email: '', source: 'Website', expected_revenue: '0' })}>New Lead</Button>} />

      <Lesson step="Chapter 3 · CRM" title="Leads become opportunities, opportunities become orders">
        <p>A <b>lead</b> is someone who might buy. After a call that confirms <b>budget, authority, need and timing</b> it is <b>qualified</b>. Sending a quotation moves it to <b>proposition</b>. When the customer accepts, the quotation is confirmed and the opportunity is <b>won</b>.</p>
        <p>The <b>weighted pipeline</b> (revenue × probability) is how managers forecast next month's sales.</p>
      </Lesson>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4"><div className="text-[12px] text-label-2">Open opportunities</div><div className="text-[22px] font-semibold tnum">{(data ?? []).filter((l) => ['new', 'qualified', 'proposition'].includes(l.stage)).length}</div></div>
        <div className="card p-4"><div className="text-[12px] text-label-2">Weighted pipeline</div><div className="text-[22px] font-semibold text-purple tnum">{money(summary.data?.weighted_pipeline)}</div></div>
        <div className="card p-4"><div className="text-[12px] text-label-2">Won</div><div className="text-[22px] font-semibold text-green tnum">{money(summary.data?.stages.won?.revenue)}</div></div>
        <div className="card p-4"><div className="text-[12px] text-label-2">Win rate</div><div className="text-[22px] font-semibold tnum">{summary.data?.win_rate ?? '—'}{summary.data?.win_rate != null && '%'}</div></div>
      </div>

      {error && <ErrorBox message={error} />}
      {loading && !data ? <Spinner /> : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="grid min-w-[1000px] grid-cols-5 gap-3">
            {STAGES.map((s) => {
              const leads = (data ?? []).filter((l) => l.stage === s.key)
              return (
                <div key={s.key} className="rounded-2xl bg-surface/60 p-2.5">
                  <div className="mb-2 flex items-center justify-between px-1.5">
                    <Pill tone={s.tone} dot>{s.label}</Pill>
                    <span className="text-[12px] text-label-3 tnum">{leads.length} · {money(leads.reduce((t, l) => t + num(l.expected_revenue), 0))}</span>
                  </div>
                  <p className="mb-2 px-1.5 text-[11px] text-label-3">{s.hint}</p>
                  <div className="space-y-2">
                    {leads.map((l, i) => (
                      <motion.button key={l.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                        onClick={() => setParams({ open: String(l.id) })}
                        className={cx('card block w-full p-3 text-left transition hover:bg-surface-2', openId === l.id && 'ring-2 ring-blue/50')}>
                        <div className="text-[14px] font-medium leading-snug">{l.name}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-[12px] text-label-2"><Building2 className="size-3" />{l.company_name || l.contact_name}</div>
                        <div className="mt-2 flex items-center justify-between text-[12px]">
                          <span className="font-semibold tnum">{money(l.expected_revenue)}</span>
                          <span className="text-label-3 tnum">{l.probability}%</span>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Sheet open={!!open} onClose={() => setParams({})} title={open?.name ?? ''}>
        {open && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={STAGES.find((s) => s.key === open.stage)?.tone} dot>{open.stage_display}</Pill>
              <span className="text-[13px] text-label-2">{open.source} · created {relative(open.created_at)}</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {STAGES.slice(0, 4).map((s, i) => {
                const idx = STAGES.findIndex((x) => x.key === open.stage)
                const reached = open.stage !== 'lost' && idx >= i
                return <div key={s.key} className={cx('rounded-lg px-2 py-1.5 text-[12px]', reached ? 'bg-green/15 text-green' : 'bg-surface-2 text-label-3')}>{s.label}</div>
              })}
            </div>
            <dl className="space-y-2 text-[14px]">
              <div className="flex justify-between"><dt className="text-label-2">Company</dt><dd>{open.company_name || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-label-2">Contact</dt><dd>{open.contact_name || '—'} {open.email && <span className="text-label-3">· {open.email}</span>}</dd></div>
              <div className="flex justify-between"><dt className="text-label-2">Expected revenue</dt><dd className="font-semibold tnum">{money(open.expected_revenue)}</dd></div>
              <div className="flex justify-between"><dt className="text-label-2">Probability → weighted</dt><dd className="tnum">{open.probability}% → {money(open.weighted_revenue)}</dd></div>
              <div className="flex justify-between"><dt className="text-label-2">Customer record</dt><dd>{open.partner_name ? <Link to="/contacts" className="text-blue">{open.partner_name}</Link> : <span className="text-label-3">not yet (still a prospect)</span>}</dd></div>
              {open.sale_order && <div className="flex justify-between"><dt className="text-label-2">Quotation</dt><dd><Link to={`/sales/${open.sale_order}`} className="inline-flex items-center gap-1 text-blue">{open.sale_order_name} <ArrowRight className="size-3.5" /></Link></dd></div>}
              {open.lost_reason && <div className="flex justify-between"><dt className="text-label-2">Lost because</dt><dd className="text-red">{open.lost_reason}</dd></div>}
            </dl>

            {['new', 'qualified', 'proposition'].includes(open.stage) && (
              <Card className="!bg-surface-2">
                <div className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-label-3">Next action</div>
                <div className="flex flex-wrap gap-2">
                  {open.stage === 'new' && <Button loading={busy === 'q'} onClick={() => act('q', 'qualify', 'Lead qualified')}>Qualify</Button>}
                  {!open.sale_order && open.stage !== 'new' && <Button loading={busy === 'quote'} onClick={() => act('quote', 'quotation', 'Quotation created: add products to it')}>Create Quotation</Button>}
                  {open.sale_order && <Link to={`/sales/${open.sale_order}`}><Button variant="secondary">Open quotation</Button></Link>}
                  {open.sale_order && <Button variant="success" icon={<Trophy className="size-4" />} loading={busy === 'won'} onClick={() => act('won', 'won', 'Opportunity won!')}>Mark Won</Button>}
                </div>
                <div className="mt-4 flex gap-2">
                  <input className="field !py-1.5" placeholder="Why was it lost?" value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
                  <Button variant="danger" icon={<XCircle className="size-4" />} loading={busy === 'lost'} onClick={() => act('lost', 'lost', 'Marked as lost', { reason: lostReason })}>Lost</Button>
                </div>
                <p className="mt-3 text-[12px] text-label-3">Marking won confirms the quotation as a sales order, so add the products to the quotation first.</p>
              </Card>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={!!creating} onClose={() => setCreating(null)} title="New Lead"
        footer={<><Button variant="secondary" onClick={() => setCreating(null)}>Cancel</Button><Button loading={busy === 'create'} disabled={!creating?.name} onClick={create}>Create</Button></>}>
        {creating && (
          <div className="space-y-4">
            <Field label="Opportunity" hint="What they need, in a few words."><input className="field" value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} autoFocus /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company"><input className="field" value={creating.company_name} onChange={(e) => setCreating({ ...creating, company_name: e.target.value })} /></Field>
              <Field label="Contact person"><input className="field" value={creating.contact_name} onChange={(e) => setCreating({ ...creating, contact_name: e.target.value })} /></Field>
              <Field label="Email"><input className="field" value={creating.email} onChange={(e) => setCreating({ ...creating, email: e.target.value })} /></Field>
              <Field label="Source"><input className="field" value={creating.source} onChange={(e) => setCreating({ ...creating, source: e.target.value })} /></Field>
            </div>
            <Field label="Expected revenue"><input className="field tnum" type="number" min={0} value={creating.expected_revenue} onChange={(e) => setCreating({ ...creating, expected_revenue: e.target.value })} /></Field>
          </div>
        )}
      </Sheet>
    </>
  )
}
