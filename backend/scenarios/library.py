"""The five guided scenarios. Each step does real work through the ERP services and explains it."""

import math
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounting import reports
from accounting import services as acc
from accounting.models import Account, Move, MoveLine
from crm import services as crm
from crm.models import Lead
from fixedassets import services as assets
from fixedassets.models import FixedAsset
from hr import services as hr
from hr.models import Employee, ExpenseClaim, PayrollRun
from inventory import services as stock
from inventory.models import Picking
from masterdata.models import Partner, PaymentTerm, Product
from mrp import services as mrp
from mrp.models import BillOfMaterials, ManufacturingOrder
from purchase import services as purchase
from purchase.models import PurchaseOrder, PurchaseOrderLine
from sales import services as sales
from sales.models import SaleOrder, SaleOrderLine

from .engine import Scenario, Step, doc

ZERO = Decimal("0")
CENT = Decimal("0.01")


# --- formatting --------------------------------------------------------------------------------
def m(v) -> str:
    v = Decimal(v)
    return f"-${abs(v):,.2f}" if v < 0 else f"${v:,.2f}"


def q(v) -> str:
    return f"{Decimal(v):.3f}".rstrip("0").rstrip(".")


# --- helpers -----------------------------------------------------------------------------------
def product(sku) -> Product:
    return Product.objects.select_related("category", "vendor", "sale_tax", "purchase_tax").get(sku=sku)


def partner(name, vendor=False) -> Partner:
    p = Partner.objects.filter(name=name).first()
    return p or Partner.objects.filter(**({"is_vendor": True} if vendor else {"is_customer": True})).first()


def available(p: Product) -> Decimal:
    return stock.on_hand_map([p.id]).get(p.id, ZERO) - stock.reserved_map([p.id]).get(p.id, ZERO)


def ensure_available(sku, qty) -> str | None:
    """Silently buy stock (full purchase cycle) if the story needs more than is free on the shelf."""
    p = product(sku)
    free = available(p)
    if free >= qty:
        return None
    buy = Decimal(math.ceil(qty - free + max(p.reorder_min, 1)))
    vendor = p.vendor or Partner.objects.filter(is_vendor=True).first()
    po = make_purchase(vendor, [(sku, buy, p.cost)])
    purchase.confirm(po)
    for picking in po.pickings.all():
        stock.validate(picking)
    bill = acc.post(purchase.create_bill(po))
    acc.register_payment(bill)
    return (f"Setup: only {q(free)} {p.name} were free on the shelf, so before this step the scenario bought "
            f"{q(buy)} from {vendor.name} ({po.name}). That way the story works every time you replay it.")


def make_sale(customer: Partner, items) -> SaleOrder:
    order = SaleOrder.objects.create(name=sales.new_order_name(), partner=customer, payment_term=customer.payment_term)
    for sku, qty in items:
        p = product(sku)
        SaleOrderLine.objects.create(order=order, product=p, description=p.name, quantity=qty, price_unit=p.sale_price, tax=p.sale_tax)
    order.compute_amounts()
    return order


def make_purchase(vendor: Partner, items) -> PurchaseOrder:
    order = PurchaseOrder.objects.create(name=purchase.new_order_name(), partner=vendor, payment_term=vendor.payment_term,
                                         date_planned=timezone.localdate())
    for sku, qty, price in items:
        p = product(sku)
        PurchaseOrderLine.objects.create(order=order, product=p, description=p.name, quantity=qty, price_unit=price, tax=p.purchase_tax)
    order.compute_amounts()
    return order


def with_tax(p: Product, qty) -> Decimal:
    base = (p.sale_price * qty).quantize(CENT)
    return base + (p.sale_tax.compute(base) if p.sale_tax else ZERO)


def cogs_of(picking) -> Decimal:
    total = MoveLine.objects.filter(move__picking=picking, kind=MoveLine.Kind.COGS).aggregate(s=Sum("debit"))["s"]
    return total or ZERO


def balance(code) -> Decimal:
    agg = MoveLine.objects.filter(account__code=code, move__state=Move.State.POSTED).aggregate(d=Sum("debit"), c=Sum("credit"))
    return (agg["d"] or ZERO) - (agg["c"] or ZERO)


def manual(label, debit_code, credit_code, amount) -> Move:
    a = Account.objects.get
    return acc.create_entry("MISC", [
        acc.LineSpec(a(code=debit_code), debit=amount, name=label),
        acc.LineSpec(a(code=credit_code), credit=amount, name=label),
    ], ref=label)


# =============================================================================================
# 1. Sell office chairs (Order-to-Cash)
# =============================================================================================
def s1_quote(ctx):
    customer = partner("Brightline Studio")
    order = make_sale(customer, [("CHAIR-001", 5)])
    line = order.lines.first()
    ctx.update(order=order.id)
    return {
        "explanation": (f"{customer.name} calls: “How much for 5 Ergonomic Mesh Chairs?” The salesperson creates quotation "
                        f"{order.name}: 5 × {m(line.price_unit)} = {m(order.amount_untaxed)}, plus VAT {m(order.amount_tax)}, "
                        f"total {m(order.amount_total)}. The price, the 20% VAT and the payment terms "
                        f"({customer.payment_term.name if customer.payment_term else 'none'}) were filled in from master data."),
        "takeaway": "A quotation is only an offer. Look at the money buckets: nothing moved, and stock didn't change.",
        "documents": [doc("sale", order.name, order.id)],
    }


def s1_confirm(ctx):
    order = SaleOrder.objects.get(pk=ctx["order"])
    sales.confirm(order)
    picking = order.pickings.first()
    ctx.update(picking=picking.id)
    return {
        "explanation": (f"The customer says yes. Clicking Confirm turns {order.name} into a sales order. The ERP checked the "
                        f"customer's credit limit and created delivery order {picking.name} for the warehouse. The 5 chairs are "
                        f"now reserved (promised to this customer) but still physically on the shelf."),
        "takeaway": "Still no accounting entry: a promise to deliver isn't money yet.",
        "documents": [doc("sale", order.name, order.id), doc("picking", picking.name, picking.id)],
    }


