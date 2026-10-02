// Decimal fields arrive from Django as strings ("1536.00"); use num() from format.ts to do math.
export type Dec = string | number

export interface User {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
}

export interface PaymentTerm {
  id: number
  name: string
  days: number
}

export interface Tax {
  id: number
  name: string
  rate: Dec
  scope: 'sale' | 'purchase'
  account: number
  account_display: string
}

export interface Uom {
  id: number
  name: string
}

export interface Partner {
  id: number
  name: string
  is_company: boolean
  is_customer: boolean
  is_vendor: boolean
  email: string
  phone: string
  street: string
  city: string
  country: string
  vat: string
  payment_term: number | null
  payment_term_name: string | null
  credit_limit: Dec
  receivable_account: number
  payable_account: number
  active: boolean
  open_balance: Dec
  created_at: string
}

export interface ProductCategory {
  id: number
  name: string
  income_account: number
  income_account_display: string
  expense_account: number
  expense_account_display: string
  stock_valuation_account: number
  stock_valuation_account_display: string
  product_count: number
}

export type ProductType = 'storable' | 'consumable' | 'service'

export interface Product {
  id: number
  sku: string
  name: string
  product_type: ProductType
  category: number
  category_name: string
  uom: number
  uom_name: string
  sale_price: Dec
  cost: Dec
  sale_tax: number | null
  sale_tax_name: string | null
  purchase_tax: number | null
  vendor: number | null
  vendor_name: string | null
  barcode: string
  reorder_min: Dec
  description: string
  active: boolean
  on_hand: Dec | null
  reserved: Dec | null
  margin: Dec | null
}

export type AccountGroup = 'asset' | 'liability' | 'equity' | 'income' | 'expense'

export interface Account {
  id: number
  code: string
  name: string
  account_type: string
  type_display: string
  internal_group: AccountGroup
  description: string
  debit: Dec
  credit: Dec
  balance: Dec
}

export interface MoveLine {
  id: number
  account: number
  account_code: string
  account_name: string
  account_group: AccountGroup
  name: string
  kind: string
  product: number | null
  product_name: string | null
  quantity: Dec
  price_unit: Dec
  tax: number | null
  debit: Dec
  credit: Dec
}

export interface Payment {
  id: number
  name: string
  partner: number
  partner_name: string
  journal: number
  journal_name: string
  invoice: number | null
  invoice_name: string | null
  move: number | null
  payment_type: 'inbound' | 'outbound'
  amount: Dec
  date: string
  state: string
}

export interface Move {
  id: number
  name: string
  move_type: 'entry' | 'out_invoice' | 'out_refund' | 'in_invoice'
  move_type_display: string
  journal: number
  journal_name: string
  journal_code: string
  partner: number | null
  partner_name: string | null
  date: string
  invoice_date_due: string | null
  ref: string
  state: 'draft' | 'posted' | 'cancel'
  payment_state: 'not_paid' | 'partial' | 'paid'
  sale_order: number | null
  sale_order_name: string | null
  purchase_order: number | null
  purchase_order_name: string | null
  amount_untaxed: Dec
  amount_tax: Dec
  amount_total: Dec
  amount_residual: Dec
  created_at: string
  lines?: MoveLine[]
  payments?: Payment[]
}

export interface StockMove {
  id: number
  product: number
  product_name: string
  product_sku: string
  uom_name: string
  quantity: Dec
  unit_cost: Dec
  state: string
  date: string | null
}

export interface Picking {
  id: number
  name: string
  kind: 'incoming' | 'outgoing' | 'adjustment' | 'return'
  kind_display: string
  state: 'ready' | 'done' | 'cancel'
  partner: number | null
  partner_name: string | null
  origin: string
  sale_order: number | null
  purchase_order: number | null
  source_location_name: string
  dest_location_name: string
  scheduled_date: string
  date_done: string | null
  moves: StockMove[]
  valuation_entry: { id: number; name: string } | null
  created_at: string
}

export interface StockRow {
  id: number
  sku: string
  name: string
  category: string
  uom: string
  on_hand: Dec
  reserved: Dec
  available: Dec
  incoming: Dec
  cost: Dec
  value: Dec
  reorder_min: Dec
  low: boolean
}

