from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounting import services as acc
from accounting.models import Account, Move, MoveLine
from inventory import services as stock
from inventory.models import Picking
from masterdata.models import Product, Sequence

from .models import PurchaseOrder, PurchaseOrderLine

ZERO = Decimal("0")


def new_order_name() -> str:
    return f"P{Sequence.next('purchase.order'):05d}"


@transaction.atomic
def confirm(order: PurchaseOrder) -> PurchaseOrder:
    """RFQ → Purchase Order: the vendor accepted, so we expect a receipt."""
    if order.state != PurchaseOrder.State.DRAFT:
        raise ValidationError("Only RFQs can be confirmed.")
    lines = list(order.lines.select_related("product"))
    if not lines:
        raise ValidationError("Add at least one product line before confirming.")
    order.state = PurchaseOrder.State.PURCHASE
    order.confirmed_at = timezone.now()
    order.save(update_fields=["state", "confirmed_at"])

    to_receive = [{"product": l.product, "quantity": l.quantity, "purchase_line": l} for l in lines if l.product.is_deliverable]
    if to_receive:
        stock.create_picking(Picking.Kind.INCOMING, to_receive, partner=order.partner, origin=order.name, purchase_order=order)
    return order


@transaction.atomic
def cancel(order: PurchaseOrder) -> PurchaseOrder:
    if order.pickings.filter(state=Picking.State.DONE).exists() or order.bills.filter(state=Move.State.POSTED).exists():
        raise ValidationError("Cannot cancel: goods were already received or billed.")
    for p in order.pickings.all():
        p.moves.update(state=Picking.State.CANCEL)
    order.pickings.filter(state=Picking.State.READY).update(state=Picking.State.CANCEL)
    order.bills.filter(state=Move.State.DRAFT).update(state=Move.State.CANCEL)
    order.state = PurchaseOrder.State.CANCEL
    order.save(update_fields=["state"])
    return order


@transaction.atomic
def create_bill(order: PurchaseOrder) -> Move:
    """Draft vendor bill for what was received (three-way match: PO = receipt = bill)."""
    if order.state != PurchaseOrder.State.PURCHASE:
        raise ValidationError("Confirm the RFQ before billing.")
    if order.bills.filter(state=Move.State.DRAFT).exists():
        raise ValidationError("A draft bill already exists for this order. Confirm or cancel it first.")
    lines = [l for l in order.lines.select_related("product__category", "tax") if l.qty_to_bill > 0]
    if not lines:
        raise ValidationError("Nothing to bill: receive the goods first.")

    partner = order.partner
    today = timezone.localdate()
    bill = Move.objects.create(
        move_type=Move.MoveType.IN_INVOICE, journal=acc.journal("BILL"), partner=partner, date=today,
        invoice_date_due=acc.due_date(today, partner), ref=order.name, purchase_order=order,
    )
    interim = Account.objects.get(code=stock.INTERIM_RECEIVED)
    untaxed = tax_total = ZERO
    taxes: dict[int, list] = {}
    for l in lines:
        qty = l.qty_to_bill
        base = (qty * l.price_unit).quantize(Decimal("0.01"))
        # Storable goods were already valued at receipt; the bill clears the interim account.
        account = interim if l.product.tracks_stock else l.product.category.expense_account
        MoveLine.objects.create(
            move=bill, account=account, partner=partner, product=l.product, name=l.description or l.product.name,
            kind=MoveLine.Kind.PRODUCT, quantity=qty, price_unit=l.price_unit, tax=l.tax, debit=base,
        )
        untaxed += base
        if l.tax:
            amount = l.tax.compute(base)
            taxes.setdefault(l.tax_id, [l.tax, ZERO])[1] += amount
            tax_total += amount
        l.qty_billed += qty
        l.save(update_fields=["qty_billed"])

    for tax, amount in taxes.values():
        MoveLine.objects.create(move=bill, account=tax.account, partner=partner, name=tax.name,
                                kind=MoveLine.Kind.TAX, tax=tax, debit=amount)
    total = untaxed + tax_total
    MoveLine.objects.create(move=bill, account=partner.payable_account, partner=partner,
                            name=f"Due {bill.invoice_date_due}", kind=MoveLine.Kind.PAYABLE, credit=total)
    bill.amount_untaxed, bill.amount_tax, bill.amount_total = untaxed, tax_total, total
    bill.save(update_fields=["amount_untaxed", "amount_tax", "amount_total"])
    return bill


def flow(order: PurchaseOrder) -> dict:
    pickings = list(order.pickings.prefetch_related("moves__product__uom", "valuation_moves").exclude(state=Picking.State.CANCEL))
    bills = list(order.bills.exclude(state=Move.State.CANCEL).prefetch_related("lines__account", "payments"))
    payments = [p for b in bills for p in b.payments.all()]
    ids = ([b.pk for b in bills if b.state == Move.State.POSTED]
           + [m.pk for p in pickings for m in p.valuation_moves.all()]
           + [p.move_id for p in payments if p.move_id])
    entries = Move.objects.filter(pk__in=ids).select_related("journal", "partner").prefetch_related("lines__account", "lines__product").order_by("created_at", "id")
    return {"pickings": pickings, "bills": bills, "payments": payments, "entries": entries}


def replenishment() -> list[dict]:
    """Storable products whose forecast (available + incoming) is at or below the reorder point."""
    on_hand, reserved, incoming = stock.on_hand_map(), stock.reserved_map(), stock.incoming_map()
    rows = []
    products = Product.objects.filter(product_type=Product.Type.STORABLE, active=True, reorder_min__gt=0).select_related("vendor", "uom")
    for p in products:
        available = on_hand.get(p.id, ZERO) - reserved.get(p.id, ZERO)
        forecast = available + incoming.get(p.id, ZERO)
        if forecast > p.reorder_min:
            continue
        # Order back up to twice the reorder point.
        suggested = max(p.reorder_min * 2 - forecast, Decimal("1"))
        rows.append({
            "id": p.id, "sku": p.sku, "name": p.name, "uom": p.uom.name, "on_hand": on_hand.get(p.id, ZERO),
            "available": available, "incoming": incoming.get(p.id, ZERO), "forecast": forecast,
            "reorder_min": p.reorder_min, "suggested": suggested.quantize(Decimal("1")), "cost": p.cost,
            "vendor": p.vendor_id, "vendor_name": p.vendor.name if p.vendor else None,
        })
    return rows


@transaction.atomic
def create_rfqs(items: list[dict]) -> list[PurchaseOrder]:
    """items: [{"product": id, "quantity": n}]. One RFQ per vendor."""
    by_vendor: dict[int, list] = defaultdict(list)
    for item in items:
        product = Product.objects.select_related("vendor").get(pk=item["product"])
        if not product.vendor:
            raise ValidationError(f"{product.name} has no vendor. Set one on the product first.")
        by_vendor[product.vendor_id].append((product, Decimal(str(item["quantity"]))))
    orders = []
    for lines in by_vendor.values():
        vendor = lines[0][0].vendor
        order = PurchaseOrder.objects.create(name=new_order_name(), partner=vendor, payment_term=vendor.payment_term,
                                             note="Created by replenishment")
        for product, qty in lines:
            PurchaseOrderLine.objects.create(order=order, product=product, description=product.name, quantity=qty,
                                             price_unit=product.cost, tax=product.purchase_tax)
        order.compute_amounts()
        orders.append(order)
    return orders