def s1_ship(ctx):
    picking = stock.validate(Picking.objects.get(pk=ctx["picking"]))
    cost = cogs_of(picking)
    return {
        "explanation": (f"The warehouse packs the chairs and clicks Validate on {picking.name}. Five chairs leave the shelf, so "
                        f"stock goes down. Because they're gone, what they cost us ({m(cost)}) moves out of Inventory (an asset) "
                        f"into Cost of Goods Sold (an expense)."),
        "takeaway": "First journal entry! Shipping goods records their COST, not the sale.",
        "documents": [doc("picking", picking.name, picking.id)],
    }


def s1_invoice(ctx):
    order = SaleOrder.objects.get(pk=ctx["order"])
    inv = acc.post(sales.create_invoice(order))
    ctx.update(invoice=inv.id)
    return {
        "explanation": (f"The accountant creates invoice {inv.name} and posts it. {inv.partner.name} now owes us "
                        f"{m(inv.amount_total)} (Customers owe us goes up). We earned {m(inv.amount_untaxed)} of sales, and the "
                        f"{m(inv.amount_tax)} of VAT isn't ours: we owe it to the state. Payment is due {inv.invoice_date_due:%b %d}."),
        "takeaway": "Invoice = revenue for us + a debt the customer owes us.",
        "documents": [doc("invoice", inv.name, inv.id)],
    }


def s1_pay(ctx):
    inv = Move.objects.get(pk=ctx["invoice"])
    payment = acc.register_payment(inv)
    return {
        "explanation": (f"{inv.partner.name} pays {m(payment.amount)}. The Bank goes up and 'Customers owe us' goes back down: "
                        f"the debt became cash. Invoice {inv.name} is now marked Paid."),
        "takeaway": "Getting paid creates no profit. It just turns 'they owe us' into money in the bank.",
        "documents": [doc("invoice", inv.name, inv.id), doc("entry", payment.name, payment.move_id)],
    }


def s1_summary(ctx):
    inv = Move.objects.get(pk=ctx["invoice"])
    cost = cogs_of(Picking.objects.get(pk=ctx["picking"]))
    profit = inv.amount_untaxed - cost
    return {
        "explanation": (f"Let's count. We received {m(inv.amount_total)} in the bank. But {m(inv.amount_tax)} of it is VAT we "
                        f"must hand to the state, and {m(cost)} just pays back what the chairs cost us. What we really earned "
                        f"on this sale (gross profit) is {m(inv.amount_untaxed)} − {m(cost)} = {m(profit)}."),
        "takeaway": f"Cash received ({m(inv.amount_total)}) is not the same as profit ({m(profit)}).",
        "documents": [doc("sale", inv.sale_order.name, inv.sale_order_id), doc("report", "Profit & Loss", "/reports/profit-loss")],
    }


# =============================================================================================
# 2. Restock from a vendor (Procure-to-Pay)
# =============================================================================================
def s2_rfq(ctx):
    vendor = partner("SteelForm Industries", vendor=True)
    chair = product("CHAIR-001")
    price = (chair.cost * Decimal("0.94")).quantize(Decimal("1"))
    po = make_purchase(vendor, [("CHAIR-001", 10, price)])
    ctx.update(po=po.id, old_cost=str(chair.cost), price=str(price))
    return {
        "explanation": (f"We're running low on Ergonomic Mesh Chairs. The purchaser sends a Request for Quotation {po.name} to "
                        f"{vendor.name}: 10 chairs at {m(price)} each (our current average cost is {m(chair.cost)}). "
                        f"Total {m(po.amount_total)} including {m(po.amount_tax)} VAT."),
        "takeaway": "An RFQ is just a question to the vendor. Nothing is owed and nothing moves.",
        "documents": [doc("purchase", po.name, po.id)],
    }


def s2_confirm(ctx):
    po = PurchaseOrder.objects.get(pk=ctx["po"])
    purchase.confirm(po)
    receipt = po.pickings.first()
    ctx.update(receipt=receipt.id)
    return {
        "explanation": (f"The vendor accepts our price, so we confirm: {po.name} becomes a Purchase Order. The ERP creates receipt "
                        f"{receipt.name} so the warehouse knows 10 chairs are coming. They show up as 'Incoming' on the Stock page."),
        "takeaway": "We've committed to buy, but we owe nothing until the goods and the bill arrive.",
        "documents": [doc("purchase", po.name, po.id), doc("picking", receipt.name, receipt.id)],
    }


def s2_receive(ctx):
    receipt = stock.validate(Picking.objects.get(pk=ctx["receipt"]))
    chair = product("CHAIR-001")
    return {
        "explanation": (f"The truck arrives. The warehouse checks the boxes and validates {receipt.name}: stock goes up by 10. "
                        f"Inventory (an asset) increases by the value of the chairs. Because we paid {m(ctx['price'])} instead of "
                        f"{m(ctx['old_cost'])}, the chair's average cost changes from {m(ctx['old_cost'])} to {m(chair.cost)}."),
        "takeaway": "The other side of the entry waits in 'Stock Interim' until the vendor's bill arrives.",
        "documents": [doc("picking", receipt.name, receipt.id), doc("product", "Product cost", "")],
    }


def s2_bill(ctx):
    po = PurchaseOrder.objects.get(pk=ctx["po"])
    bill = acc.post(purchase.create_bill(po))
    ctx.update(bill=bill.id)
    return {
        "explanation": (f"The vendor's invoice arrives and the accountant records bill {bill.name} for the 10 chairs we actually "
                        f"received. Now WE OWE {po.partner.name} {m(bill.amount_total)} ('We owe vendors' goes up). The "
                        f"{m(bill.amount_tax)} of VAT we paid can be reclaimed from the state."),
        "takeaway": "Bill = a debt we owe the vendor (a liability). Three-way match: ordered = received = billed.",
        "documents": [doc("bill", bill.name, bill.id)],
    }


def s2_pay(ctx):
    bill = Move.objects.get(pk=ctx["bill"])
    payment = acc.register_payment(bill)
    return {
        "explanation": (f"On the due date we pay {bill.partner.name} {m(payment.amount)}. Money leaves the Bank and 'We owe vendors' "
                        f"goes back down. Our debt is settled."),
        "takeaway": "Paying a bill is not an expense: the chairs are still in stock. They only become an expense when sold.",
        "documents": [doc("bill", bill.name, bill.id), doc("entry", payment.name, payment.move_id)],
    }


