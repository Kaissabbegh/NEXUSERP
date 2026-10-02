"""Load the "Nexus Furniture" demo company used throughout the ERP lessons.

Run on an empty database:  python manage.py seed_demo
"""

import os
import secrets
from datetime import timedelta
from decimal import Decimal as D

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounting import services as acc
from accounting.models import Account, Journal, Move
from inventory import services as stock
from inventory.models import Location, Picking, Warehouse
from masterdata.models import Partner, PaymentTerm, Product, ProductCategory, Tax, UnitOfMeasure
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

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Seed even if data already exists.")

    def handle(self, *args, force=False, **opts):
        if Account.objects.exists() and not force:
            raise CommandError("Database already has data. Use --force or reset the database first.")
        with transaction.atomic():
            self.chart_of_accounts()
            self.masterdata()
            self.warehouse()
            self.opening_stock()
            self.history()
        self.demo_user()
        self.stdout.write(self.style.SUCCESS("Nexus Furniture demo data loaded."))

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
        lines = [(Product.objects.get(sku=sku), D(qty)) for sku, *_, qty in PRODUCTS if qty]
        picking = stock.create_picking(Picking.Kind.ADJUSTMENT, lines, origin="Opening stock")
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
