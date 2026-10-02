# NexusERP

A small Odoo-style ERP prototype for SMEs, built to **learn how an ERP works by using one**.
Every screen has a lesson card explaining the concept, and every business document shows the
stock moves and journal entries it produced.

Demo company: **Nexus Furniture**, an office-furniture seller with products, customers, opening stock and
six months of sales history.

## What's inside

| Area | Screens | Lesson |
|---|---|---|
| Overview | Dashboard (selling + buying pipelines), **Guided Scenarios** (5 auto-playing stories), **ERP Map**, **Glossary** (63 terms) | Step 1 |
| Master data | Contacts, Products (vendor, taxes, margin), Chart of Accounts | Step 2 |
| Sales | Quotations → Sales Orders with an **Order-to-Cash flow diagram**, credit limits | Step 3 |
| Purchasing | RFQs → Purchase Orders with a **Procure-to-Pay flow diagram**, three-way match, **Replenishment** | Step 4 |
| Inventory | Stock (on hand / reserved / available / incoming), physical **counts**, Transfers, average cost (AVCO) | Step 5 |
| Accounting | Customer invoices, vendor bills, payments in/out, manual entries (rent, salaries…), journal entries | Step 6 |
| Manufacturing | Bills of Materials, Manufacturing Orders (consume components, produce finished goods) | Step 7 |
| Reports | **Profit & Loss**, **Balance Sheet**, **Who Owes Whom** (aged receivables / payables) | Step 6 |

Coming next: HR & payroll, multi-warehouse, PDF documents.

## Stack

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4, Framer Motion, Lucide icons. Apple-style dark UI.
- **Backend:** Django 5.2 + Django REST Framework + SimpleJWT.
- **Database:** PostgreSQL 17.

```
backend/
  config/       settings, urls
  masterdata/   partners, products, categories, taxes, payment terms, sequences (+ seed_demo command)
  accounting/   chart of accounts, journals, journal entries/invoices/bills, payments, reports.py
  inventory/    warehouses, locations, transfers, stock moves
  sales/        quotations / sales orders and the Order-to-Cash services
  purchase/     RFQs / purchase orders, vendor bills, replenishment (Procure-to-Pay)
  mrp/          bills of materials and manufacturing orders
  scenarios/    guided scenarios: engine.py (runs a step, reports its effects) and library.py (the 5 stories)
  accounts/     auth "me" endpoint and dashboard
frontend/src/
  pages/        one file per screen
  components/   UI kit (cards, sheets, pills), journal entry view, layout
  lib/          API client (JWT), types, formatting
```

Business rules live in each app's `services.py` (e.g. `sales/services.py: confirm, create_invoice`).

Run the backend tests (they seed a fresh demo company in a throwaway database):

```powershell
cd backend
.\.venv\Scripts\python manage.py test
```

## Setup (Windows)

Prerequisites: Git, Python 3.13, Node 22+, PostgreSQL 17.

```powershell
# 1. Database (any Postgres works; set the credentials in backend/.env)
#    createdb nexuserp

# 2. Backend
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
copy .env.example .env        # then edit DB_PASSWORD and DJANGO_SECRET_KEY
.\.venv\Scripts\python manage.py migrate
.\.venv\Scripts\python manage.py seed_demo   # creates the demo company and user "demo"
                                             # (re-run after pulling updates: it only adds what is missing)
.\.venv\Scripts\python manage.py runserver

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in as `demo`. `seed_demo` writes the generated password to
`backend/.env` (`DEMO_PASSWORD`), or uses `DEMO_PASSWORD` if you set it beforehand.

On the original dev machine, `scripts/dev.ps1` starts the local Postgres cluster, the API and the UI in one go.

## How the accounting works

| Event | Journal | Debit | Credit |
|---|---|---|---|
| Opening stock | STJ | 110100 Inventory | 301000 Capital |
| Delivery validated | STJ | 500000 Cost of Goods Sold | 110100 Inventory |
| Invoice posted | INV | 121000 Receivable | 400000 Sales + 251000 VAT Payable |
| Payment received | BNK | 101000 Bank | 121000 Receivable |
| Receipt validated | STJ | 110100 Inventory | 110200 Stock Interim |
| Vendor bill posted | BILL | 110200 Stock Interim + 131000 VAT Receivable | 211000 Payable |
| Payment sent | BNK | 211000 Payable | 101000 Bank |
| Manufacturing order produced | STJ | 110100 Inventory (finished good) | 110100 Inventory (components) |
| Stock count shortage | STJ | 630000 Inventory Differences | 110100 Inventory |
| Rent / salaries (manual) | MISC | 610000 / 620000 Expense | 101000 Bank |

Accounts come from master data: product category (income, COGS, stock valuation), tax (VAT account),
contact (receivable), journal (bank account).
