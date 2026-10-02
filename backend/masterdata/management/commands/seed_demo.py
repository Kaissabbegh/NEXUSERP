"""Load the "Nexus Furniture" demo company used throughout the ERP lessons.

Run on an empty database:  python manage.py seed_demo
"""

import os
import secrets
from datetime import timedelta
from decimal import Decimal as D

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounting import services as acc
from accounting.models import Account, Journal, Move
from crm.models import Lead
from fixedassets import services as assets
from fixedassets.models import FixedAsset
from hr.models import Department, Employee, ExpenseClaim
from inventory import services as stock
from inventory.models import Location, Picking, Warehouse
from masterdata.models import Partner, PaymentTerm, Product, ProductCategory, Tax, UnitOfMeasure
from mrp import services as mrp
from mrp.models import BillOfMaterials, BomLine, ManufacturingOrder
from purchase import services as purchase
from purchase.models import PurchaseOrder, PurchaseOrderLine
from sales import services as sales
from sales.models import SaleOrder, SaleOrderLine

T = Account.Type
ACCOUNTS = [
    ("101000", "Bank", T.CASH, "Money in the company's bank account."),
    ("102000", "Cash", T.CASH, "Physical cash in the till."),
    ("110100", "Inventory (Stock Valuation)", T.CURRENT_ASSET,
     "Value of goods sitting in the warehouse. Goes down when goods are delivered."),
    ("110200", "Stock Interim (Received)", T.CURRENT_ASSET,
     "Temporary account for goods received but not yet billed by the vendor."),
    ("121000", "Accounts Receivable", T.RECEIVABLE, "Money customers owe us for invoices not yet paid."),
    ("131000", "VAT Receivable", T.CURRENT_ASSET, "VAT we paid on purchases and can reclaim."),
    ("151000", "Office Equipment", T.FIXED_ASSET, "Long-term assets such as computers and vehicles."),
    ("211000", "Accounts Payable", T.PAYABLE, "Money we owe vendors for bills not yet paid."),
    ("251000", "VAT Payable", T.CURRENT_LIABILITY, "VAT collected from customers that we must pay to the state."),
    ("301000", "Owner's Capital / Opening Balance", T.EQUITY, "What the owners put into the business."),
    ("400000", "Product Sales", T.INCOME, "Revenue from selling furniture."),
    ("410000", "Service Revenue", T.INCOME, "Revenue from delivery, assembly and design services."),
    ("500000", "Cost of Goods Sold", T.COST_OF_REVENUE,
     "What the goods we sold cost us. Revenue − COGS = gross margin."),
    ("610000", "Rent", T.EXPENSE, "Office and warehouse rent."),
    ("620000", "Salaries", T.EXPENSE, "Employee wages."),
]

PRODUCTS = [
    # sku, name, category, type, price, cost, reorder_min, opening qty
    ("DESK-001", "Oak Executive Desk", "Desks", "storable", 890, 520, 3, 14),
    ("DESK-002", "Standing Desk Pro", "Desks", "storable", 640, 360, 4, 22),
    ("DESK-003", "Compact Study Desk", "Desks", "storable", 240, 130, 5, 6),
    ("CHAIR-001", "Ergonomic Mesh Chair", "Chairs", "storable", 320, 165, 8, 40),
    ("CHAIR-002", "Leather Manager Chair", "Chairs", "storable", 540, 290, 4, 9),
    ("CHAIR-003", "Visitor Chair", "Chairs", "storable", 95, 42, 10, 60),
    ("STOR-001", "Steel Filing Cabinet", "Storage", "storable", 210, 110, 5, 18),
    ("STOR-002", "Walnut Bookshelf", "Storage", "storable", 380, 205, 3, 4),
    ("TABLE-001", "Conference Table 10-Seat", "Tables", "storable", 2150, 1280, 1, 3),
    ("SRV-DEL", "Delivery & Installation", "Services", "service", 75, 0, 0, 0),
    ("SRV-DSN", "Office Layout Design (hour)", "Services", "service", 60, 0, 0, 0),
]

