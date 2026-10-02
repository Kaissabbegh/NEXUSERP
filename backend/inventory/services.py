from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounting.models import MoveLine
from accounting.services import LineSpec, create_entry
from masterdata.models import Product, Sequence

from .models import Location, Picking, StockMove

ZERO = Decimal("0")
PREFIX = {Picking.Kind.INCOMING: "IN", Picking.Kind.OUTGOING: "OUT", Picking.Kind.ADJUSTMENT: "ADJ"}


def location(usage: str) -> Location:
    return Location.objects.filter(usage=usage).order_by("id").first()


def on_hand_map(product_ids=None) -> dict[int, Decimal]:
    """Quantity in internal locations per product, from done moves only."""
    done = StockMove.objects.filter(state=Picking.State.DONE)
    if product_ids is not None:
        done = done.filter(product_id__in=product_ids)
    incoming = done.filter(dest_location__usage="internal").values("product").annotate(q=Sum("quantity"))
    outgoing = done.filter(source_location__usage="internal").values("product").annotate(q=Sum("quantity"))
    result: dict[int, Decimal] = {}
    for row in incoming:
        result[row["product"]] = result.get(row["product"], ZERO) + row["q"]
    for row in outgoing:
        result[row["product"]] = result.get(row["product"], ZERO) - row["q"]
    return result


def reserved_map(product_ids=None) -> dict[int, Decimal]:
    """Quantity promised to customers on deliveries not yet done."""
    pending = StockMove.objects.filter(state=Picking.State.READY, source_location__usage="internal")
    if product_ids is not None:
        pending = pending.filter(product_id__in=product_ids)
    return {r["product"]: r["q"] for r in pending.values("product").annotate(q=Sum("quantity"))}


def new_picking_name(kind: str) -> str:
    number = Sequence.next(f"picking/{kind}")
    return f"WH/{PREFIX[kind]}/{number:05d}"


@transaction.atomic
def create_picking(kind: str, lines: list[tuple[Product, Decimal]], partner=None, origin="", sale_order=None) -> Picking:
    internal = location("internal")
    src, dst = {
        Picking.Kind.OUTGOING: (internal, location("customer")),
        Picking.Kind.INCOMING: (location("supplier"), internal),
        Picking.Kind.ADJUSTMENT: (location("inventory"), internal),
    }[kind]
    picking = Picking.objects.create(
        name=new_picking_name(kind), kind=kind, partner=partner, origin=origin, sale_order=sale_order,
        source_location=src, dest_location=dst,
    )
    for item in lines:
        product, qty, *rest = item
        StockMove.objects.create(
            picking=picking, product=product, quantity=qty, source_location=src, dest_location=dst,
            sale_line=rest[0] if rest else None,
        )
    return picking


@transaction.atomic
def validate(picking: Picking) -> Picking:
    """Mark a transfer done and post its stock valuation entry (perpetual inventory)."""
    if picking.state != Picking.State.READY:
        raise ValidationError(f"{picking.name} is already {picking.get_state_display().lower()}.")
    moves = list(picking.moves.select_related("product__category"))
    outgoing = picking.source_location.usage == "internal"

    if outgoing:
        stock = on_hand_map([m.product_id for m in moves])
        short = [f"{m.product.name} (need {m.quantity:g}, have {stock.get(m.product_id, ZERO):g})"
                 for m in moves if m.product.tracks_stock and stock.get(m.product_id, ZERO) < m.quantity]
        if short:
            raise ValidationError("Not enough stock: " + "; ".join(short))

    now = timezone.now()
    lines: list[LineSpec] = []
    for m in moves:
        m.state, m.date, m.unit_cost = Picking.State.DONE, now, m.product.cost
        m.save(update_fields=["state", "date", "unit_cost"])
        if m.sale_line_id:
            m.sale_line.qty_delivered += m.quantity
            m.sale_line.save(update_fields=["qty_delivered"])
        if not m.product.tracks_stock:
            continue
        value = (m.quantity * m.unit_cost).quantize(Decimal("0.01"))
        if value == 0:
            continue
        cat = m.product.category
        label = f"{picking.name} – {m.product.name}"
        common = dict(product=m.product, quantity=m.quantity, price_unit=m.unit_cost, partner=picking.partner)
        if outgoing:
            lines += [
                LineSpec(cat.expense_account, debit=value, name=label, kind=MoveLine.Kind.COGS, **common),
                LineSpec(cat.stock_valuation_account, credit=value, name=label, kind=MoveLine.Kind.STOCK, **common),
            ]
        else:
            counterpart = _counterpart_account(picking)
            lines += [
                LineSpec(cat.stock_valuation_account, debit=value, name=label, kind=MoveLine.Kind.STOCK, **common),
                LineSpec(counterpart, credit=value, name=label, kind=MoveLine.Kind.OTHER, **common),
            ]

    picking.state, picking.date_done = Picking.State.DONE, now
    picking.save(update_fields=["state", "date_done"])
    if lines:
        create_entry("STJ", lines, ref=picking.name, picking=picking)
    return picking


def _counterpart_account(picking: Picking):
    from accounting.models import Account
    # Opening stock is funded by equity; vendor receipts wait in an interim account until the bill arrives.
    code = "301000" if picking.kind == Picking.Kind.ADJUSTMENT else "110200"
    return Account.objects.get(code=code)


def low_stock_products():
    stock = on_hand_map()
    return [
        (p, stock.get(p.id, ZERO))
        for p in Product.objects.filter(product_type=Product.Type.STORABLE, active=True).filter(~Q(reorder_min=0))
        if stock.get(p.id, ZERO) <= p.reorder_min
    ]
