import type { Chapter } from './types'

export const sales: Chapter = {
  slug: 'crm-sales',
  number: 3,
  title: 'CRM & Sales',
  department: 'Sales',
  icon: 'ShoppingBag',
  color: 'green',
  minutes: 25,
  summary: 'From the first contact with a prospect to the money in the bank, and what happens when something goes wrong after the sale.',
  goals: [
    'Follow the lead → opportunity → quotation → order flow',
    'Explain Order-to-Cash and the document created at each step',
    'Know the accounting impact of delivery, invoice and payment',
    'Handle after-sales: returns, credit notes and refunds',
    'Use credit limits and payment terms for credit control',
  ],
  intro: [
    'Selling starts before the quotation. The CRM (Customer Relationship Management) module tracks leads (people who might buy) and opportunities (qualified leads with an expected revenue and a probability). It lets managers forecast sales with the weighted pipeline.',
    'Once the customer is interested, the Sales module takes over with the Order-to-Cash cycle (O2C): quotation, sales order, delivery, invoice, payment. Each step creates a document and some steps create journal entries automatically.',
    'After-sales is part of the cycle too. If goods come back, a return puts them back in stock and a credit note cancels part of the invoice. A posted invoice is never edited or deleted: it is corrected with a credit note so the audit trail stays complete.',
  ],
  roles: [
    { name: 'Salesperson', does: 'Qualifies leads, sends quotations, confirms orders.' },
    { name: 'Sales manager', does: 'Follows the pipeline, sets credit limits and discounts policy.' },
    { name: 'Warehouse', does: 'Picks, packs and ships the delivery.' },
    { name: 'Accountant', does: 'Invoices, records payments, chases late payers, issues credit notes.' },
    { name: 'Customer service', does: 'Handles complaints and returns.' },
  ],
  process: [
    {
      title: 'CRM: lead to won opportunity',
      steps: [
        { label: 'Lead', doc: 'Lead', who: 'Salesperson', effect: 'A possible sale; the prospect is not a customer yet' },
        { label: 'Qualified', doc: 'Opportunity', who: 'Salesperson', effect: 'Budget, Authority, Need, Timing (BANT) confirmed' },
        { label: 'Proposition', doc: 'Quotation', who: 'Salesperson', effect: 'Customer record and quotation created' },
        { label: 'Won / Lost', doc: 'Sales order', who: 'Sales manager', effect: 'Won = quotation confirmed; lost reason recorded' },
      ],
    },
    {
      title: 'Order-to-Cash',
      steps: [
        { label: 'Quotation', doc: 'Quotation', who: 'Salesperson', effect: 'No stock or accounting impact' },
        { label: 'Sales order', doc: 'Sales order', who: 'Salesperson', effect: 'Credit check; delivery created; stock reserved' },
        { label: 'Delivery', doc: 'Delivery order', who: 'Warehouse', effect: 'Stock down; Dr COGS / Cr Inventory' },
        { label: 'Invoice', doc: 'Customer invoice', who: 'Accountant', effect: 'Dr Receivable / Cr Sales + VAT payable' },
        { label: 'Payment', doc: 'Payment', who: 'Accountant', effect: 'Dr Bank / Cr Receivable' },
      ],
    },
    {
      title: 'After-sales: a return',
      steps: [
        { label: 'Return', doc: 'Return (RET)', who: 'Customer service', effect: 'Linked to the original order' },
        { label: 'Receive back', doc: 'Return validated', who: 'Warehouse', effect: 'Stock up; Dr Inventory / Cr COGS' },
        { label: 'Credit note', doc: 'Credit note', who: 'Accountant', effect: 'Dr Sales + VAT / Cr Receivable' },
        { label: 'Refund', doc: 'Payment out', who: 'Accountant', effect: 'Dr Receivable / Cr Bank (if already paid)' },
      ],
    },
  ],
  concepts: [
    { term: 'Lead vs opportunity', meaning: 'A lead is unqualified interest. An opportunity is a qualified lead with an expected revenue, probability and stage.' },
    { term: 'Weighted pipeline', meaning: 'Σ expected revenue × probability of open opportunities: a forecast of future sales.' },
    { term: 'Quotation', meaning: 'A price offer. It has no effect on stock or accounting.' },
    { term: 'Sales order', meaning: 'A confirmed quotation: a commitment that triggers delivery.' },
    { term: 'Invoicing policy', meaning: 'Invoice what was ordered, or what was delivered (NexusERP invoices goods once delivered, services as ordered).' },
    { term: 'Credit limit', meaning: 'Maximum a customer may owe at once. Confirmation is blocked above it.' },
    { term: 'Payment terms', meaning: 'Sets the invoice due date (e.g. 30 days).' },
    { term: 'Credit note', meaning: 'The reverse of an invoice. Reduces what the customer owes or creates a refund.' },
    { term: 'Reconciliation', meaning: 'Matching a payment or credit note with the invoice it settles.' },
  ],
  accounting: [
    { event: 'Delivery validated', debit: '500000 Cost of Goods Sold', credit: '110100 Inventory', why: 'The goods are gone, so their cost becomes an expense.' },
    { event: 'Invoice posted', debit: '121000 Accounts Receivable', credit: '400000 Sales + 251000 VAT Payable', why: 'We earned revenue; the customer owes us; VAT is owed to the state.' },
    { event: 'Payment received', debit: '101000 Bank', credit: '121000 Accounts Receivable', why: 'The debt becomes cash. No profit impact.' },
    { event: 'Return received', debit: '110100 Inventory', credit: '500000 Cost of Goods Sold', why: 'The goods are back, so their cost is reversed.' },
    { event: 'Credit note posted', debit: '400000 Sales + 251000 VAT Payable', credit: '121000 Accounts Receivable', why: 'Revenue and VAT are reversed for the credited quantity.' },
    { event: 'Refund paid', debit: '121000 Accounts Receivable', credit: '101000 Bank', why: 'Money goes back to the customer.' },
  ],
  integrations: [
    { module: 'Inventory', how: 'Confirmed orders create deliveries; returns create receipts back into stock.' },
    { module: 'Accounting', how: 'Invoices, credit notes and payments are journal entries.' },
    { module: 'Manufacturing', how: 'Products made in-house can trigger manufacturing orders.' },
    { module: 'Purchasing', how: 'Low stock caused by sales triggers replenishment.' },
  ],
  kpis: [
    { name: 'Win rate', formula: 'Won ÷ (Won + Lost)', why: 'How effective the sales team is.' },
    { name: 'Average order value', formula: 'Revenue ÷ number of orders', why: 'Tracks upselling and deal size.' },
    { name: 'DSO (days sales outstanding)', formula: 'Receivables ÷ revenue × days', why: 'How fast customers pay.' },
    { name: 'Gross margin %', formula: '(Revenue − COGS) ÷ Revenue', why: 'Profitability of what we sell.' },
  ],
  bestPractices: [
    'Always link quotations to an opportunity so the pipeline matches reality.',
    'Record the lost reason: it is the best market feedback you get.',
    'Set credit limits for customers paying on terms.',
    'Correct posted invoices with credit notes, never by editing or deleting.',
  ],
  mistakes: [
    'Invoicing before delivery when the policy is “delivered quantities”: customers dispute the invoice.',
    'Creating customers from scratch instead of converting the CRM lead (duplicates).',
    'Refunding by a manual bank transfer without a credit note: revenue and VAT stay overstated.',
  ],
  consultant: {
    questions: ['Do you invoice on order or on delivery?', 'Do you give discounts? Who can approve them?', 'How do you handle returns today?', 'Do customers pay in advance, on delivery, or on terms?', 'Do you need price lists per customer group?'],
    data: ['Open leads and opportunities', 'Customers with credit limits and terms', 'Open sales orders not yet delivered', 'Unpaid customer invoices (opening receivables)'],
    configure: ['CRM stages and lost reasons', 'Invoicing policy', 'Payment terms and credit limits', 'Quotation and invoice templates', 'Sales taxes'],
  },
  tryIt: [
    { label: 'CRM Pipeline', to: '/crm' },
    { label: 'Sales Orders', to: '/sales' },
    { label: 'Customer invoices & credit notes', to: '/invoices' },
    { label: 'Who Owes Whom', to: '/reports/aged' },
  ],
  scenarios: ['lead', 'sell', 'return', 'credit'],
  quiz: [
    { q: 'When does a sale first create a journal entry?', options: ['When the quotation is sent', 'When the order is confirmed', 'When the goods are delivered', 'Never'], answer: 2, why: 'Quotation and order are commitments. Delivery posts the cost (perpetual inventory); the invoice posts revenue.' },
    { q: 'A customer already paid and returns one item. How do you correct the invoice?', options: ['Edit the invoice amount', 'Delete the invoice', 'Issue a credit note and refund', 'Do nothing'], answer: 2, why: 'Posted invoices are never edited; a credit note reverses revenue and VAT, then a refund pays the customer back.' },
    { q: 'An opportunity of $10,000 at 30% probability adds how much to the weighted pipeline?', options: ['$10,000', '$3,000', '$7,000', '$0'], answer: 1, why: 'Weighted = expected revenue × probability = $10,000 × 30%.' },
    { q: 'Which document checks the credit limit?', options: ['Quotation creation', 'Sales order confirmation', 'Delivery', 'Payment'], answer: 1, why: 'The limit is checked when the quotation is confirmed, before goods are committed.' },
  ],
}

