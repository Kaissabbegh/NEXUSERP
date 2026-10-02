export type GlossaryArea = 'Basics' | 'Sales' | 'Purchasing' | 'Inventory' | 'Manufacturing' | 'Accounting'

export interface Term {
  term: string
  area: GlossaryArea
  meaning: string
  example?: string
  family?: 'asset' | 'liability' | 'equity' | 'income' | 'expense'
  link?: string
}

export const GLOSSARY: Term[] = [
  // Basics
  { term: 'ERP', area: 'Basics', meaning: 'Enterprise Resource Planning: one software with one shared database that runs every department.', link: '/learn' },
  { term: 'Module', area: 'Basics', meaning: 'A functional area of the ERP (Sales, Purchasing, Inventory, Accounting…). Modules share the same data.' },
  { term: 'Master data', area: 'Basics', meaning: 'Information that rarely changes and is reused by every transaction: customers, vendors, products, accounts.', example: 'Product "Oak Executive Desk", customer "Atlas Consulting".' },
  { term: 'Transactional data', area: 'Basics', meaning: 'Day-to-day events that point to master data: orders, deliveries, invoices, payments.' },
  { term: 'They owe us', area: 'Basics', meaning: 'Someone else must give us money later. For the company it is an asset (Accounts Receivable).', example: 'A customer received chairs but has not paid yet.', family: 'asset', link: '/reports/aged?kind=receivable' },
  { term: 'We owe them', area: 'Basics', meaning: 'We must give money to someone else later. For the company it is a liability (Accounts Payable, VAT Payable, loans).', example: 'A vendor delivered wood and sent a bill; we pay in 30 days.', family: 'liability', link: '/reports/aged?kind=payable' },

  // Sales
  { term: 'Quotation', area: 'Sales', meaning: 'A price offer to a customer. Changes nothing in stock or accounting.', link: '/sales?state=draft' },
  { term: 'Sales Order', area: 'Sales', meaning: 'A confirmed quotation: the customer said yes. Creates a delivery order.', link: '/sales?state=sale' },
  { term: 'Order-to-Cash (O2C)', area: 'Sales', meaning: 'The full selling cycle: Quotation → Order → Delivery → Invoice → Payment.' },
  { term: 'Credit limit', area: 'Sales', meaning: 'The maximum a customer may owe us at once. Confirming an order above it is blocked.' },
  { term: 'Payment terms', area: 'Sales', meaning: 'When an invoice or bill must be paid (Immediate, 15 days, 30 days…). Sets the due date.' },
  { term: 'Discount', area: 'Sales', meaning: 'A percentage taken off a line price on a quotation.' },

  // Purchasing
  { term: 'RFQ', area: 'Purchasing', meaning: 'Request for Quotation: we ask a vendor for a price. Nothing is owed yet.', link: '/purchases?state=draft' },
  { term: 'Purchase Order (PO)', area: 'Purchasing', meaning: 'A confirmed RFQ: the vendor agreed. Creates a receipt for the warehouse.', link: '/purchases?state=purchase' },
  { term: 'Procure-to-Pay (P2P)', area: 'Purchasing', meaning: 'The full buying cycle: RFQ → PO → Receipt → Vendor Bill → Payment.' },
  { term: 'Vendor / Supplier', area: 'Purchasing', meaning: 'A company we buy from.', link: '/contacts' },
  { term: 'Vendor Bill', area: 'Purchasing', meaning: "The vendor's invoice to us. Posting it records a debt (Accounts Payable).", link: '/bills' },
  { term: 'Three-way match', area: 'Purchasing', meaning: 'Only pay for what was ordered (PO) AND received (receipt) AND billed (bill). The bill uses received quantities.' },
  { term: 'Replenishment', area: 'Purchasing', meaning: 'Automatic suggestions of what to buy when stock forecast falls to the reorder point.', link: '/replenishment' },

  // Inventory
  { term: 'SKU / Internal reference', area: 'Inventory', meaning: "A product's unique code.", example: 'DESK-001' },
  { term: 'Unit of Measure (UoM)', area: 'Inventory', meaning: 'How a product is counted: Unit, Hour, Box of 10…' },
  { term: 'Storable product', area: 'Inventory', meaning: 'Quantity is tracked and valued in stock (desks, chairs).' },
  { term: 'Consumable product', area: 'Inventory', meaning: 'Delivered but quantity not tracked precisely (screws, packaging).' },
  { term: 'Service', area: 'Inventory', meaning: 'Sold or bought but never stocked or delivered (installation, design hours).' },
  { term: 'Warehouse / Location', area: 'Inventory', meaning: 'Where goods are. WH/Stock is real; Customers, Vendors, Production and Inventory adjustment are virtual locations.' },
  { term: 'Transfer (picking)', area: 'Inventory', meaning: 'A document that moves goods between locations. WH/IN = receipt, WH/OUT = delivery, WH/ADJ = adjustment.', link: '/transfers' },
  { term: 'Receipt', area: 'Inventory', meaning: 'Goods arriving from a vendor (Vendors → WH/Stock). Stock goes up.' },
  { term: 'Delivery order', area: 'Inventory', meaning: 'Goods leaving for a customer (WH/Stock → Customers). Stock goes down.' },
  { term: 'On hand', area: 'Inventory', meaning: 'Physically on the shelf right now.', link: '/stock' },
  { term: 'Reserved', area: 'Inventory', meaning: 'On the shelf but promised to confirmed orders not yet shipped.' },
  { term: 'Available', area: 'Inventory', meaning: 'On hand − reserved: what sales can still promise.' },
  { term: 'Incoming', area: 'Inventory', meaning: 'Ordered from vendors, not yet received.' },
  { term: 'Forecast', area: 'Inventory', meaning: 'Available + incoming: what we will have once pending receipts arrive.' },
  { term: 'Reorder point', area: 'Inventory', meaning: 'When the forecast reaches this level, it is time to buy more.' },
  { term: 'Inventory adjustment', area: 'Inventory', meaning: 'Correcting stock after a physical count. A shortage is posted as an expense (Inventory Differences).', link: '/stock' },
  { term: 'Average cost (AVCO)', area: 'Inventory', meaning: 'Product cost is recalculated at each receipt as a weighted average of old stock and new goods.', example: '10 chairs at $165 + 10 at $175 → cost becomes $170.' },

  // Manufacturing
  { term: 'Bill of Materials (BoM)', area: 'Manufacturing', meaning: 'The recipe: which components, in which quantities, make one finished product.', link: '/boms' },
  { term: 'Component', area: 'Manufacturing', meaning: 'A part consumed to build a finished product.', example: 'Oak Desktop Panel, Steel Desk Frame.' },
  { term: 'Manufacturing Order (MO)', area: 'Manufacturing', meaning: 'An instruction to produce a quantity of a product from its BoM. Producing consumes components and adds finished goods.', link: '/manufacturing' },

  // Accounting
  { term: 'Chart of Accounts', area: 'Accounting', meaning: 'The list of all accounts (buckets) the company uses.', link: '/accounts' },
  { term: 'Account', area: 'Accounting', meaning: 'One bucket of value, like Bank or Product Sales. Every account belongs to one of 5 families.' },
  { term: 'Asset', area: 'Accounting', meaning: 'What the company owns, or what others owe it.', example: 'Bank, Inventory, Accounts Receivable.', family: 'asset' },
  { term: 'Liability', area: 'Accounting', meaning: 'What the company owes to others: a debt.', example: 'Accounts Payable, VAT Payable, a bank loan.', family: 'liability' },
  { term: 'Equity', area: 'Accounting', meaning: "The owners' share: what they put in, plus accumulated profit (minus losses).", family: 'equity' },
  { term: 'Income / Revenue', area: 'Accounting', meaning: 'Money earned by selling.', example: 'Product Sales, Service Revenue.', family: 'income' },
  { term: 'Expense', area: 'Accounting', meaning: 'Money spent or used up to run the business.', example: 'Cost of Goods Sold, Rent, Salaries.', family: 'expense' },
  { term: 'Accounts Receivable', area: 'Accounting', meaning: 'Money customers owe us for invoices not yet paid. "Receive" = it will come in.', family: 'asset', link: '/reports/aged?kind=receivable' },
  { term: 'Accounts Payable', area: 'Accounting', meaning: 'Money we owe vendors for bills not yet paid. "Pay" = it must go out.', family: 'liability', link: '/reports/aged?kind=payable' },
  { term: 'VAT Payable', area: 'Accounting', meaning: 'VAT collected from customers that we must hand to the government.', family: 'liability' },
  { term: 'VAT Receivable', area: 'Accounting', meaning: 'VAT we paid on purchases that the government lets us deduct.', family: 'asset' },
  { term: 'Cost of Goods Sold (COGS)', area: 'Accounting', meaning: 'What the products we sold cost us. Posted when goods are delivered.', family: 'expense' },
  { term: 'Gross margin', area: 'Accounting', meaning: 'Sale price − cost. Revenue − COGS = gross profit.', example: 'Chair: $320 − $165 = $155 (48%).' },
  { term: 'Net profit', area: 'Accounting', meaning: 'Revenue − COGS − all other expenses. Negative = a loss.', link: '/reports/profit-loss' },
  { term: 'Stock Interim (Received)', area: 'Accounting', meaning: 'Temporary account for goods received but not yet billed. The vendor bill clears it.', family: 'asset' },
  { term: 'Debit / Credit', area: 'Accounting', meaning: 'The two sides of every entry. Debit increases assets & expenses; credit increases liabilities, equity & income. Total debits = total credits.' },
  { term: 'Double-entry', area: 'Accounting', meaning: 'Every operation moves value from one account to another, so the books always balance.' },
  { term: 'Journal', area: 'Accounting', meaning: 'A category of entries: INV (customer invoices), BILL (vendor bills), BNK (bank), STJ (stock), MISC (other).' },
  { term: 'Journal entry', area: 'Accounting', meaning: 'One accounting event: a group of debit and credit lines that balance.', link: '/entries' },
  { term: 'Draft / Posted', area: 'Accounting', meaning: 'Draft = prepared, not in the books. Posted = officially recorded and counted in balances.' },
  { term: 'Perpetual inventory', area: 'Accounting', meaning: 'Stock value is updated in accounting the moment goods move (not once at month-end).' },
  { term: 'Balance Sheet', area: 'Accounting', meaning: 'A photo of the company on a date: Assets = Liabilities + Equity.', link: '/reports/balance-sheet' },
  { term: 'Profit & Loss (P&L)', area: 'Accounting', meaning: 'A film of a period: revenue minus costs = profit or loss.', link: '/reports/profit-loss' },
  { term: 'Aged balance', area: 'Accounting', meaning: 'Open receivables or payables grouped by how late they are (0–30, 31–60… days).', link: '/reports/aged' },
]