export interface SaleOrderLine {
  id?: number
  product: number
  product_name?: string
  product_sku?: string
  product_type?: ProductType
  uom_name?: string
  description?: string
  quantity: Dec
  price_unit: Dec
  discount: Dec
  tax: number | null
  tax_name?: string | null
  subtotal?: Dec
  tax_amount?: Dec
  qty_delivered?: Dec
  qty_invoiced?: Dec
  qty_to_invoice?: Dec
}

export type DeliveryStatus = 'none' | 'pending' | 'partial' | 'full'
export type InvoiceStatus = 'no' | 'to_invoice' | 'invoiced'

export interface SaleOrder {
  id: number
  name: string
  partner: number
  partner_name: string
  state: 'draft' | 'sale' | 'cancel'
  state_display: string
  date_order: string
  validity_date: string | null
  payment_term: number | null
  payment_term_name: string | null
  note: string
  amount_untaxed: Dec
  amount_tax: Dec
  amount_total: Dec
  delivery_status: DeliveryStatus
  invoice_status: InvoiceStatus
  confirmed_at: string | null
  created_at: string
  lines: SaleOrderLine[]
}

export interface SaleFlow {
  order: SaleOrder
  pickings: Picking[]
  invoices: Move[]
  payments: Payment[]
  entries: Move[]
}

export interface Dashboard {
  kpis: {
    revenue_month: Dec
    receivable: Dec
    overdue: Dec
    stock_value: Dec
    quotations: number
    to_deliver: number
    to_invoice: number
    payable: Dec
    rfqs: number
    to_receive: number
    to_bill: number
    to_produce: number
  }
  monthly_revenue: { month: string; revenue: Dec }[]
  low_stock: { id: number; sku: string; name: string; on_hand: Dec; reorder_min: Dec }[]
  recent_orders: { kind: string; id: number; name: string; partner: string; state: string; amount: Dec; at: string }[]
}

/* ---------- Purchasing ---------- */

export interface PurchaseOrderLine {
  id?: number
  product: number
  product_name?: string
  product_sku?: string
  product_type?: ProductType
  uom_name?: string
  description?: string
  quantity: Dec
  price_unit: Dec
  tax: number | null
  tax_name?: string | null
  subtotal?: Dec
  tax_amount?: Dec
  qty_received?: Dec
  qty_billed?: Dec
}

export type ReceiptStatus = 'none' | 'pending' | 'partial' | 'full'
export type BillStatus = 'no' | 'waiting' | 'to_bill' | 'billed'

export interface PurchaseOrder {
  id: number
  name: string
  partner: number
  partner_name: string
  state: 'draft' | 'purchase' | 'cancel'
  state_display: string
  date_order: string
  date_planned: string | null
  payment_term: number | null
  payment_term_name: string | null
  note: string
  amount_untaxed: Dec
  amount_tax: Dec
  amount_total: Dec
  receipt_status: ReceiptStatus
  bill_status: BillStatus
  confirmed_at: string | null
  created_at: string
  lines: PurchaseOrderLine[]
}

export interface PurchaseFlow {
  order: PurchaseOrder
  pickings: Picking[]
  bills: Move[]
  payments: Payment[]
  entries: Move[]
}

export interface ReplenishmentRow {
  id: number
  sku: string
  name: string
  uom: string
  on_hand: Dec
  available: Dec
  incoming: Dec
  forecast: Dec
  reorder_min: Dec
  suggested: Dec
  cost: Dec
  vendor: number | null
  vendor_name: string | null
}

/* ---------- Manufacturing ---------- */

export interface BomLine {
  id?: number
  component: number
  component_name?: string
  component_sku?: string
  uom_name?: string
  quantity: Dec
  cost?: Dec
}

export interface Bom {
  id: number
  product: number
  product_name: string
  product_sku: string
  product_cost: Dec
  product_price: Dec
  quantity: Dec
  code: string
  lines: BomLine[]
  component_cost: Dec
}

export interface MoComponent {
  product: number
  sku: string
  name: string
  uom: string
  quantity: Dec
  available: Dec
  cost: Dec
  value: Dec
  ok: boolean
}

export interface ManufacturingOrder {
  id: number
  name: string
  product: number
  product_name: string
  product_sku: string
  uom_name: string
  bom: number
  quantity: Dec
  state: 'draft' | 'confirmed' | 'done' | 'cancel'
  state_display: string
  origin: string
  date_planned: string
  date_done: string | null
  unit_cost: Dec
  created_at: string
  components?: MoComponent[]
  moves?: StockMove[]
  entries?: Move[]
}

