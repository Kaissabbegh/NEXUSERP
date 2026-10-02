import { Factory, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAction } from '../components/toast'
import { Button, Card, Empty, ErrorBox, Field, Lesson, PageHeader, Sheet, Spinner } from '../components/ui'
import { patch, post } from '../lib/api'
import { money, num, qty } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Bom, BomLine, ManufacturingOrder, Product } from '../lib/types'

type Draft = { id?: number; product: number | ''; quantity: string; code: string; lines: BomLine[] }

export default function Boms() {
  const { data, error, loading, reload } = useFetch<Bom[]>('/boms/')
  const products = (useFetch<Product[]>('/products/').data ?? []).filter((p) => p.product_type === 'storable')
  const [editing, setEditing] = useState<Draft | null>(null)
  const [producing, setProducing] = useState<{ bom: Bom; quantity: string } | null>(null)
  const { run, busy } = useAction()
  const navigate = useNavigate()

  const save = async () => {
    if (!editing) return
    const body = { ...editing, lines: editing.lines.map(({ component, quantity }) => ({ component, quantity })) }
    const ok = await run('save', () => (editing.id ? patch(`/boms/${editing.id}/`, body) : post('/boms/', body)), 'Bill of materials saved')
    if (ok) {
      setEditing(null)
      reload()
    }
  }

  const produce = async () => {
    if (!producing) return
    const mo = await run('mo', () => post<ManufacturingOrder>('/manufacturing-orders/', { bom: producing.bom.id, quantity: producing.quantity }), 'Manufacturing order created')
    if (mo) navigate(`/manufacturing/${mo.id}`)
  }

  const setLine = (i: number, patchLine: Partial<BomLine>) =>
    setEditing((e) => e && { ...e, lines: e.lines.map((l, j) => (j === i ? { ...l, ...patchLine } : l)) })

  const draftCost = editing
    ? editing.lines.reduce((s, l) => s + num(l.quantity) * num(products.find((p) => p.id === l.component)?.cost), 0) / Math.max(num(editing.quantity), 1)
    : 0

  return (
    <>
      <PageHeader
        title="Bills of Materials"
        subtitle="Recipes: which components make a finished product."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing({ product: '', quantity: '1', code: '', lines: [] })}>New BoM</Button>}
      />

      <Lesson step="Step 7 · Manufacturing" title="A BoM is a recipe">
        <p>A <b>Bill of Materials</b> lists the components needed to make one product, like a recipe lists ingredients. An Oak Executive Desk = 1 desktop panel + 1 steel frame + 1 hardware kit.</p>
        <p>The cost of a manufactured product is the sum of its components' costs. Compare it to the sale price to see the margin of making vs. buying.</p>
      </Lesson>

      {error && <ErrorBox message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty icon={<Factory className="size-6" />} title="No bills of materials" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.map((b) => {
            const margin = num(b.product_price) ? ((num(b.product_price) - num(b.component_cost)) / num(b.product_price)) * 100 : null
            return (
              <Card key={b.id} title={b.product_name} action={<span className="text-[12px] text-label-3 tnum">{b.code || b.product_sku}</span>}>
                <ul className="space-y-1.5">
                  {b.lines.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-[14px]">
                      <span className="w-10 text-right font-semibold tnum">{qty(l.quantity)}×</span>
                      <span className="flex-1">{l.component_name}</span>
                      <span className="text-label-2 tnum">{money(num(l.cost) * num(l.quantity))}</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-[13px]">
                  <div className="rounded-lg bg-white/5 p-2"><dt className="text-label-3">Component cost</dt><dd className="font-semibold tnum">{money(b.component_cost)}</dd></div>
                  <div className="rounded-lg bg-white/5 p-2"><dt className="text-label-3">Sale price</dt><dd className="font-semibold tnum">{money(b.product_price)}</dd></div>
                  <div className="rounded-lg bg-green/10 p-2"><dt className="text-label-3">Margin</dt><dd className="font-semibold text-green tnum">{margin === null ? '—' : `${margin.toFixed(0)}%`}</dd></div>
                </dl>
                <div className="mt-4 flex gap-2">
                  <Button onClick={() => setProducing({ bom: b, quantity: '1' })}>Produce</Button>
                  <Button variant="secondary" onClick={() => setEditing({ id: b.id, product: b.product, quantity: String(num(b.quantity)), code: b.code, lines: b.lines })}>Edit</Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Sheet open={!!producing} onClose={() => setProducing(null)} title={`Produce ${producing?.bom.product_name ?? ''}`}
        footer={<><Button variant="secondary" onClick={() => setProducing(null)}>Cancel</Button><Button loading={busy === 'mo'} disabled={!producing || num(producing.quantity) <= 0} onClick={produce}>Create Manufacturing Order</Button></>}>
        {producing && (
          <div className="space-y-4">
            <Field label="Quantity to produce"><input className="field tnum" type="number" min={1} value={producing.quantity} onChange={(e) => setProducing({ ...producing, quantity: e.target.value })} autoFocus /></Field>
            <div className="rounded-xl bg-surface-2 p-4 text-[14px]">
              <div className="mb-2 text-label-2">This will consume:</div>
              <ul className="space-y-1">
                {producing.bom.lines.map((l) => (
                  <li key={l.id} className="flex justify-between"><span>{l.component_name}</span><span className="tnum">{qty(num(l.quantity) * num(producing.quantity) / num(producing.bom.quantity))} {l.uom_name}</span></li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit Bill of Materials' : 'New Bill of Materials'}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button loading={busy === 'save'} disabled={!editing?.product || !editing.lines.length || editing.lines.some((l) => !l.component)} onClick={save}>Save</Button></>}>
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Field label="Finished product">
                <select className="field" value={editing.product} onChange={(e) => setEditing({ ...editing, product: e.target.value ? Number(e.target.value) : '' })}>
                  <option value="">Select…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>)}
                </select>
              </Field>
              <Field label="Produces (qty)"><input className="field tnum" type="number" min={1} value={editing.quantity} onChange={(e) => setEditing({ ...editing, quantity: e.target.value })} /></Field>
            </div>
            <div>
              <span className="label">Components</span>
              <div className="space-y-2">
                {editing.lines.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select className="field flex-1" value={l.component || ''} onChange={(e) => setLine(i, { component: Number(e.target.value) })}>
                      <option value="">Select…</option>
                      {products.filter((p) => p.id !== editing.product).map((p) => <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>)}
                    </select>
                    <input className="field !w-24 tnum" type="number" min={0} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                    <button onClick={() => setEditing({ ...editing, lines: editing.lines.filter((_, j) => j !== i) })} className="grid size-8 place-items-center rounded-full text-label-3 hover:bg-red/15 hover:text-red" aria-label="Remove component">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button variant="ghost" className="mt-2" icon={<Plus className="size-4" />} onClick={() => setEditing({ ...editing, lines: [...editing.lines, { component: 0, quantity: '1' }] })}>Add a component</Button>
            </div>
            <div className="rounded-xl bg-surface-2 px-4 py-3 text-[14px]">Cost per unit from components: <b className="tnum">{money(draftCost)}</b></div>
          </div>
        )}
      </Sheet>
    </>
  )
}