def s2_summary(ctx):
    bill = Move.objects.get(pk=ctx["bill"])
    return {
        "explanation": (f"Result: we swapped {m(bill.amount_total)} of cash for 10 chairs worth {m(bill.amount_untaxed)} in "
                        f"Inventory, plus {m(bill.amount_tax)} of VAT to reclaim. Profit didn't change at all: buying stock "
                        f"isn't spending, it's turning one asset (cash) into another (goods)."),
        "takeaway": "Profit only moves when goods are SOLD (Cost of Goods Sold) or money is spent on running costs.",
        "documents": [doc("purchase", bill.purchase_order.name, bill.purchase_order_id), doc("report", "Balance Sheet", "/reports/balance-sheet")],
    }


# =============================================================================================
# 3. Make desks to order (Sales + Manufacturing)
# =============================================================================================
DESK = "DESK-002"


def s3_order(ctx):
    customer = partner("Atlas Consulting")
    order = make_sale(customer, [(DESK, 2)])
    sales.confirm(order)
    picking = order.pickings.first()
    ctx.update(order=order.id, picking=picking.id)
    return {
        "explanation": (f"{customer.name} orders 2 Standing Desk Pro at {m(product(DESK).sale_price)} each. The order "
                        f"{order.name} is confirmed and delivery {picking.name} is created. But we don't buy these desks ready-made: "
                        f"our workshop builds them from components."),
        "takeaway": "Selling something you manufacture triggers a production need.",
        "documents": [doc("sale", order.name, order.id), doc("picking", picking.name, picking.id)],
    }


def s3_prepare_components(ctx):
    bom = BillOfMaterials.objects.get(product__sku=DESK)
    notes = [ensure_available(l.component.sku, l.quantity * 2) for l in bom.lines.select_related("component")]
    notes = [n for n in notes if n]
    return " ".join(notes) or None


def s3_plan(ctx):
    bom = BillOfMaterials.objects.get(product__sku=DESK)
    mo = mrp.confirm(mrp.create(bom, Decimal(2), origin=SaleOrder.objects.get(pk=ctx["order"]).name))
    ctx.update(mo=mo.id)
    parts = ", ".join(f"{q(c['quantity'])} × {c['name']} ({m(c['value'])})" for c in mrp.components(mo))
    total = sum((Decimal(c["value"]) for c in mrp.components(mo)), ZERO)
    return {
        "explanation": (f"The planner opens the desk's Bill of Materials (its recipe) and creates manufacturing order {mo.name} "
                        f"for 2 desks. It needs: {parts}. That's {m(total)} of components, so {m(total / 2)} per desk."),
        "takeaway": "The BoM tells the ERP exactly what to consume and what it will cost.",
        "documents": [doc("mo", mo.name, mo.id)],
    }


def s3_produce(ctx):
    mo = mrp.produce(ManufacturingOrder.objects.get(pk=ctx["mo"]))
    return {
        "explanation": (f"The workshop assembles the desks and clicks Produce on {mo.name}. Components leave stock, 2 finished "
                        f"desks enter stock, each valued at {m(mo.unit_cost)}. In accounting, value just moves inside Inventory: "
                        f"components out, finished desks in. Total stock value doesn't change."),
        "takeaway": "Manufacturing transforms stock. It doesn't create profit by itself.",
        "documents": [doc("mo", mo.name, mo.id)],
    }


def s3_ship(ctx):
    picking = stock.validate(Picking.objects.get(pk=ctx["picking"]))
    return {
        "explanation": (f"The 2 desks are delivered with {picking.name}. Their cost ({m(cogs_of(picking))}) moves from Inventory "
                        f"to Cost of Goods Sold."),
        "takeaway": "Same as any sale: delivery records the cost.",
        "documents": [doc("picking", picking.name, picking.id)],
    }


def s3_invoice(ctx):
    inv = acc.post(sales.create_invoice(SaleOrder.objects.get(pk=ctx["order"])))
    acc.register_payment(inv)
    ctx.update(invoice=inv.id)
    return {
        "explanation": (f"Invoice {inv.name} is posted ({m(inv.amount_total)} incl. VAT) and {inv.partner.name} pays it right away. "
                        f"Revenue {m(inv.amount_untaxed)} is recorded, VAT goes to the state, and the money lands in the Bank."),
        "takeaway": "Invoice + payment: the cash cycle closes.",
        "documents": [doc("invoice", inv.name, inv.id)],
    }


def s3_summary(ctx):
    inv = Move.objects.get(pk=ctx["invoice"])
    cost = cogs_of(Picking.objects.get(pk=ctx["picking"]))
    margin = inv.amount_untaxed - cost
    return {
        "explanation": (f"We sold 2 desks for {m(inv.amount_untaxed)}. They cost {m(cost)} to make, so the gross profit is "
                        f"{m(margin)} ({(margin / inv.amount_untaxed * 100):.0f}% margin). The ERP tracked every component, so we "
                        f"know the real cost of what we build."),
        "takeaway": "Make-to-order: Sale → Manufacturing → Delivery → Invoice → Payment, all linked.",
        "documents": [doc("report", "Bills of Materials", "/boms"), doc("report", "Profit & Loss", "/reports/profit-loss")],
    }


# =============================================================================================
# 4. The late payer: partial payment and credit limit
# =============================================================================================
FIRST = [("CHAIR-002", 5)]
SECOND = [("TABLE-001", 1), ("CHAIR-002", 2)]


def s4_customer(ctx):
    first = sum((with_tax(product(s), n) for s, n in FIRST), ZERO)
    second = sum((with_tax(product(s), n) for s, n in SECOND), ZERO)
    # Pick a limit the story crosses only while half of the first invoice is unpaid.
    limit = Decimal(math.floor((second + first / 4) / 100) * 100)
    base, name, n = "Nova Design Studio", "Nova Design Studio", 1
    while Partner.objects.filter(name=name).exists():
        n += 1
        name = f"{base} #{n}"
    template = Partner.objects.filter(is_customer=True).first()
    customer = Partner.objects.create(
        name=name, city="Casablanca", country="Morocco", is_customer=True, credit_limit=limit,
        payment_term=PaymentTerm.objects.filter(days=30).first(), receivable_account=template.receivable_account,
        payable_account=template.payable_account,
    )
    ctx.update(partner=customer.id, limit=str(limit))
    return {
        "explanation": (f"A new customer, {customer.name}, opens an account. Before selling on credit, the sales manager sets their "
                        f"credit limit to {m(limit)} (the most they may owe us at once) and their payment terms to 30 days."),
        "takeaway": "Master data first: the credit limit will protect us later in this story.",
        "documents": [doc("partner", customer.name, "")],
    }