/* ---------- Reports ---------- */

export interface ReportLine {
  id: number | null
  code: string
  name: string
  amount: Dec
}

export interface ReportSection {
  lines: ReportLine[]
  total: Dec
}

export interface ProfitLoss {
  date_from: string | null
  date_to: string | null
  revenue: ReportSection
  cost_of_revenue: ReportSection
  gross_profit: Dec
  gross_margin: Dec | null
  expenses: ReportSection
  net_profit: Dec
}

export interface BalanceSheet {
  as_of: string | null
  assets: ReportSection
  liabilities: ReportSection
  equity: ReportSection
  liabilities_and_equity: Dec
  balanced: boolean
}

export type AgedBucket = 'not_due' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90'

export interface AgedPartner extends Record<AgedBucket, Dec> {
  partner: number
  name: string
  total: Dec
  documents: { id: number; name: string; date: string; due: string; days_late: number; bucket: AgedBucket; residual: Dec; total: Dec }[]
}

export interface AgedBalance {
  kind: 'receivable' | 'payable'
  buckets: { key: AgedBucket; label: string }[]
  partners: AgedPartner[]
  totals: Record<AgedBucket | 'total', Dec>
}
/* ---------- Guided scenarios ---------- */

export interface ScenarioMeta {
  key: string
  title: string
  subtitle: string
  lesson: string
  icon: string
  color: string
  steps: { title: string; actor: string }[]
}

export interface Bucket {
  code: string
  label: string
  group: AccountGroup
  amount: Dec
}

export interface ScenarioStepResult {
  index: number
  title: string
  actor: string
  outcome: 'ok' | 'blocked'
  explanation: string
  takeaway: string
  note: string | null
  documents: { kind: string; label: string; url: string }[]
  stock: { sku: string; name: string; before: Dec; after: Dec }[]
  entries: Move[]
  balances: Bucket[]
  finished: boolean
}
/* ---------- CRM ---------- */

export type LeadStage = 'new' | 'qualified' | 'proposition' | 'won' | 'lost'

export interface Lead {
  id: number
  name: string
  contact_name: string
  company_name: string
  email: string
  phone: string
  source: string
  partner: number | null
  partner_name: string | null
  expected_revenue: Dec
  probability: number
  weighted_revenue: Dec
  stage: LeadStage
  stage_display: string
  sale_order: number | null
  sale_order_name: string | null
  sale_order_state: string | null
  lost_reason: string
  notes: string
  created_at: string
  closed_at: string | null
}

/* ---------- HR ---------- */

export interface Department {
  id: number
  name: string
  employee_count: number
}

export interface PayslipAmounts {
  gross: Dec
  employee_social: Dec
  income_tax: Dec
  net: Dec
  employer_social: Dec
}

export interface Employee {
  id: number
  name: string
  job_title: string
  department: number
  department_name: string
  email: string
  hire_date: string
  wage: Dec
  active: boolean
  preview: PayslipAmounts
}

export interface Payslip extends PayslipAmounts {
  id: number
  employee: number
  employee_name: string
  job_title: string
}

export interface PayrollRun {
  id: number
  name: string
  period: string
  state: 'draft' | 'posted' | 'paid' | 'done'
  state_display: string
  move: number | null
  payment_move: number | null
  authorities_move: number | null
  payslips: Payslip[]
  totals: PayslipAmounts & { cost: Dec }
  created_at: string
}

export interface ExpenseClaim {
  id: number
  employee: number
  employee_name: string
  description: string
  account: number
  account_name: string
  amount: Dec
  date: string
  state: 'submitted' | 'approved' | 'paid' | 'refused'
  state_display: string
  move: number | null
  payment_move: number | null
  created_at: string
}

/* ---------- Fixed assets ---------- */

export interface FixedAsset {
  id: number
  name: string
  account: number
  account_name: string
  value: Dec
  acquisition_date: string
  useful_life_months: number
  vendor: number | null
  vendor_name: string | null
  bill: number | null
  state: 'draft' | 'running' | 'closed'
  state_display: string
  monthly_depreciation: Dec
  depreciated: Dec
  book_value: Dec
  schedule: { date: string; amount: Dec; book_value: Dec; posted: boolean; move: number | null }[] | null
  created_at: string
}