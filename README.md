# NexusERP

A small Odoo-style ERP prototype for SMEs, built to **learn how an ERP works by using one**.
Every screen has a lesson card explaining the concept, and every business document shows the
stock moves and journal entries it produced.

Demo company: **Nexus Furniture**, an office-furniture seller with products, customers, opening stock and
six months of sales history.

## What's inside

| Area | Screens | Lesson |
|---|---|---|
| Overview | Dashboard, **ERP Map** (animated "one order flows through every module") | Step 1 |
| Master data | Contacts, Products, Chart of Accounts (live balances + accounting equation) | Step 2 |
| Sales | Quotations → Sales Orders with an **Order-to-Cash flow diagram** | Step 3 |
| Inventory | Stock (on hand / reserved / available), Transfers | Step 5 |
| Accounting | Customer invoices, payments, journal entries (double-entry, perpetual inventory) | Step 6 |

Coming next: Purchasing (Procure-to-Pay), Manufacturing, reports.

## Stack

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4, Framer Motion, Lucide icons. Apple-style dark UI.
- **Backend:** Django 5.2 + Django REST Framework + SimpleJWT.
- **Database:** PostgreSQL 17.

```
backend/
  config/       settings, urls
  masterdata/   partners, products, categories, taxes, payment terms, sequences (+ seed_demo command)
  accounting/   chart of accounts, journals, journal entries/invoices, payments
  inventory/    warehouses, locations, transfers, stock moves
  sales/        quotations / sales orders and the Order-to-Cash services
  accounts/     auth "me" endpoint and dashboard
frontend/src/
  pages/        one file per screen
  components/   UI kit (cards, sheets, pills), journal entry view, layout
  lib/          API client (JWT), types, formatting
```

Business rules live in each app's `services.py` (e.g. `sales/services.py: confirm, create_invoice`).

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
| Payment registered | BNK | 101000 Bank | 121000 Receivable |

Accounts come from master data: product category (income, COGS, stock valuation), tax (VAT account),
contact (receivable), journal (bank account).