export const purchasing: Chapter = {
  slug: 'purchasing',
  number: 4,
  title: 'Purchasing',
  department: 'Purchasing',
  icon: 'ShoppingCart',
  color: 'orange',
  minutes: 20,
  summary: 'Buying the right quantity at the right price, receiving it, and paying only for what was ordered and received.',
  goals: [
    'Follow Procure-to-Pay: RFQ → PO → receipt → bill → payment',
    'Explain three-way matching',
    'Understand replenishment rules and the stock forecast',
    'Know why buying stock does not reduce profit',
  ],
  intro: [
    'Procure-to-Pay (P2P) is the mirror image of selling. The purchaser asks vendors for prices (RFQ), confirms the best offer (purchase order), the warehouse receives the goods, the accountant records the vendor’s bill and pays it on the due date.',
    'Three-way matching protects the company: the bill is only paid for quantities that were both ordered (PO) and received (receipt). NexusERP creates bills from received quantities, so this check is automatic.',
    'Buying stock is not an expense. Cash (an asset) becomes inventory (another asset). The expense only appears when the goods are sold (cost of goods sold) or lost.',
  ],
  roles: [
    { name: 'Purchaser', does: 'Chooses vendors, negotiates prices, sends RFQs and POs.' },
    { name: 'Warehouse', does: 'Checks and receives the goods.' },
    { name: 'Accountant', does: 'Records and pays vendor bills.' },
  ],
  process: [
    {
      title: 'Procure-to-Pay',
      steps: [
        { label: 'RFQ', doc: 'Request for quotation', who: 'Purchaser', effect: 'No commitment yet' },
        { label: 'Purchase order', doc: 'Purchase order', who: 'Purchaser', effect: 'Receipt created; quantity “incoming”' },
        { label: 'Receipt', doc: 'Receipt (IN)', who: 'Warehouse', effect: 'Stock up; Dr Inventory / Cr Stock Interim; average cost updated' },
        { label: 'Vendor bill', doc: 'Bill', who: 'Accountant', effect: 'Dr Stock Interim + VAT receivable / Cr Payable' },
        { label: 'Payment', doc: 'Payment out', who: 'Accountant', effect: 'Dr Payable / Cr Bank' },
      ],
    },
  ],
  concepts: [
    { term: 'RFQ', meaning: 'Request for Quotation: asking a vendor for a price. Can be sent to several vendors to compare.' },
    { term: 'Purchase order (PO)', meaning: 'A confirmed order to a vendor: a legal commitment to buy.' },
    { term: 'Three-way match', meaning: 'PO quantity = received quantity = billed quantity before paying.' },
    { term: 'Stock interim (received)', meaning: 'A temporary account holding the value of goods received but not yet billed.' },
    { term: 'Lead time', meaning: 'Days between ordering and receiving. Drives when to reorder.' },
    { term: 'Reorder point / min-max', meaning: 'When forecast stock reaches the minimum, order enough to get back to the maximum.' },
    { term: 'Forecast', meaning: 'On hand − reserved + incoming: what we will have after pending moves.' },
    { term: 'Landed cost', meaning: 'Freight, customs and insurance added to the product cost (not built in NexusERP).' },
  ],
  accounting: [
    { event: 'Receipt validated', debit: '110100 Inventory', credit: '110200 Stock Interim (Received)', why: 'Goods are ours; the bill hasn’t arrived yet.' },
    { event: 'Vendor bill posted', debit: '110200 Stock Interim + 131000 VAT Receivable', credit: '211000 Accounts Payable', why: 'We now owe the vendor; the VAT we paid is reclaimable.' },
    { event: 'Vendor paid', debit: '211000 Accounts Payable', credit: '101000 Bank', why: 'The debt is settled. No profit impact.' },
  ],
  integrations: [
    { module: 'Inventory', how: 'POs create receipts; receipts update stock and average cost.' },
    { module: 'Accounting', how: 'Bills and payments; VAT receivable.' },
    { module: 'Sales & Manufacturing', how: 'Their demand drives replenishment suggestions.' },
  ],
  kpis: [
    { name: 'DPO (days payable outstanding)', formula: 'Payables ÷ purchases × days', why: 'How long we take to pay vendors.' },
    { name: 'Vendor on-time delivery', formula: 'On-time receipts ÷ receipts', why: 'Vendor reliability.' },
    { name: 'Purchase price variance', formula: 'Actual price − standard/expected price', why: 'Negotiation results and inflation.' },
  ],
  bestPractices: [
    'Never pay a bill that does not match a receipt (three-way match).',
    'Set a main vendor and reorder points on stocked products so replenishment can work.',
    'Compare at least two RFQs for significant purchases.',
  ],
  mistakes: [
    'Creating bills for goods not yet received: you may pay for goods that never arrive.',
    'Treating stock purchases as expenses: profit is understated now and overstated when goods are sold.',
  ],
  consultant: {
    questions: ['Who approves purchases, and above which amount?', 'Do you buy against sales orders or for stock?', 'Do vendors invoice before or after delivery?', 'Do you import (customs, freight)?'],
    data: ['Vendors with payment terms and bank details', 'Vendor prices / lead times', 'Open purchase orders', 'Unpaid vendor bills (opening payables)'],
    configure: ['Purchase approval rules', 'Bill control policy (ordered vs received)', 'Reorder rules', 'Purchase taxes'],
  },
  tryIt: [
    { label: 'Purchase Orders', to: '/purchases' },
    { label: 'Replenishment', to: '/replenishment' },
    { label: 'Vendor Bills', to: '/bills' },
  ],
  scenarios: ['buy'],
  quiz: [
    { q: 'What is three-way matching?', options: ['Three vendors per RFQ', 'PO = receipt = bill before paying', 'Three approvals', 'Three payments'], answer: 1, why: 'You only pay for what was ordered and actually received.' },
    { q: 'Buying $1,000 of stock and paying cash changes profit by…', options: ['−$1,000', '+$1,000', '$0', '−$200'], answer: 2, why: 'Cash becomes inventory: one asset swaps for another. Profit moves only when goods are sold.' },
    { q: 'Which account waits for the vendor bill after a receipt?', options: ['Bank', 'Stock Interim (Received)', 'Sales', 'Equity'], answer: 1, why: 'The interim account bridges the receipt and the bill, then nets to zero.' },
  ],
}