CUSTOMERS = [
    ("Atlas Consulting", "Casablanca", "contact@atlas-consulting.example", "30 Days", 25000),
    ("Brightline Studio", "Rabat", "hello@brightline.example", "15 Days", 10000),
    ("Cedar & Co. Law Firm", "Marrakech", "office@cedarco.example", "30 Days", 0),
    ("Delta Logistics", "Tangier", "procurement@delta-log.example", "45 Days", 50000),
    ("Echo Coworking", "Casablanca", "team@echo-cowork.example", "Immediate Payment", 5000),
]

VENDORS = [
    ("Woodcraft Supplies", "Fès", "sales@woodcraft.example"),
    ("SteelForm Industries", "Kenitra", "orders@steelform.example"),
]


class Command(BaseCommand):
    help = "Seed the Nexus Furniture demo company."

    def handle(self, *args, **opts):
        fresh = not Account.objects.exists()
        with transaction.atomic():
            if fresh:
                self.chart_of_accounts()
                self.masterdata()
                self.warehouse()
                self.opening_stock()
                self.history()
            # Later lessons (purchasing, manufacturing, expenses). Each step is skipped if already loaded,
            # so this also upgrades a database seeded by an earlier version.
            self.purchasing_setup()
            self.manufacturing_setup()
            self.owner_and_expenses()
            self.purchase_history()
            self.manufacturing_history()
            self.departments_setup()
            self.crm_history()
            self.hr_history()
            self.assets_history()
        self.demo_user()
        self.stdout.write(self.style.SUCCESS("Nexus Furniture demo data " + ("loaded." if fresh else "upgraded.")))

    # --- Step 2: master data --------------------------------------------------------------
    def chart_of_accounts(self):
        for code, name, typ, desc in ACCOUNTS:
            Account.objects.create(code=code, name=name, account_type=typ, description=desc)
        a = Account.objects.get
        for code, name, typ, default in [
            ("INV", "Customer Invoices", Journal.Type.SALE, "400000"),
            ("BILL", "Vendor Bills", Journal.Type.PURCHASE, "500000"),
            ("BNK", "Bank", Journal.Type.BANK, "101000"),
            ("CSH", "Cash", Journal.Type.CASH, "102000"),
            ("STJ", "Inventory Valuation", Journal.Type.GENERAL, None),
            ("MISC", "Miscellaneous Operations", Journal.Type.GENERAL, None),
        ]:
            Journal.objects.create(code=code, name=name, journal_type=typ, default_account=a(code=default) if default else None)

    def masterdata(self):
        a = Account.objects.get
        for name, days in [("Immediate Payment", 0), ("15 Days", 15), ("30 Days", 30), ("45 Days", 45)]:
            PaymentTerm.objects.create(name=name, days=days)
        self.vat20 = Tax.objects.create(name="VAT 20%", rate=20, scope=Tax.Scope.SALE, account=a(code="251000"))
        Tax.objects.create(name="VAT 10%", rate=10, scope=Tax.Scope.SALE, account=a(code="251000"))
        Tax.objects.create(name="VAT 20% (purchases)", rate=20, scope=Tax.Scope.PURCHASE, account=a(code="131000"))

        units = {n: UnitOfMeasure.objects.create(name=n) for n in ["Unit", "Hour", "Box of 10"]}
        cats = {}
        for name in ["Desks", "Chairs", "Storage", "Tables"]:
            cats[name] = ProductCategory.objects.create(
                name=name, income_account=a(code="400000"), expense_account=a(code="500000"),
                stock_valuation_account=a(code="110100"),
            )
        cats["Services"] = ProductCategory.objects.create(
            name="Services", income_account=a(code="410000"), expense_account=a(code="500000"),
            stock_valuation_account=a(code="110100"),
        )
        for i, (sku, name, cat, typ, price, cost, rmin, _) in enumerate(PRODUCTS, start=1):
            Product.objects.create(
                sku=sku, name=name, category=cats[cat], product_type=typ, sale_price=price, cost=cost,
                reorder_min=rmin, uom=units["Hour" if sku == "SRV-DSN" else "Unit"], sale_tax=self.vat20,
                barcode="" if typ == "service" else f"61100000{i:04d}",
            )

        rec, pay = a(code="121000"), a(code="211000")
        terms = {t.name: t for t in PaymentTerm.objects.all()}
        for name, city, email, term, limit in CUSTOMERS:
            Partner.objects.create(name=name, city=city, country="Morocco", email=email, is_customer=True,
                                   payment_term=terms[term], credit_limit=limit, receivable_account=rec,
                                   payable_account=pay)
        for name, city, email in VENDORS:
            Partner.objects.create(name=name, city=city, country="Morocco", email=email, is_vendor=True,
                                   payment_term=terms["30 Days"], receivable_account=rec, payable_account=pay)

    def warehouse(self):
        wh = Warehouse.objects.create(code="WH", name="Main Warehouse")
        Location.objects.create(name="Stock", usage=Location.Usage.INTERNAL, warehouse=wh)
        Location.objects.create(name="Customers", usage=Location.Usage.CUSTOMER)
        Location.objects.create(name="Vendors", usage=Location.Usage.SUPPLIER)
        Location.objects.create(name="Inventory adjustment", usage=Location.Usage.INVENTORY)

    def opening_stock(self):
        lines = [{"product": Product.objects.get(sku=sku), "quantity": D(qty)} for sku, *_, qty in PRODUCTS if qty]
        self._opening(lines)

    def _opening(self, lines):
        """Opening stock is funded by the owners (equity), not an expense."""
        picking = stock.create_picking(Picking.Kind.ADJUSTMENT, lines, origin="Opening stock",
                                       counterpart_account=Account.objects.get(code="301000"))
        stock.validate(picking)

    # --- Step 3: a few months of Order-to-Cash history ---------------------------------------
    def history(self):
        today = timezone.localdate()
        customers = {p.name: p for p in Partner.objects.filter(is_customer=True)}
        p = {x.sku: x for x in Product.objects.all()}
        scenarios = [
            # customer, lines, months_ago, stage
            ("Atlas Consulting", [("DESK-001", 4), ("CHAIR-002", 4), ("SRV-DEL", 1)], 5, "paid"),
            ("Delta Logistics", [("CHAIR-001", 12), ("DESK-002", 6)], 4, "paid"),
            ("Brightline Studio", [("DESK-003", 3), ("STOR-002", 2)], 3, "paid"),
            ("Cedar & Co. Law Firm", [("TABLE-001", 1), ("CHAIR-003", 10), ("SRV-DSN", 6)], 2, "paid"),
            ("Delta Logistics", [("STOR-001", 8), ("CHAIR-001", 6)], 1, "partial"),
            ("Atlas Consulting", [("DESK-002", 4), ("CHAIR-001", 4)], 0, "invoiced"),
            ("Echo Coworking", [("CHAIR-003", 12), ("DESK-003", 1)], 0, "delivered"),
            ("Brightline Studio", [("CHAIR-001", 2), ("SRV-DEL", 1)], 0, "confirmed"),
            ("Cedar & Co. Law Firm", [("CHAIR-002", 3), ("STOR-002", 1)], 0, "quotation"),
        ]
        for name, items, months_ago, stage in scenarios:
            day = (today - timedelta(days=30 * months_ago)).replace(day=10) if months_ago else today
            partner = customers[name]
            order = SaleOrder.objects.create(name=sales.new_order_name(), partner=partner, date_order=day,
                                             payment_term=partner.payment_term)
            for sku, qty in items:
                prod = p[sku]
                SaleOrderLine.objects.create(order=order, product=prod, description=prod.name, quantity=qty,
                                             price_unit=prod.sale_price, tax=prod.sale_tax)
            order.compute_amounts()
            if stage == "quotation":
                continue
            sales.confirm(order)
            if stage == "confirmed":
                continue
            for picking in order.pickings.all():
                stock.validate(picking)
            if stage == "delivered":
                continue
            invoice = sales.create_invoice(order)
            invoice.date = day + timedelta(days=2)
            invoice.invoice_date_due = acc.due_date(invoice.date, partner)
            invoice.save(update_fields=["date", "invoice_date_due"])
            acc.post(invoice)
            if stage == "paid":
                acc.register_payment(invoice)
            elif stage == "partial":
                acc.register_payment(Move.objects.get(pk=invoice.pk), (invoice.amount_total / 2).quantize(D("0.01")))

    # --- Step 4: purchasing ----------------------------------------------------------------
    def purchasing_setup(self):
        Account.objects.get_or_create(code="630000", defaults=dict(
            name="Inventory Differences", account_type=T.EXPENSE,
            description="Stock lost, broken or found during physical counts."))
        Location.objects.get_or_create(usage=Location.Usage.PRODUCTION, defaults={"name": "Production"})
        vat_purchase = Tax.objects.filter(scope=Tax.Scope.PURCHASE).order_by("rate").last()
        vendors = {p.name: p for p in Partner.objects.filter(is_vendor=True)}
        wood, steel = vendors.get("Woodcraft Supplies"), vendors.get("SteelForm Industries")
        for p in Product.objects.exclude(product_type=Product.Type.SERVICE).select_related("category"):
            changed = []
            if p.purchase_tax_id is None:
                p.purchase_tax, changed = vat_purchase, changed + ["purchase_tax"]
            if p.vendor_id is None:
                p.vendor = steel if p.category.name in ("Chairs", "Storage") else wood
                changed.append("vendor")
            if changed:
                p.save(update_fields=changed)

    # --- Step 7: manufacturing -------------------------------------------------------------
    def manufacturing_setup(self):
        if ProductCategory.objects.filter(name="Components").exists():
            return
        a = Account.objects.get
        cat = ProductCategory.objects.create(name="Components", income_account=a(code="400000"),
                                             expense_account=a(code="500000"), stock_valuation_account=a(code="110100"))
        unit = UnitOfMeasure.objects.get(name="Unit")
        vat_purchase = Tax.objects.filter(scope=Tax.Scope.PURCHASE).order_by("rate").last()
        wood = Partner.objects.get(name="Woodcraft Supplies")
        steel = Partner.objects.get(name="SteelForm Industries")
        comps = {}
        for sku, name, cost, vendor, rmin, qty in [
            ("COMP-001", "Oak Desktop Panel", 270, wood, 4, 8),
            ("COMP-002", "Steel Desk Frame", 180, steel, 4, 6),
            ("COMP-003", "Hardware Kit (screws, brackets)", 20, steel, 10, 30),
            ("COMP-004", "Electric Lift Column", 140, steel, 4, 3),
        ]:
            comps[sku] = Product.objects.create(
                sku=sku, name=name, category=cat, product_type=Product.Type.STORABLE, cost=cost, sale_price=0,
                uom=unit, purchase_tax=vat_purchase, vendor=vendor, reorder_min=rmin,
                description="Component used in manufacturing; not sold on its own.",
            )
        self._opening([{"product": comps[s], "quantity": D(q)} for s, q in
                       [("COMP-001", 8), ("COMP-002", 6), ("COMP-003", 30), ("COMP-004", 3)]])
        for sku, recipe in [
            ("DESK-001", [("COMP-001", 1), ("COMP-002", 1), ("COMP-003", 1)]),
            ("DESK-002", [("COMP-001", 1), ("COMP-002", 1), ("COMP-004", 2), ("COMP-003", 2)]),
        ]:
            bom = BillOfMaterials.objects.create(product=Product.objects.get(sku=sku), quantity=1, code=f"BOM-{sku}")
            for comp, qty in recipe:
                BomLine.objects.create(bom=bom, component=comps[comp], quantity=qty)

    # --- Step 6: money in from owners, money out for running costs ---------------------------
    def owner_and_expenses(self):
        if Move.objects.filter(journal__code="MISC").exists():
            return
        a = Account.objects.get
        today = timezone.localdate()
        acc.create_entry("MISC", [
            acc.LineSpec(a(code="101000"), debit=D(20000), name="Owner cash investment"),
            acc.LineSpec(a(code="301000"), credit=D(20000), name="Owner cash investment"),
        ], ref="Capital injection", date=(today - timedelta(days=180)).replace(day=1))
        for months_ago in (3, 2, 1):
            day = (today - timedelta(days=30 * months_ago)).replace(day=28)
            for code, amount, label in [("610000", 1500, "Warehouse rent"), ("620000", 4200, "Salaries")]:
                acc.create_entry("MISC", [
                    acc.LineSpec(a(code=code), debit=D(amount), name=f"{label} {day:%B}"),
                    acc.LineSpec(a(code="101000"), credit=D(amount), name=f"{label} {day:%B}"),
                ], ref=f"{label} {day:%b %Y}", date=day)

    def purchase_history(self):
        if PurchaseOrder.objects.exists():
            return
        today = timezone.localdate()
        p = {x.sku: x for x in Product.objects.all()}
        vendors = {v.name: v for v in Partner.objects.filter(is_vendor=True)}
        scenarios = [
            # vendor, lines (sku, qty, price), days ago, stage
            ("Woodcraft Supplies", [("COMP-001", 6, 265)], 70, "paid"),
            ("SteelForm Industries", [("CHAIR-001", 10, 158)], 40, "billed"),
            ("SteelForm Industries", [("COMP-002", 6, 182), ("COMP-004", 4, 145)], 5, "confirmed"),
            ("Woodcraft Supplies", [("STOR-002", 4, 200), ("DESK-003", 6, 125)], 0, "rfq"),
        ]
        for vendor_name, items, days_ago, stage in scenarios:
            vendor, day = vendors[vendor_name], today - timedelta(days=days_ago)
            order = PurchaseOrder.objects.create(name=purchase.new_order_name(), partner=vendor, date_order=day,
                                                 date_planned=day + timedelta(days=7), payment_term=vendor.payment_term)
            for sku, qty, price in items:
                PurchaseOrderLine.objects.create(order=order, product=p[sku], description=p[sku].name, quantity=qty,
                                                 price_unit=price, tax=p[sku].purchase_tax)
            order.compute_amounts()
            if stage == "rfq":
                continue
            purchase.confirm(order)
            if stage == "confirmed":
                continue
            for picking in order.pickings.all():
                stock.validate(picking)
            bill = purchase.create_bill(order)
            bill.date = day + timedelta(days=3)
            bill.invoice_date_due = acc.due_date(bill.date, vendor)
            bill.save(update_fields=["date", "invoice_date_due"])
            acc.post(bill)
            if stage == "paid":
                acc.register_payment(bill, date=bill.invoice_date_due)

    def manufacturing_history(self):
        if ManufacturingOrder.objects.exists():
            return
        desk = BillOfMaterials.objects.get(product__sku="DESK-001")
        done = mrp.create(desk, D(2), origin="Restock showroom")
        mrp.confirm(done)
        mrp.produce(done)
        standing = BillOfMaterials.objects.get(product__sku="DESK-002")
        mrp.confirm(mrp.create(standing, D(1), origin="Customer special order"))
    # --- Full SME: extra accounts, CRM, HR, fixed assets ----------------------------------------
    def departments_setup(self):
        for code, name, typ, desc in [
            ("152000", "Accumulated Depreciation", T.FIXED_ASSET,
             "Wear and tear already booked on fixed assets. A negative asset: it reduces their book value."),
            ("153000", "Vehicles", T.FIXED_ASSET, "Company vans and cars."),
            ("254000", "Social Security Payable", T.CURRENT_LIABILITY, "Payroll contributions owed to social security."),
            ("255000", "Income Tax Withheld", T.CURRENT_LIABILITY, "Income tax kept from salaries, owed to the tax office."),
            ("256000", "Salaries Payable", T.CURRENT_LIABILITY, "Net salaries owed to employees until payday."),
            ("257000", "Employee Expenses Payable", T.CURRENT_LIABILITY, "Money owed to employees for expenses they paid."),
            ("621000", "Employer Social Charges", T.EXPENSE, "The company's own payroll contributions on top of gross salaries."),
            ("640000", "Travel & Fuel", T.EXPENSE, "Business trips, hotels, fuel."),
            ("650000", "Office Supplies", T.EXPENSE, "Paper, small equipment, consumables."),
            ("681000", "Depreciation Expense", T.EXPENSE, "The monthly cost of using fixed assets."),
        ]:
            Account.objects.get_or_create(code=code, defaults=dict(name=name, account_type=typ, description=desc))
        Journal.objects.get_or_create(code="SAL", defaults=dict(name="Payroll", journal_type=Journal.Type.GENERAL))

    def crm_history(self):
        if Lead.objects.exists():
            return
        for name, company, contact, source, revenue, stage in [
            ("Furnish new head office (40 desks)", "Orion Bank", "Sara Idrissi", "Trade show", 38000, "new"),
            ("Ergonomic chairs for call center", "Callify", "Omar Benali", "Website", 9600, "qualified"),
            ("Meeting room upgrade", "Atlas Consulting", "Karim Alaoui", "Existing customer", 4300, "qualified"),
            ("Co-working space expansion", "Echo Coworking", "Lina Tazi", "Referral", 7200, "proposition"),
            ("Law library shelving", "Cedar & Co. Law Firm", "Youssef Amrani", "Existing customer", 2280, "won"),
            ("School furniture tender", "Green Valley School", "Nadia Fassi", "Public tender", 15500, "lost"),
        ]:
            Lead.objects.create(name=name, company_name=company, contact_name=contact, source=source,
                                expected_revenue=revenue, stage=stage, probability=Lead.PROBABILITY[stage],
                                partner=Partner.objects.filter(name=company).first(),
                                lost_reason="Price too high vs competitor" if stage == "lost" else "")

    def hr_history(self):
        if Employee.objects.exists():
            return
        today = timezone.localdate()
        depts = {n: Department.objects.create(name=n) for n in ["Management", "Sales", "Warehouse", "Workshop", "Finance"]}
        for name, title, dept, wage, years in [
            ("Amina Haddad", "General Manager", "Management", 4800, 6),
            ("Youssef Karimi", "Sales Representative", "Sales", 2400, 3),
            ("Salma Bennani", "Sales Representative", "Sales", 2300, 1),
            ("Hassan Ouali", "Warehouse Lead", "Warehouse", 2100, 4),
            ("Rachid Mansouri", "Furniture Assembler", "Workshop", 1900, 2),
            ("Leila Chraibi", "Accountant", "Finance", 2700, 5),
        ]:
            Employee.objects.create(name=name, job_title=title, department=depts[dept], wage=wage,
                                    hire_date=today.replace(year=today.year - years, day=1),
                                    email=f"{name.split()[0].lower()}@nexusfurniture.example")
        employees = {e.name: e for e in Employee.objects.all()}
        travel, supplies = Account.objects.get(code="640000"), Account.objects.get(code="650000")
        ExpenseClaim.objects.create(employee=employees["Youssef Karimi"], description="Fuel – client visits Rabat",
                                    account=travel, amount=85, date=today - timedelta(days=6))
        ExpenseClaim.objects.create(employee=employees["Leila Chraibi"], description="Printer paper and toner",
                                    account=supplies, amount=64, date=today - timedelta(days=3))

    def assets_history(self):
        if FixedAsset.objects.exists():
            return
        today = timezone.localdate()
        start = (today - timedelta(days=95)).replace(day=1)
        laptops = FixedAsset.objects.create(name="Office laptops (6)", account=Account.objects.get(code="151000"),
                                            value=D(7200), acquisition_date=start, useful_life_months=36)
        a = Account.objects.get
        tech, _ = Partner.objects.get_or_create(name="TechZone Electronics", defaults=dict(
            city="Casablanca", country="Morocco", email="b2b@techzone.example", is_vendor=True,
            payment_term=PaymentTerm.objects.filter(days=30).first(), receivable_account=a(code="121000"),
            payable_account=a(code="211000")))
        assets.purchase(laptops, tech)
        acc.register_payment(laptops.bill, date=start)
        for _ in range(3):
            assets.depreciate_next(laptops)
    def demo_user(self):
        User = get_user_model()
        if User.objects.filter(username="demo").exists():
            return
        password = os.environ.get("DEMO_PASSWORD")
        if not password:
            password = secrets.token_urlsafe(12)
            with open(settings.BASE_DIR / ".env", "a", encoding="utf-8") as f:
                f.write(f"DEMO_USERNAME=demo\nDEMO_PASSWORD={password}\n")
        User.objects.create_superuser("demo", "demo@nexuserp.local", password, first_name="Demo", last_name="User")
        self.stdout.write("Created user 'demo' (password stored in backend/.env as DEMO_PASSWORD).")