def s4_first_order(ctx):
    customer = Partner.objects.get(pk=ctx["partner"])
    order = make_sale(customer, FIRST)
    sales.confirm(order)
    for picking in order.pickings.all():
        stock.validate(picking)
    inv = acc.post(sales.create_invoice(order))
    ctx.update(order1=order.id, invoice1=inv.id)
    return {
        "explanation": (f"{customer.name} buys 5 Leather Manager Chairs ({order.name}). They're delivered and invoiced: "
                        f"{inv.name} for {m(inv.amount_total)}, due in 30 days. That's within their {m(ctx['limit'])} limit."),
        "takeaway": "Order, delivery and invoice in one go, all things you saw in scenario 1.",
        "documents": [doc("sale", order.name, order.id), doc("invoice", inv.name, inv.id)],
    }


def s4_partial(ctx):
    inv = Move.objects.get(pk=ctx["invoice1"])
    half = (inv.amount_total / 2).quantize(CENT)
    acc.register_payment(inv, half)
    inv.refresh_from_db()
    return {
        "explanation": (f"The customer is short on cash and pays only half: {m(half)}. The invoice becomes 'Partially paid' and they "
                        f"still owe us {m(inv.amount_residual)}. On the Who Owes Whom page they now appear as a customer with an open balance."),
        "takeaway": "A partial payment reduces the debt but doesn't clear it.",
        "documents": [doc("invoice", inv.name, inv.id), doc("report", "Who Owes Whom", "/reports/aged?kind=receivable")],
    }


def s4_blocked(ctx):
    customer = Partner.objects.get(pk=ctx["partner"])
    order = make_sale(customer, SECOND)
    ctx.update(order2=order.id)
    owed = sales.partner_open_balance(customer)
    try:
        sales.confirm(order)
    except ValidationError:
        return {
            "outcome": "blocked",
            "explanation": (f"They want more: a conference table and 2 chairs ({order.name}, {m(order.amount_total)}). The salesperson "
                            f"clicks Confirm and the ERP REFUSES. They still owe {m(owed)}, and {m(owed)} + {m(order.amount_total)} = "
                            f"{m(owed + order.amount_total)}, which is over their {m(ctx['limit'])} credit limit."),
            "takeaway": "The credit limit stops us from shipping more goods to someone who hasn't paid. The order stays a quotation.",
            "documents": [doc("sale", order.name, order.id)],
        }
    return {"explanation": f"{order.name} was confirmed: the credit limit wasn't reached.", "documents": [doc("sale", order.name, order.id)]}


def s4_pay_rest(ctx):
    inv = Move.objects.get(pk=ctx["invoice1"])
    rest = inv.amount_residual
    acc.register_payment(inv)
    return {
        "explanation": (f"The salesperson calls the customer, who pays the remaining {m(rest)}. Invoice {inv.name} is now fully "
                        f"paid and the customer owes us nothing."),
        "takeaway": "Collecting money is part of the sales job: unpaid invoices block new business.",
        "documents": [doc("invoice", inv.name, inv.id)],
    }


def s4_retry(ctx):
    order = SaleOrder.objects.get(pk=ctx["order2"])
    sales.confirm(order)
    return {
        "explanation": (f"The salesperson tries again. Now the customer owes {m(0)}, and the new order ({m(order.amount_total)}) is "
                        f"within the {m(ctx['limit'])} limit, so {order.name} is confirmed and a delivery is created."),
        "takeaway": "Credit control in an ERP is automatic: the rules live in master data and apply everywhere.",
        "documents": [doc("sale", order.name, order.id)],
    }


# =============================================================================================
# 5. Month-end close
# =============================================================================================
def s5_prepare_count(ctx):
    return ensure_available("CHAIR-003", 2)


def s5_count(ctx):
    chair = product("CHAIR-003")
    system = stock.on_hand_map([chair.id]).get(chair.id, ZERO)
    picking = stock.adjust(chair, system - 2, "Month-end count: 2 broken visitor chairs")
    return {
        "explanation": (f"It's the end of the month. The warehouse counts every shelf. The system says {q(system)} Visitor Chairs, "
                        f"but only {q(system - 2)} are usable: 2 were broken. The count is recorded ({picking.name}) and the loss of "
                        f"{m(2 * chair.cost)} is booked as an expense (Inventory Differences)."),
        "takeaway": "Physical counts keep the system honest. Losses reduce profit.",
        "documents": [doc("picking", picking.name, picking.id)],
    }


def s5_rent(ctx):
    entry = manual(f"Warehouse rent {timezone.localdate():%B}", "610000", "101000", Decimal(1500))
    return {
        "explanation": "The landlord is paid $1,500 rent. No module creates this, so the accountant types a journal entry: "
                       "Rent (an expense) goes up, Bank goes down.",
        "takeaway": "Running costs go straight to expenses and reduce profit.",
        "documents": [doc("entry", entry.name, entry.id)],
    }


def s5_salaries(ctx):
    run = hr.pay_authorities(hr.pay_salaries(hr.post_run(hr.create_run(timezone.localdate()))))
    t = run.totals()
    return {
        "explanation": (f"HR runs this month's payroll ({run.name}) for {run.payslips.count()} employees: gross salaries "
                        f"{m(t['gross'])} plus {m(t['employer_social'])} of employer social charges. Employees receive "
                        f"{m(t['net'])} net; the rest goes to social security and the tax office. All of it is paid from the Bank."),
        "takeaway": "People are usually the biggest running cost of a company. The full payroll story is in its own scenario.",
        "documents": [doc("payroll", run.name, run.id)],
    }