export const inventory: Chapter = {
  slug: 'inventory',
  number: 5,
  title: 'Inventory & Warehouse',
  department: 'Operations',
  icon: 'Boxes',
  color: 'yellow',
  minutes: 20,
  summary: 'Where goods are, how they move, and what they are worth.',
  goals: [
    'Understand locations and stock moves',
    'Read on hand, reserved, available, incoming and forecast',
    'Know the valuation methods (standard, average, FIFO)',
    'Run a physical count and understand its accounting',
  ],
  intro: [
    'Modern ERPs never just overwrite a quantity. Every change is a stock move from one location to another: Vendors → WH/Stock (receipt), WH/Stock → Customers (delivery), Inventory adjustment → WH/Stock (count correction). On-hand quantity is simply everything that moved in minus everything that moved out, which gives a full audit trail.',
    'Inventory is also an asset in the balance sheet. With perpetual valuation, each move posts its value immediately, so the Inventory account always equals the stock report.',
  ],
  roles: [
    { name: 'Warehouse manager', does: 'Organises locations, picking and counting.' },
    { name: 'Storekeeper / picker', does: 'Receives, picks, packs and ships.' },
    { name: 'Inventory controller', does: 'Runs counts and analyses differences.' },
  ],
  concepts: [
    { term: 'Warehouse & locations', meaning: 'Physical places (WH/Stock, shelves) and virtual ones (Customers, Vendors, Production, Inventory adjustment).' },
    { term: 'Stock move / transfer', meaning: 'A document moving goods between locations. Receipts, deliveries, returns and adjustments are all transfers.' },
    { term: 'On hand / reserved / available', meaning: 'Physically there / promised to orders / free to promise (on hand − reserved).' },
    { term: 'Incoming / forecast', meaning: 'Ordered from vendors / available + incoming.' },
    { term: 'Valuation: Standard cost', meaning: 'A fixed cost per product; differences go to a variance account.' },
    { term: 'Valuation: Average cost (AVCO)', meaning: 'Cost is re-averaged at each receipt. NexusERP uses AVCO.' },
    { term: 'Valuation: FIFO', meaning: 'First in, first out: goods sold are valued at the oldest purchase prices.' },
    { term: 'Perpetual vs periodic', meaning: 'Perpetual posts value at every move; periodic adjusts stock value once per period after a count.' },
    { term: 'Lots & serial numbers', meaning: 'Track batches (food, chemicals) or individual units (electronics) for traceability. Standard in real ERPs.' },
    { term: 'Picking strategies', meaning: 'FIFO/FEFO removal, one-step or multi-step (pick → pack → ship) deliveries.' },
  ],
  accounting: [
    { event: 'Count finds fewer units', debit: '630000 Inventory Differences (expense)', credit: '110100 Inventory', why: 'Lost or broken goods are a cost.' },
    { event: 'Count finds more units', debit: '110100 Inventory', credit: '630000 Inventory Differences', why: 'Found goods increase stock value.' },
    { event: 'Opening stock', debit: '110100 Inventory', credit: '301000 Capital / opening balance', why: 'Initial stock brought by the owners at go-live.' },
  ],
  integrations: [
    { module: 'Sales / Purchasing', how: 'Deliveries and receipts are created from orders.' },
    { module: 'Manufacturing', how: 'Components consumed, finished goods produced.' },
    { module: 'Accounting', how: 'Every valued move posts to Inventory.' },
  ],
  kpis: [
    { name: 'Inventory turnover', formula: 'COGS ÷ average inventory value', why: 'How many times stock is renewed per year.' },
    { name: 'Days of inventory', formula: '365 ÷ turnover', why: 'How long goods sit before being sold.' },
    { name: 'Stock accuracy', formula: 'Correct counts ÷ counted items', why: 'Reliability of system quantities.' },
    { name: 'Stock-out rate', formula: 'Orders delayed by missing stock ÷ orders', why: 'Service level to customers.' },
  ],
  bestPractices: [
    'Count regularly (cycle counts) rather than once a year.',
    'Validate transfers when goods physically move, not before.',
    'Keep the Inventory account reconciled with the stock valuation report.',
  ],
  mistakes: [
    'Editing quantities directly instead of using adjustments: no audit trail.',
    'Validating deliveries before shipping “to save time”: stock and accounting become wrong.',
  ],
  consultant: {
    questions: ['How many warehouses and locations?', 'Do you need lots, serial numbers or expiry dates?', 'Which valuation method do your accountants use?', 'How often do you count stock?'],
    data: ['Opening quantities per location', 'Product costs at go-live', 'Lots/serials if tracked'],
    configure: ['Warehouses & locations', 'Routes (1, 2 or 3-step)', 'Valuation method and accounts', 'Reorder rules'],
  },
  tryIt: [
    { label: 'Stock (try Count)', to: '/stock' },
    { label: 'Transfers', to: '/transfers' },
  ],
  scenarios: ['close'],
  quiz: [
    { q: 'On hand 20, reserved 5, incoming 10. What is available?', options: ['20', '15', '25', '35'], answer: 1, why: 'Available = on hand − reserved = 15. Forecast would be 25.' },
    { q: 'You bought 10 units at $100 and 10 at $120. AVCO cost?', options: ['$100', '$110', '$120', '$220'], answer: 1, why: 'Weighted average: (10×100 + 10×120) ÷ 20 = $110.' },
    { q: 'A count finds 2 broken chairs. Which account is debited?', options: ['Inventory', 'Inventory Differences (expense)', 'Sales', 'Bank'], answer: 1, why: 'The loss is an expense; Inventory is credited.' },
  ],
}

