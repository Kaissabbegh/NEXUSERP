import { Package, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Button, Empty, ErrorBox, Field, Lesson, PageHeader, Pill, Segmented, Sheet, Spinner, type Tone } from '../components/ui'
import { useAction } from '../components/toast'
import { patch, post } from '../lib/api'
import { cx, money, num, qty } from '../lib/format'
import { useDebounced, useFetch } from '../lib/hooks'
import type { Partner, Product, ProductCategory, ProductType, Tax, Uom } from '../lib/types'

const typeMeta: Record<ProductType, { label: string; tone: Tone; hint: string }> = {
  storable: { label: 'Storable', tone: 'blue', hint: 'Quantity tracked in the warehouse; valued in the Inventory account.' },
  consumable: { label: 'Consumable', tone: 'teal', hint: 'Delivered, but quantity is not tracked precisely (screws, packaging).' },
  service: { label: 'Service', tone: 'purple', hint: 'No stock and no delivery: installation, design hours…' },
}

type Filter = 'all' | ProductType

export default function Products() {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const { data, error, loading, reload } = useFetch<Product[]>(`/products/?type=${filter === 'all' ? '' : filter}&search=${encodeURIComponent(q)}`)
  const categories = useFetch<ProductCategory[]>('/product-categories/').data ?? []
  const allTaxes = useFetch<Tax[]>('/taxes/').data ?? []
  const taxes = allTaxes.filter((t) => t.scope === 'sale')
  const purchaseTaxes = allTaxes.filter((t) => t.scope === 'purchase')
  const vendors = useFetch<Partner[]>('/partners/?role=vendor').data ?? []
  const uoms = useFetch<Uom[]>('/uoms/').data ?? []
  const [editing, setEditing] = useState<Partial<Product> | null>(null)
  const { run, busy } = useAction()

  const set = <K extends keyof Product>(k: K, v: Product[K]) => setEditing((e) => ({ ...e, [k]: v }))
  const category = categories.find((c) => c.id === editing?.category)

  const openNew = () =>
    setEditing({ sku: '', name: '', product_type: 'storable', category: categories[0]?.id, uom: uoms[0]?.id, sale_price: '0', cost: '0', sale_tax: taxes[0]?.id ?? null, purchase_tax: purchaseTaxes[0]?.id ?? null, vendor: null, reorder_min: '0', barcode: '', description: '' })

  const save = async () => {
    if (!editing) return
    const ok = await run('save', () => (editing.id ? patch(`/products/${editing.id}/`, editing) : post('/products/', editing)), editing.id ? 'Product updated' : 'Product created')
    if (ok) {
      setEditing(null)
      reload()
    }
  }

  const margin = editing && num(editing.sale_price) > 0 ? ((num(editing.sale_price) - num(editing.cost)) / num(editing.sale_price)) * 100 : null

  return (
    <>
      <PageHeader title="Products" subtitle="The richest master data: used by sales, inventory and accounting." actions={<Button icon={<Plus className="size-4" />} onClick={openNew}>New Product</Button>} />

      <Lesson step="Step 2 · Master data" title="One product, four departments">
        <p><b>Sales</b> uses the sale price and tax. <b>Inventory</b> uses the type and reorder point. <b>Accounting</b> uses the cost and the <b>category's accounts</b> (revenue, cost of goods sold, stock valuation).</p>
        <p>A wrong cost here makes every margin report and every stock valuation entry wrong. That's why data migration takes so much care.</p>
      </Lesson>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented<Filter> value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'storable', label: 'Storable' }, { value: 'consumable', label: 'Consumable' }, { value: 'service', label: 'Service' }]} />
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-3" />
          <input className="field !py-2 pl-9" placeholder="Search name, SKU or barcode" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {error && <ErrorBox message={error} />}
      {loading && !data ? (
        <Spinner />
      ) : data?.length === 0 ? (
        <Empty icon={<Package className="size-6" />} title="No products found" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead className="text-left text-[12px] text-label-3">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 text-right font-medium">Cost</th>
                <th className="px-4 py-3 text-right font-medium">Margin</th>
                <th className="px-4 py-3 text-right font-medium">On hand</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((p) => {
                const low = p.on_hand !== null && num(p.reorder_min) > 0 && num(p.on_hand) <= num(p.reorder_min)
                return (
                  <tr key={p.id} onClick={() => setEditing(p)} className="cursor-pointer border-b border-line/60 transition last:border-0 hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-[12px] text-label-3 tnum">{p.sku}</div>
                    </td>
                    <td className="px-4 py-3"><Pill tone={typeMeta[p.product_type].tone}>{typeMeta[p.product_type].label}</Pill></td>
                    <td className="px-4 py-3 text-label-2">{p.category_name}</td>
                    <td className="px-4 py-3 text-right tnum">{money(p.sale_price)}</td>
                    <td className="px-4 py-3 text-right tnum text-label-2">{money(p.cost)}</td>
                    <td className="px-4 py-3 text-right tnum text-green">{p.margin !== null ? `${num(p.margin).toFixed(0)}%` : '—'}</td>
                    <td className={cx('px-4 py-3 text-right tnum', low && 'text-orange')}>
                      {p.on_hand === null ? <span className="text-label-3">—</span> : `${qty(p.on_hand)} ${p.uom_name}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? editing.name || 'Product' : 'New Product'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} loading={busy === 'save'} disabled={!editing?.name || !editing?.sku}>Save</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <Field label="Internal reference (SKU)"><input className="field tnum" value={editing.sku ?? ''} onChange={(e) => set('sku', e.target.value)} /></Field>
              <Field label="Name"><input className="field" value={editing.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
            </div>
            <Field label="Product type" hint={typeMeta[editing.product_type ?? 'storable'].hint}>
              <Segmented<ProductType> value={editing.product_type ?? 'storable'} onChange={(v) => set('product_type', v)} options={[{ value: 'storable', label: 'Storable' }, { value: 'consumable', label: 'Consumable' }, { value: 'service', label: 'Service' }]} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <select className="field" value={editing.category ?? ''} onChange={(e) => set('category', Number(e.target.value))}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Unit of measure">
                <select className="field" value={editing.uom ?? ''} onChange={(e) => set('uom', Number(e.target.value))}>
                  {uoms.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Sales price"><input className="field tnum" type="number" min={0} step="0.01" value={editing.sale_price ?? ''} onChange={(e) => set('sale_price', e.target.value)} /></Field>
              <Field label="Cost"><input className="field tnum" type="number" min={0} step="0.01" value={editing.cost ?? ''} onChange={(e) => set('cost', e.target.value)} /></Field>
              <Field label="Sales tax">
                <select className="field" value={editing.sale_tax ?? ''} onChange={(e) => set('sale_tax', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">No tax</option>
                  {taxes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
            </div>
            {margin !== null && (
              <div className="rounded-xl bg-green/10 px-3.5 py-2.5 text-[14px] text-green">
                Gross margin: <b className="tnum">{money(num(editing.sale_price) - num(editing.cost))}</b> per unit ({margin.toFixed(1)}%)
              </div>
            )}
            {editing.product_type !== 'service' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Main vendor" hint="Used by Replenishment to draft RFQs.">
                  <select className="field" value={editing.vendor ?? ''} onChange={(e) => set('vendor', e.target.value ? Number(e.target.value) : null)}>
                    <option value="">None</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </Field>
                <Field label="Purchase tax" hint="VAT we pay the vendor (reclaimable).">
                  <select className="field" value={editing.purchase_tax ?? ''} onChange={(e) => set('purchase_tax', e.target.value ? Number(e.target.value) : null)}>
                    <option value="">No tax</option>
                    {purchaseTaxes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
              </div>
            )}
            {editing.product_type === 'storable' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Reorder point" hint="Flagged as low stock at or below this."><input className="field tnum" type="number" min={0} value={editing.reorder_min ?? '0'} onChange={(e) => set('reorder_min', e.target.value)} /></Field>
                <Field label="Barcode"><input className="field tnum" value={editing.barcode ?? ''} onChange={(e) => set('barcode', e.target.value)} /></Field>
              </div>
            )}
            {category && (
              <div className="rounded-xl border border-line p-4">
                <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-label-3">Accounting (from category “{category.name}”)</h3>
                <dl className="space-y-1.5 text-[14px]">
                  <div className="flex justify-between gap-3"><dt className="text-label-2">When invoiced, credit</dt><dd className="text-right">{category.income_account_display}</dd></div>
                  {editing.product_type === 'storable' && (
                    <>
                      <div className="flex justify-between gap-3"><dt className="text-label-2">When delivered, debit</dt><dd className="text-right">{category.expense_account_display}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-label-2">Stock valued in</dt><dd className="text-right">{category.stock_valuation_account_display}</dd></div>
                    </>
                  )}
                </dl>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </>
  )
}