def s5_vat(ctx):
    owed, reclaim = -balance("251000"), balance("131000")
    a = Account.objects.get
    if owed <= 0 and reclaim <= 0:
        return {"explanation": "There is no VAT to settle this month.", "takeaway": ""}
    net = owed - reclaim
    lines = []
    if owed > 0:
        lines.append(acc.LineSpec(a(code="251000"), debit=owed, name="VAT collected on sales"))
    if reclaim > 0:
        lines.append(acc.LineSpec(a(code="131000"), credit=reclaim, name="VAT paid on purchases"))
    lines.append(acc.LineSpec(a(code="101000"), credit=net, name="VAT paid to the state") if net > 0
                 else acc.LineSpec(a(code="101000"), debit=-net, name="VAT refund from the state"))
    entry = acc.create_entry("MISC", lines, ref="VAT return")
    return {
        "explanation": (f"Time for the VAT return. We collected {m(owed)} of VAT from customers (owed to the state) and paid "
                        f"{m(reclaim)} of VAT to vendors (we can deduct it). We only pay the difference: {m(owed)} − {m(reclaim)} = "
                        f"{m(net)}{' to the state' if net > 0 else ' back to us'}."),
        "takeaway": "VAT passes THROUGH the company: it's never income or expense, just money held for the state.",
        "documents": [doc("entry", entry.name, entry.id)],
    }


def s5_pl(ctx):
    today = timezone.localdate()
    pl = reports.profit_and_loss(today.replace(day=1), today)
    net = pl["net_profit"]
    return {
        "explanation": (f"The manager opens this month's Profit & Loss. Revenue {m(pl['revenue']['total'])} − cost of goods "
                        f"{m(pl['cost_of_revenue']['total'])} = gross profit {m(pl['gross_profit'])}. Minus running expenses "
                        f"{m(pl['expenses']['total'])} (rent, salaries, the broken chairs…) gives a net "
                        f"{'profit' if net >= 0 else 'loss'} of {m(net)} for the month."),
        "takeaway": "Month-end close: count stock, record running costs, settle VAT, then read the result.",
        "documents": [doc("report", "Profit & Loss", "/reports/profit-loss"), doc("report", "Balance Sheet", "/reports/balance-sheet")],
    }


# =============================================================================================
# 6. Win a new client (CRM)
# =============================================================================================
LEAD_ITEMS = [("DESK-002", 4), ("CHAIR-001", 4)]


def unique_name(model, field, base):
    name, n = base, 1
    while model.objects.filter(**{field: name}).exists():
        n += 1
        name = f"{base} #{n}"
    return name


def s6_lead(ctx):
    company = unique_name(Lead, "company_name", "BlueWave Tech")
    estimate = sum((product(s).sale_price * n for s, n in LEAD_ITEMS), ZERO)
    lead = Lead.objects.create(name="Desks and chairs for a new office", company_name=company, contact_name="Mehdi Rami",
                               email="mehdi@bluewave.example", source="Website", expected_revenue=estimate,
                               probability=Lead.PROBABILITY["new"])
    ctx.update(lead=lead.id)
    return {
        "explanation": (f"Mehdi from {company}, a young startup, fills in the contact form on our website: they're moving into "
                        f"a new office and need desks and chairs. The CRM creates a LEAD worth about {m(estimate)}, with a 10% "
                        f"chance of winning for now. {company} is NOT a customer yet: it only exists in the CRM."),
        "takeaway": "A lead is a possible sale. Nothing exists in Sales, Inventory or Accounting yet.",
        "documents": [doc("lead", lead.name, lead.id)],
    }


def s6_qualify(ctx):
    lead = crm.qualify(Lead.objects.get(pk=ctx["lead"]))
    return {
        "explanation": (f"Our salesperson calls Mehdi: the budget is confirmed, he is the decision-maker, and they need the "
                        f"furniture within a month. The lead is QUALIFIED: it becomes a real opportunity and the probability rises "
                        f"to {lead.probability}%."),
        "takeaway": "Qualifying = checking Budget, Authority, Need and Timing (BANT) before spending time on a proposal.",
        "documents": [doc("lead", lead.name, lead.id)],
    }


def s6_quote(ctx):
    lead = Lead.objects.get(pk=ctx["lead"])
    order = crm.create_quotation(lead, [(product(s), Decimal(n)) for s, n in LEAD_ITEMS])
    lead.refresh_from_db()
    ctx.update(order=order.id)
    return {
        "explanation": (f"The salesperson sends a proposal. From the opportunity, the CRM creates the customer record "
                        f"'{lead.partner.name}' in master data and quotation {order.name}: 4 Standing Desk Pro + 4 Ergonomic Mesh "
                        f"Chairs = {m(order.amount_total)} incl. VAT. The opportunity moves to 'Proposition' ({lead.probability}%)."),
        "takeaway": "CRM hands over to Sales: the quotation is linked to the opportunity, so nothing is typed twice.",
        "documents": [doc("lead", lead.name, lead.id), doc("sale", order.name, order.id), doc("partner", lead.partner.name, "")],
    }


def s6_won(ctx):
    lead = crm.mark_won(Lead.objects.get(pk=ctx["lead"]))
    order = lead.sale_order
    picking = order.pickings.first()
    return {
        "explanation": (f"Mehdi signs! The salesperson marks the opportunity WON, which confirms {order.name} as a sales order. "
                        f"The warehouse immediately gets delivery {picking.name}. From here it's the normal Order-to-Cash story "
                        f"(see the 'Sell office chairs' scenario)."),
        "takeaway": "Won opportunity = confirmed sales order. The CRM pipeline and the sales figures stay in sync.",
        "documents": [doc("sale", order.name, order.id), doc("picking", picking.name, picking.id)],
    }


def s6_summary(ctx):
    stats = {r["stage"]: r for r in Lead.objects.values("stage").annotate(n=Count("id"))}
    won, lost = stats.get("won", {}).get("n", 0), stats.get("lost", {}).get("n", 0)
    rate = round(won / (won + lost) * 100) if won + lost else 0
    open_leads = Lead.objects.filter(stage__in=crm.OPEN)
    weighted = sum((l.weighted_revenue for l in open_leads), ZERO)
    return {
        "explanation": (f"The sales manager checks the pipeline: {open_leads.count()} open opportunities, worth {m(weighted)} when "
                        f"weighted by their probability, and a win rate of {rate}% ({won} won, {lost} lost). This is how "
                        f"companies forecast next month's sales."),
        "takeaway": "Lead → Qualified → Proposition → Won/Lost. The pipeline predicts revenue before it happens.",
        "documents": [doc("report", "CRM pipeline", "/crm")],
    }


