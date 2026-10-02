"""The five guided scenarios. Each step does real work through the ERP services and explains it."""

import math
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounting import reports
from accounting import services as acc
from accounting.models import Account, Move, MoveLine
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
    entry = manual(f"Salaries {timezone.localdate():%B}", "620000", "101000", Decimal(4200))
    return {
        "explanation": "Salaries of $4,200 are paid to the team. Salaries (an expense) go up, Bank goes down.",
        "takeaway": "People are usually the biggest running cost of a company.",
        "documents": [doc("entry", entry.name, entry.id)],
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


SCENARIOS = {s.key: s for s in [
    Scenario("sell", "Sell office chairs", "A customer buys 5 chairs: from the first phone call to the money in the bank.",
             "Step 3 · Order-to-Cash", "ShoppingBag", "green", [
                 Step("Customer asks for a price", "Salesperson", s1_quote, lambda c: ensure_available("CHAIR-001", 5)),
                 Step("Customer accepts: confirm the order", "Salesperson", s1_confirm),
                 Step("Warehouse ships the chairs", "Warehouse", s1_ship),
                 Step("Send the invoice", "Accountant", s1_invoice),
                 Step("Customer pays", "Accountant", s1_pay),
                 Step("What did we really earn?", "Manager", s1_summary),
             ]),
    Scenario("buy", "Restock from a vendor", "We buy 10 chairs at a better price: RFQ, receipt, bill and payment.",
             "Step 4 · Procure-to-Pay", "ShoppingCart", "orange", [
                 Step("Ask the vendor for a price (RFQ)", "Purchaser", s2_rfq),
                 Step("Vendor agrees: confirm the purchase", "Purchaser", s2_confirm),
                 Step("Goods arrive at the warehouse", "Warehouse", s2_receive),
                 Step("The vendor's bill arrives", "Accountant", s2_bill),
                 Step("Pay the vendor", "Accountant", s2_pay),
                 Step("Did buying cost us profit?", "Manager", s2_summary),
             ]),
    Scenario("make", "Make desks to order", "A customer orders 2 standing desks that our workshop builds from components.",
             "Step 7 · Manufacturing", "Factory", "purple", [
                 Step("Customer orders 2 standing desks", "Salesperson", s3_order),
                 Step("Plan production from the recipe", "Planner", s3_plan, s3_prepare_components),
                 Step("Workshop builds the desks", "Workshop", s3_produce),
                 Step("Deliver to the customer", "Warehouse", s3_ship),
                 Step("Invoice and get paid", "Accountant", s3_invoice),
                 Step("How much did we make?", "Manager", s3_summary),
             ]),
    Scenario("credit", "The late payer", "A new customer pays only half, and the credit limit blocks their next order.",
             "Step 2 + 3 · Credit control", "ShieldAlert", "pink", [
                 Step("Register a new customer", "Sales manager", s4_customer),
                 Step("First order: delivered and invoiced", "Salesperson", s4_first_order, lambda c: ensure_available("CHAIR-002", 5)),
                 Step("Customer pays only half", "Accountant", s4_partial),
                 Step("New order is blocked", "Salesperson", s4_blocked),
                 Step("Customer pays the rest", "Accountant", s4_pay_rest),
                 Step("Try again: order confirmed", "Salesperson", s4_retry),
             ]),
    Scenario("close", "Month-end close", "Count the stock, pay rent and salaries, settle VAT and read the month's profit.",
             "Step 6 · Accounting", "CalendarCheck", "blue", [
                 Step("Count the warehouse", "Warehouse", s5_count, s5_prepare_count),
                 Step("Pay the rent", "Accountant", s5_rent),
                 Step("Pay the salaries", "Accountant", s5_salaries),
                 Step("Settle VAT with the state", "Accountant", s5_vat),
                 Step("Read the month's result", "Manager", s5_pl),
             ]),
]}