export const manufacturing: Chapter = {
  slug: 'manufacturing',
  number: 6,
  title: 'Manufacturing',
  department: 'Operations',
  icon: 'Factory',
  color: 'purple',
  minutes: 15,
  summary: 'Turning components into finished products with bills of materials and manufacturing orders, and knowing what they really cost.',
  goals: [
    'Read a bill of materials (BoM)',
    'Follow a manufacturing order from plan to production',
    'Understand MRP and make-to-order vs make-to-stock',
    'See how manufacturing moves value inside inventory',
  ],
  intro: [
    'A bill of materials is the recipe of a product: which components, in which quantities. A manufacturing order (MO) says “make N units of this product using its BoM”. Producing consumes the components from stock and adds the finished goods.',
    'Manufacturing does not create profit by itself: the value of the components moves into the finished product. Profit appears when the finished product is sold above its cost.',
  ],
  roles: [
    { name: 'Production planner', does: 'Creates and schedules manufacturing orders.' },
    { name: 'Workshop operator', does: 'Builds products and records production.' },
    { name: 'Quality controller', does: 'Checks products (quality module in larger ERPs).' },
  ],
  process: [
    {
      title: 'Manufacturing order',
      steps: [
        { label: 'Plan', doc: 'Manufacturing order', who: 'Planner', effect: 'Quantity and BoM chosen; components checked' },
        { label: 'Confirm', doc: 'MO confirmed', who: 'Planner', effect: 'Work scheduled' },
        { label: 'Produce', doc: 'MO done', who: 'Workshop', effect: 'Components out, finished goods in; value moves inside Inventory' },
      ],
    },
  ],
  concepts: [
    { term: 'Bill of materials (BoM)', meaning: 'Components and quantities to make one (or N) units of a product.' },
    { term: 'Routing & work centers', meaning: 'The operations (cut, assemble, paint), where they happen and how long they take. Adds labour and machine cost (not built in NexusERP).' },
    { term: 'Manufacturing order (MO)', meaning: 'An instruction to produce a quantity from a BoM.' },
    { term: 'MRP', meaning: 'Material Requirements Planning: computes what to make and buy, and when, from demand and stock.' },
    { term: 'Make-to-stock vs make-to-order', meaning: 'Produce in advance to keep stock, or produce only when a customer orders.' },
    { term: 'Product cost', meaning: 'Sum of components (+ labour and overhead in full costing).' },
    { term: 'Scrap', meaning: 'Components wasted during production; recorded as a loss.' },
  ],
  accounting: [
    { event: 'Production done', debit: '110100 Inventory (finished goods)', credit: '110100 Inventory (components)', why: 'Value moves from components to the product. Total stock value is unchanged.' },
  ],
  integrations: [
    { module: 'Inventory', how: 'Consumes components, produces finished goods.' },
    { module: 'Purchasing', how: 'Missing components trigger replenishment.' },
    { module: 'Sales', how: 'Make-to-order sales create production needs.' },
  ],
  kpis: [
    { name: 'Production cost per unit', formula: 'Components (+ labour + overhead) ÷ units', why: 'Pricing and margin decisions.' },
    { name: 'On-time production', formula: 'MOs done on time ÷ MOs', why: 'Planning reliability.' },
    { name: 'Scrap rate', formula: 'Scrapped ÷ consumed', why: 'Waste and quality.' },
  ],
  bestPractices: [
    'Keep BoMs accurate and versioned: a wrong BoM means wrong stock and wrong costs.',
    'Check component availability before confirming production.',
  ],
  mistakes: [
    'Producing without recording consumption: components stay in stock on paper.',
    'Pricing products without knowing their real component cost.',
  ],
  consultant: {
    questions: ['Do you make to stock or to order?', 'How many levels do your BoMs have (sub-assemblies)?', 'Do you need to track labour time and machine cost?', 'Do you subcontract operations?'],
    data: ['Bills of materials', 'Work centers and routings', 'Component costs'],
    configure: ['BoMs', 'Routings and work centers', 'MRP / replenishment rules', 'Production locations'],
  },
  tryIt: [
    { label: 'Bills of Materials', to: '/boms' },
    { label: 'Manufacturing Orders', to: '/manufacturing' },
  ],
  scenarios: ['make'],
  quiz: [
    { q: 'What happens to total inventory value when you produce?', options: ['It goes up', 'It goes down', 'It stays the same', 'It becomes profit'], answer: 2, why: 'Components’ value moves into the finished product.' },
    { q: 'A BoM is…', options: ['A vendor bill', 'A product recipe', 'A customer invoice', 'A bank statement'], answer: 1, why: 'Bill of Materials = the components and quantities to make a product.' },
    { q: 'MRP is used to…', options: ['Pay salaries', 'Compute what to make and buy, and when', 'Close the books', 'Send invoices'], answer: 1, why: 'Material Requirements Planning turns demand into production and purchase suggestions.' },
  ],
}