# =============================================================================================
# 7. Customer returns a damaged chair (after-sales)
# =============================================================================================
def s7_sale(ctx):
    customer = partner("Delta Logistics")
    order = make_sale(customer, [("CHAIR-001", 3)])
    sales.confirm(order)
    for p in order.pickings.all():
        stock.validate(p)
    inv = acc.post(sales.create_invoice(order))
    acc.register_payment(inv)
    ctx.update(order=order.id, invoice=inv.id)
    return {
        "explanation": (f"Last week {customer.name} bought 3 Ergonomic Mesh Chairs ({order.name}). They were delivered, invoiced "
                        f"({inv.name}, {m(inv.amount_total)}) and paid. A completely normal sale."),
        "takeaway": "This step replays a whole sale so we have something to return.",
        "documents": [doc("sale", order.name, order.id), doc("invoice", inv.name, inv.id)],
    }


def s7_return(ctx):
    order = SaleOrder.objects.get(pk=ctx["order"])
    line = order.lines.first()
    picking = sales.create_return(order, [(line, 1)])
    ctx.update(picking=picking.id)
    return {
        "explanation": (f"The customer calls: one chair arrived with a broken armrest. Customer service agrees to take it back and "
                        f"creates return {picking.name} (Customers → WH/Stock) linked to {order.name}, so we know exactly what "
                        f"was sold, at what price."),
        "takeaway": "A return is always linked to the original order. That's how the ERP knows the price and cost to reverse.",
        "documents": [doc("picking", picking.name, picking.id)],
    }


def s7_receive(ctx):
    picking = stock.validate(Picking.objects.get(pk=ctx["picking"]))
    cost = MoveLine.objects.filter(move__picking=picking, kind=MoveLine.Kind.COGS).aggregate(s=Sum("credit"))["s"] or ZERO
    return {
        "explanation": (f"The chair arrives back at the warehouse and {picking.name} is validated: stock goes up by 1. Its cost "
                        f"({m(cost)}) moves back from Cost of Goods Sold into Inventory: the exact reverse of the delivery entry."),
        "takeaway": "Returning goods reverses the cost. (Damaged items would then be scrapped or repaired.)",
        "documents": [doc("picking", picking.name, picking.id)],
    }


def s7_credit(ctx):
    order = SaleOrder.objects.get(pk=ctx["order"])
    note = sales.create_credit_note(order, [(order.lines.first(), 1)])
    ctx.update(note=note.id)
    return {
        "explanation": (f"The accountant issues credit note {note.name} for 1 chair: {m(note.amount_total)} incl. VAT. It is the "
                        f"opposite of an invoice: Sales go down, the VAT we owed the state goes down, and since the invoice was "
                        f"already paid, we now OWE the customer {m(note.amount_residual)}."),
        "takeaway": "Never delete or edit a posted invoice. You correct it with a credit note, so the audit trail stays complete.",
        "documents": [doc("credit", note.name, note.id)],
    }


def s7_refund(ctx):
    note = Move.objects.get(pk=ctx["note"])
    payment = acc.register_payment(note)
    return {
        "explanation": (f"We send {m(payment.amount)} back to {note.partner.name}'s bank account. Bank goes down, and the amount "
                        f"we owed the customer is cleared. The credit note is marked Paid."),
        "takeaway": "A refund is a payment in the other direction: money OUT to a customer.",
        "documents": [doc("credit", note.name, note.id), doc("entry", payment.name, payment.move_id)],
    }


def s7_summary(ctx):
    inv, note = Move.objects.get(pk=ctx["invoice"]), Move.objects.get(pk=ctx["note"])
    return {
        "explanation": (f"Net result: we invoiced {m(inv.amount_untaxed)} and credited {m(note.amount_untaxed)}, so the sale is now "
                        f"worth {m(inv.amount_untaxed - note.amount_untaxed)} (2 chairs). Stock, revenue, VAT and cash all reflect "
                        f"the return, and every step is traceable from the original order."),
        "takeaway": "After-sales in an ERP: Return (stock) + Credit note (accounting) + Refund (bank).",
        "documents": [doc("sale", inv.sale_order.name, inv.sale_order_id)],
    }


# =============================================================================================
# 8. Run the monthly payroll (HR)
# =============================================================================================
def s8_team(ctx):
    team = list(Employee.objects.filter(active=True).select_related("department"))
    gross = sum((e.wage for e in team), ZERO)
    by_dept = {}
    for e in team:
        by_dept[e.department.name] = by_dept.get(e.department.name, 0) + 1
    return {
        "explanation": (f"It's payday. HR checks the team: {len(team)} employees in "
                        f"{', '.join(f'{d} ({n})' for d, n in by_dept.items())}. Their contracts add up to {m(gross)} of gross "
                        f"monthly salaries. Each employee's wage is master data, just like a product price."),
        "takeaway": "Employees are master data for HR: job, department, contract and wage.",
        "documents": [doc("report", "Employees", "/employees")],
    }


def s8_compute(ctx):
    run = hr.create_run(timezone.localdate())
    ctx.update(run=run.id)
    slip = run.payslips.select_related("employee").first()
    return {
        "explanation": (f"HR generates payroll {run.name}: one payslip per employee. Take {slip.employee.name}: gross "
                        f"{m(slip.gross)} − social security {m(slip.employee_social)} − income tax {m(slip.income_tax)} = net pay "
                        f"{m(slip.net)}. On top of that, the company pays {m(slip.employer_social)} of employer charges."),
        "takeaway": "Gross = what the contract says. Net = what lands in the employee's account. The difference goes to the state.",
        "documents": [doc("payroll", run.name, run.id)],
    }


def s8_post(ctx):
    run = hr.post_run(PayrollRun.objects.get(pk=ctx["run"]))
    t = run.totals()
    return {
        "explanation": (f"The payroll is posted. The total COST for the company is {m(t['cost'])}: salaries {m(t['gross'])} + "
                        f"employer charges {m(t['employer_social'])} (both expenses). Nothing is paid yet, so three debts appear: "
                        f"{m(t['net'])} to employees, {m(t['employee_social'] + t['employer_social'])} to social security and "
                        f"{m(t['income_tax'])} to the tax office."),
        "takeaway": "Posting payroll records the cost and WHO we owe. Paying comes next.",
        "documents": [doc("payroll", run.name, run.id), doc("entry", run.move.name, run.move_id)],
    }


