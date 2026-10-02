from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounting import services as acc
from accounting.models import Move, MoveLine
from inventory import services as stock
from inventory.models import Picking
from masterdata.models import Sequence

from .models import SaleOrder

ZERO = Decimal("0")


def new_order_name() -> str:
    return f"S{Sequence.next('sale.order'):05d}"


def partner_open_balance(partner) -> Decimal:
    """What the customer still owes us: unpaid posted invoices."""
    total = Move.objects.filter(
        partner=partner, move_type=Move.MoveType.OUT_INVOICE, state=Move.State.POSTED,
    ).aggregate(s=Sum("amount_residual"))["s"]
    return total or ZERO


@transaction.atomic
def confirm(order: SaleOrder) -> SaleOrder:
    if order.state != SaleOrder.State.DRAFT:
        raise ValidationError("Only quotations can be confirmed.")
    lines = list(order.lines.select_related("product"))
    if not lines:
        raise ValidationError("Add at least one product line before confirming.")

    partner = order.partner
    if partner.credit_limit > 0:
        exposure = partner_open_balance(partner) + order.amount_total
        if exposure > partner.credit_limit:
            raise ValidationError(
                f"Credit limit exceeded for {partner.name}: open balance + this order = {exposure}, "
                f"limit is {partner.credit_limit}."
            )

    order.state = SaleOrder.State.SALE
    order.confirmed_at = timezone.now()
    order.save(update_fields=["state", "confirmed_at"])

    to_deliver = [(l.product, l.quantity, l) for l in lines if l.product.is_deliverable]
    if to_deliver:
        stock.create_picking(Picking.Kind.OUTGOING, to_deliver, partner=partner, origin=order.name, sale_order=order)
    return order


@transaction.atomic
def cancel(order: SaleOrder) -> SaleOrder:
    if order.pickings.filter(state=Picking.State.DONE).exists() or order.invoices.filter(state=Move.State.POSTED).exists():
        raise ValidationError("Cannot cancel: goods were already delivered or invoiced.")
    order.pickings.filter(state=Picking.State.READY).update(state=Picking.State.CANCEL)
    for p in order.pickings.all():
        p.moves.update(state=Picking.State.CANCEL)
    order.invoices.filter(state=Move.State.DRAFT).update(state=Move.State.CANCEL)
    order.state = SaleOrder.State.CANCEL
    order.save(update_fields=["state"])
    return order


@transaction.atomic
def create_invoice(order: SaleOrder) -> Move:
    """Draft customer invoice for everything ordered but not yet invoiced."""
    if order.state != SaleOrder.State.SALE:
        raise ValidationError("Confirm the quotation before invoicing.")
    if order.invoices.filter(state=Move.State.DRAFT).exists():
        raise ValidationError("A draft invoice already exists for this order. Confirm or cancel it first.")
    lines = [l for l in order.lines.select_related("product__category", "tax") if l.quantity > l.qty_invoiced]
    if not lines:
        raise ValidationError("Everything on this order is already invoiced.")

    partner = order.partner
    today = timezone.localdate()
    invoice = Move.objects.create(
        move_type=Move.MoveType.OUT_INVOICE, journal=acc.journal("INV"), partner=partner, date=today,
        invoice_date_due=acc.due_date(today, partner), ref=order.name, sale_order=order,
    )

    untaxed = tax_total = ZERO
    taxes: dict[int, tuple] = {}
    for l in lines:
        qty = l.quantity - l.qty_invoiced
        base = (qty * l.price_unit * (Decimal(100) - l.discount) / Decimal(100)).quantize(Decimal("0.01"))
        MoveLine.objects.create(
            move=invoice, account=l.product.category.income_account, partner=partner, product=l.product,
            name=l.description or l.product.name, kind=MoveLine.Kind.PRODUCT, quantity=qty,
            price_unit=l.price_unit, tax=l.tax, credit=base,
        )
        untaxed += base
        if l.tax:
            amount = l.tax.compute(base)
            prev = taxes.get(l.tax_id, (l.tax, ZERO))
            taxes[l.tax_id] = (l.tax, prev[1] + amount)
            tax_total += amount
        l.qty_invoiced += qty
        l.save(update_fields=["qty_invoiced"])

    for tax, amount in taxes.values():
        MoveLine.objects.create(move=invoice, account=tax.account, partner=partner, name=tax.name,
                                kind=MoveLine.Kind.TAX, tax=tax, credit=amount)
    total = untaxed + tax_total
    MoveLine.objects.create(move=invoice, account=partner.receivable_account, partner=partner,
                            name=f"Due {invoice.invoice_date_due}", kind=MoveLine.Kind.RECEIVABLE, debit=total)

    invoice.amount_untaxed, invoice.amount_tax, invoice.amount_total = untaxed, tax_total, total
    invoice.save(update_fields=["amount_untaxed", "amount_tax", "amount_total"])
    return invoice


def flow(order: SaleOrder) -> dict:
    """Everything the Order-to-Cash diagram needs, in one payload."""
    pickings = list(order.pickings.prefetch_related("moves__product").exclude(state=Picking.State.CANCEL))
    invoices = list(order.invoices.exclude(state=Move.State.CANCEL))
    payments = [p for inv in invoices for p in inv.payments.all()]
    entries = (
        Move.objects.filter(state=Move.State.POSTED)
        .filter(
            pk__in=[i.pk for i in invoices if i.state == Move.State.POSTED]
            + [m.pk for p in pickings for m in p.valuation_moves.all()]
            + [p.move_id for p in payments if p.move_id]
        )
        .prefetch_related("lines__account")
        .order_by("created_at", "id")
    )
    return {"pickings": pickings, "invoices": invoices, "payments": payments, "entries": entries}