def s8_pay(ctx):
    run = hr.pay_salaries(PayrollRun.objects.get(pk=ctx["run"]))
    return {
        "explanation": (f"The bank transfers {m(run.totals()['net'])} of net salaries to the employees. 'Salaries Payable' goes back "
                        f"to zero."),
        "takeaway": "Employees get their net pay on payday.",
        "documents": [doc("entry", run.payment_move.name, run.payment_move_id)],
    }


def s8_authorities(ctx):
    run = hr.pay_authorities(PayrollRun.objects.get(pk=ctx["run"]))
    t = run.totals()
    return {
        "explanation": (f"Later in the month the company pays what it withheld and owes: {m(t['employee_social'] + t['employer_social'])} "
                        f"to social security and {m(t['income_tax'])} to the tax office. All payroll debts are now settled."),
        "takeaway": "Withheld tax and contributions are NOT the company's money: it collects them for the state.",
        "documents": [doc("entry", run.authorities_move.name, run.authorities_move_id)],
    }


def s8_summary(ctx):
    t = PayrollRun.objects.get(pk=ctx["run"]).totals()
    return {
        "explanation": (f"For {m(t['net'])} that employees actually received, the company spent {m(t['cost'])} in total. "
                        f"That's {(t['cost'] / t['net']):.2f}× the take-home pay. This is why an employee 'costs' much more than "
                        f"their salary."),
        "takeaway": "Total employer cost = gross + employer charges. Net pay is the smallest of the three numbers.",
        "documents": [doc("payroll", "Payroll", ctx["run"]), doc("report", "Profit & Loss", "/reports/profit-loss")],
    }


# =============================================================================================
# 9. Employee expense claim (HR + Accounting)
# =============================================================================================
def s9_submit(ctx):
    employee = Employee.objects.filter(job_title__icontains="Sales").first() or Employee.objects.first()
    claim = ExpenseClaim.objects.create(employee=employee, description="Hotel in Tangier – client meeting",
                                        account=Account.objects.get(code="640000"), amount=Decimal("180"))
    ctx.update(claim=claim.id)
    return {
        "explanation": (f"{employee.name} travelled to Tangier to meet a client and paid the {m(claim.amount)} hotel with their own "
                        f"card. Back at the office, they submit an expense claim with a photo of the receipt."),
        "takeaway": "An expense claim = an employee asks the company to pay them back.",
        "documents": [doc("expense", claim.description, claim.id)],
    }


def s9_approve(ctx):
    claim = hr.approve_expense(ExpenseClaim.objects.get(pk=ctx["claim"]))
    return {
        "explanation": (f"The manager checks the receipt and approves. The ERP records the cost: Travel & Fuel (expense) goes up by "
                        f"{m(claim.amount)}, and the company now OWES {claim.employee.name} that amount (Employee Expenses Payable)."),
        "takeaway": "Approval = the cost is real and the company owes the employee.",
        "documents": [doc("entry", claim.move.name, claim.move_id)],
    }


def s9_reimburse(ctx):
    claim = hr.reimburse_expense(ExpenseClaim.objects.get(pk=ctx["claim"]))
    return {
        "explanation": f"Accounting transfers {m(claim.amount)} to {claim.employee.name}. Bank goes down and the debt to the employee is cleared.",
        "takeaway": "Reimbursing doesn't change profit again: the expense was already recorded at approval.",
        "documents": [doc("entry", claim.payment_move.name, claim.payment_move_id)],
    }


# =============================================================================================
# 10. Buy a delivery van (fixed assets & depreciation)
# =============================================================================================
def s10_buy(ctx):
    a = Account.objects.get
    vendor, _ = Partner.objects.get_or_create(name="AutoPro Vehicles", defaults=dict(
        city="Casablanca", country="Morocco", is_vendor=True, payment_term=PaymentTerm.objects.filter(days=30).first(),
        receivable_account=a(code="121000"), payable_account=a(code="211000")))
    van = FixedAsset.objects.create(name=unique_name(FixedAsset, "name", "Delivery van"), account=a(code="153000"),
                                    value=Decimal("24000"), useful_life_months=60)
    assets.purchase(van, vendor)
    ctx.update(asset=van.id)
    return {
        "explanation": (f"To deliver faster, the company buys a van for {m(van.value)} (+ VAT) from {vendor.name}. The bill "
                        f"{van.bill.name} is posted to Vehicles, a FIXED ASSET, not to expenses: we'll use the van for about 5 years, "
                        f"so it would be wrong to count its whole price as this month's cost."),
        "takeaway": "Things used for years are assets (Balance Sheet), not expenses (P&L).",
        "documents": [doc("asset", van.name, van.id), doc("bill", van.bill.name, van.bill_id)],
    }


def s10_pay(ctx):
    van = FixedAsset.objects.get(pk=ctx["asset"])
    payment = acc.register_payment(van.bill)
    return {
        "explanation": f"We pay the dealer {m(payment.amount)}. Cash turns into a van: our total assets barely change.",
        "takeaway": "Buying an asset swaps one asset (cash) for another (vehicle). Profit is unchanged.",
        "documents": [doc("entry", payment.name, payment.move_id)],
    }


def s10_depreciate(ctx):
    van = FixedAsset.objects.get(pk=ctx["asset"])
    line = assets.depreciate_next(van)
    return {
        "explanation": (f"At month-end, the accountant posts depreciation: {m(line.amount)} ({m(van.value)} ÷ "
                        f"{van.useful_life_months} months). Depreciation Expense goes up, and the van's book value goes down via "
                        f"Accumulated Depreciation. Book value is now {m(van.book_value)}."),
        "takeaway": "Depreciation spreads the asset's cost over the years it's used: a little expense every month.",
        "documents": [doc("asset", van.name, van.id), doc("entry", line.move.name, line.move_id)],
    }


def s10_year(ctx):
    van = FixedAsset.objects.get(pk=ctx["asset"])
    for _ in range(11):
        assets.depreciate_next(van)
    van = FixedAsset.objects.get(pk=van.pk)
    return {
        "explanation": (f"Fast-forward one year: 11 more monthly entries are posted. After 12 months the van has cost "
                        f"{m(van.depreciated)} in depreciation and its book value is {m(van.book_value)}. In 4 more years it "
                        f"will reach zero."),
        "takeaway": "Book value = purchase price − accumulated depreciation. Check it on the asset's schedule.",
        "documents": [doc("asset", van.name, van.id), doc("report", "Balance Sheet", "/reports/balance-sheet")],
    }

SCENARIOS = {s.key: s for s in [
    Scenario("sell", "Sell office chairs", "A customer buys 5 chairs: from the first phone call to the money in the bank.",
             "Chapter 3 · Sales", "ShoppingBag", "green", [
                 Step("Customer asks for a price", "Salesperson", s1_quote, lambda c: ensure_available("CHAIR-001", 5)),
                 Step("Customer accepts: confirm the order", "Salesperson", s1_confirm),
                 Step("Warehouse ships the chairs", "Warehouse", s1_ship),
                 Step("Send the invoice", "Accountant", s1_invoice),
                 Step("Customer pays", "Accountant", s1_pay),
                 Step("What did we really earn?", "Manager", s1_summary),
             ]),
    Scenario("buy", "Restock from a vendor", "We buy 10 chairs at a better price: RFQ, receipt, bill and payment.",
             "Chapter 4 · Purchasing", "ShoppingCart", "orange", [
                 Step("Ask the vendor for a price (RFQ)", "Purchaser", s2_rfq),
                 Step("Vendor agrees: confirm the purchase", "Purchaser", s2_confirm),
                 Step("Goods arrive at the warehouse", "Warehouse", s2_receive),
                 Step("The vendor's bill arrives", "Accountant", s2_bill),
                 Step("Pay the vendor", "Accountant", s2_pay),
                 Step("Did buying cost us profit?", "Manager", s2_summary),
             ]),
    Scenario("make", "Make desks to order", "A customer orders 2 standing desks that our workshop builds from components.",
             "Chapter 6 · Manufacturing", "Factory", "purple", [
                 Step("Customer orders 2 standing desks", "Salesperson", s3_order),
                 Step("Plan production from the recipe", "Planner", s3_plan, s3_prepare_components),
                 Step("Workshop builds the desks", "Workshop", s3_produce),
                 Step("Deliver to the customer", "Warehouse", s3_ship),
                 Step("Invoice and get paid", "Accountant", s3_invoice),
                 Step("How much did we make?", "Manager", s3_summary),
             ]),
    Scenario("credit", "The late payer", "A new customer pays only half, and the credit limit blocks their next order.",
             "Chapter 3 · Credit control", "ShieldAlert", "pink", [
                 Step("Register a new customer", "Sales manager", s4_customer),
                 Step("First order: delivered and invoiced", "Salesperson", s4_first_order, lambda c: ensure_available("CHAIR-002", 5)),
                 Step("Customer pays only half", "Accountant", s4_partial),
                 Step("New order is blocked", "Salesperson", s4_blocked),
                 Step("Customer pays the rest", "Accountant", s4_pay_rest),
                 Step("Try again: order confirmed", "Salesperson", s4_retry),
             ]),
    Scenario("close", "Month-end close", "Count the stock, pay rent and salaries, settle VAT and read the month's profit.",
             "Chapter 7 · Accounting", "CalendarCheck", "blue", [
                 Step("Count the warehouse", "Warehouse", s5_count, s5_prepare_count),
                 Step("Pay the rent", "Accountant", s5_rent),
                 Step("Pay the team (payroll)", "HR officer", s5_salaries),
                 Step("Settle VAT with the state", "Accountant", s5_vat),
                 Step("Read the month's result", "Manager", s5_pl),
             ]),
    Scenario("lead", "Win a new client", "A website inquiry becomes a qualified opportunity, a quotation, and a signed order.",
             "Chapter 3 · CRM", "Target", "teal", [
                 Step("A lead arrives from the website", "Salesperson", s6_lead),
                 Step("Qualify the lead", "Salesperson", s6_qualify),
                 Step("Send a proposal", "Salesperson", s6_quote),
                 Step("Customer signs: opportunity won", "Sales manager", s6_won, lambda c: " ".join(filter(None, [ensure_available(s, n) for s, n in LEAD_ITEMS])) or None),
                 Step("Read the sales pipeline", "Sales manager", s6_summary),
             ]),
    Scenario("return", "Customer returns a chair", "A paid order, a damaged item, a return, a credit note and a refund.",
             "Chapter 3 · After-sales", "Undo2", "yellow", [
                 Step("A completed sale", "Salesperson", s7_sale, lambda c: ensure_available("CHAIR-001", 3)),
                 Step("Customer reports a damaged chair", "Customer service", s7_return),
                 Step("The chair comes back to the warehouse", "Warehouse", s7_receive),
                 Step("Issue a credit note", "Accountant", s7_credit),
                 Step("Refund the customer", "Accountant", s7_refund),
                 Step("What's left of the sale?", "Manager", s7_summary),
             ]),
    Scenario("payroll", "Run the monthly payroll", "From gross salaries to net pay, employer charges and payments to the state.",
             "Chapter 8 · HR & Payroll", "Users", "indigo", [
                 Step("Check the team", "HR officer", s8_team),
                 Step("Compute the payslips", "HR officer", s8_compute),
                 Step("Post the payroll", "Accountant", s8_post),
                 Step("Pay the employees", "Accountant", s8_pay),
                 Step("Pay social security and tax", "Accountant", s8_authorities),
                 Step("What does an employee really cost?", "Manager", s8_summary),
             ]),
    Scenario("expense", "Employee expense claim", "An employee pays a business hotel themselves and gets reimbursed.",
             "Chapter 8 · HR & Expenses", "Receipt", "teal", [
                 Step("Employee submits a receipt", "Employee", s9_submit),
                 Step("Manager approves", "Manager", s9_approve),
                 Step("Reimburse the employee", "Accountant", s9_reimburse),
             ]),
    Scenario("asset", "Buy a delivery van", "A big purchase that is not an expense: fixed assets and depreciation.",
             "Chapter 7 · Fixed assets", "Truck", "orange", [
                 Step("Buy the van", "Manager", s10_buy),
                 Step("Pay the dealer", "Accountant", s10_pay),
                 Step("First month of depreciation", "Accountant", s10_depreciate),
                 Step("One year later", "Accountant", s10_year),
             ]),
]}

# Learning order: follow the money from the first contact with a customer to the month-end close.
ORDER = ["lead", "sell", "return", "credit", "buy", "make", "payroll", "expense", "asset", "close"]
SCENARIOS = {k: SCENARIOS[k] for k in ORDER}
