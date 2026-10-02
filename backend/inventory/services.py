from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounting.models import Account, MoveLine
from accounting.services import LineSpec, create_entry
from masterdata.models import Product, Sequence

from .models import Location, Picking, StockMove

ZERO = Decimal("0")
CENT = Decimal("0.01")
PREFIX = {Picking.Kind.INCOMING: "IN", Picking.Kind.OUTGOING: "OUT", Picking.Kind.ADJUSTMENT: "ADJ"}

# Accounts balancing stock valuation when the picking doesn't name one.
INTERIM_RECEIVED = "110200"   # goods received, vendor bill not yet posted
INVENTORY_DIFFERENCES = "630000"  # count corrections (shrinkage, breakage, found items)


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
    """Quantity promised to customers or production on moves not yet done."""
    pending = StockMove.objects.filter(state=Picking.State.READY, source_location__usage="internal")
    if product_ids is not None:
        pending = pending.filter(product_id__in=product_ids)
    return {r["product"]: r["q"] for r in pending.values("product").annotate(q=Sum("quantity"))}


def incoming_map() -> dict[int, Decimal]:
    """Quantity expected from vendors on receipts not yet done."""
    pending = StockMove.objects.filter(state=Picking.State.READY, dest_location__usage="internal", picking__kind=Picking.Kind.INCOMING)
    return {r["product"]: r["q"] for r in pending.values("product").annotate(q=Sum("quantity"))}


def new_picking_name(kind: str) -> str:
    number = Sequence.next(f"picking/{kind}")
    return f"WH/{PREFIX[kind]}/{number:05d}"


@transaction.atomic
def create_picking(kind: str, lines: list[dict], *, partner=None, origin="", sale_order=None, purchase_order=None,
                   outbound_adjustment=False, counterpart_account=None) -> Picking:
    """lines: [{"product", "quantity", optional "sale_line" / "purchase_line"}]."""
    internal = location("internal")
    if kind == Picking.Kind.OUTGOING:
        src, dst = internal, location("customer")
    elif kind == Picking.Kind.INCOMING:
        src, dst = location("supplier"), internal
    else:
        src, dst = (internal, location("inventory")) if outbound_adjustment else (location("inventory"), internal)
    picking = Picking.objects.create(
        name=new_picking_name(kind), kind=kind, partner=partner, origin=origin, sale_order=sale_order,
        purchase_order=purchase_order, source_location=src, dest_location=dst, counterpart_account=counterpart_account,
    )
    for line in lines:
        StockMove.objects.create(
            picking=picking, product=line["product"], quantity=line["quantity"], source_location=src,
            dest_location=dst, sale_line=line.get("sale_line"), purchase_line=line.get("purchase_line"),
        )
    return picking


def check_availability(moves) -> None:
    stock = on_hand_map([m.product_id for m in moves])
    needed: dict[int, Decimal] = {}
    for m in moves:
        if m.product.tracks_stock:
            needed[m.product_id] = needed.get(m.product_id, ZERO) + m.quantity
    short = [
        f"{m.product.name} (need {needed[m.product_id]:g}, have {stock.get(m.product_id, ZERO):g})"
        for m in {m.product_id: m for m in moves}.values()
        if m.product_id in needed and stock.get(m.product_id, ZERO) < needed[m.product_id]
    ]
    if short:
        raise ValidationError("Not enough stock: " + "; ".join(short))


def apply_average_cost(product: Product, on_hand: Decimal, qty_in: Decimal, unit_price: Decimal) -> None:
    """Average cost (AVCO): the new cost blends the old stock with the incoming goods."""
    if on_hand <= 0:
        product.cost = unit_price
    else:
        product.cost = ((on_hand * product.cost + qty_in * unit_price) / (on_hand + qty_in)).quantize(CENT)
    product.save(update_fields=["cost"])


def _default_counterpart(picking: Picking, product: Product, outgoing: bool) -> Account:
    if picking.counterpart_account_id:
        return picking.counterpart_account
    if picking.kind == Picking.Kind.ADJUSTMENT:
        return Account.objects.get(code=INVENTORY_DIFFERENCES)
    if outgoing:
        return product.category.expense_account  # cost of goods sold
    return Account.objects.get(code=INTERIM_RECEIVED)


@transaction.atomic
def validate(picking: Picking) -> Picking:
    """Mark a transfer done and post its stock valuation entry (perpetual inventory)."""
    if picking.state != Picking.State.READY:
        raise ValidationError(f"{picking.name} is already {picking.get_state_display().lower()}.")
    moves = list(picking.moves.select_related("product__category", "sale_line", "purchase_line"))
    outgoing = picking.source_location.usage == "internal"
    if outgoing:
        check_availability(moves)
    running = on_hand_map([m.product_id for m in moves])

    now = timezone.now()
    lines: list[LineSpec] = []
    for m in moves:
        product = m.product
        price = m.purchase_line.price_unit if m.purchase_line_id else product.cost
        if not outgoing and product.tracks_stock and m.purchase_line_id:
            apply_average_cost(product, running.get(product.id, ZERO), m.quantity, price)
        running[product.id] = running.get(product.id, ZERO) + (-m.quantity if outgoing else m.quantity)

        m.state, m.date, m.unit_cost = Picking.State.DONE, now, price
        m.save(update_fields=["state", "date", "unit_cost"])
        if m.sale_line_id:
            m.sale_line.qty_delivered += m.quantity
            m.sale_line.save(update_fields=["qty_delivered"])
        if m.purchase_line_id:
            m.purchase_line.qty_received += m.quantity
            m.purchase_line.save(update_fields=["qty_received"])

        if not product.tracks_stock:
            continue
        value = (m.quantity * price).quantize(CENT)
        if value == 0:
            continue
        stock_acc = product.category.stock_valuation_account
        other = _default_counterpart(picking, product, outgoing)
        other_kind = MoveLine.Kind.COGS if other.account_type == Account.Type.COST_OF_REVENUE else MoveLine.Kind.OTHER
        label = f"{picking.name} – {product.name}"
        common = dict(product=product, quantity=m.quantity, price_unit=price, partner=picking.partner)
        if outgoing:
            lines += [LineSpec(other, debit=value, name=label, kind=other_kind, **common),
                      LineSpec(stock_acc, credit=value, name=label, kind=MoveLine.Kind.STOCK, **common)]
        else:
            lines += [LineSpec(stock_acc, debit=value, name=label, kind=MoveLine.Kind.STOCK, **common),
                      LineSpec(other, credit=value, name=label, kind=other_kind, **common)]

    picking.state, picking.date_done = Picking.State.DONE, now
    picking.save(update_fields=["state", "date_done"])
    if lines:
        create_entry("STJ", lines, ref=picking.name, picking=picking)
    return picking


@transaction.atomic
def adjust(product: Product, counted: Decimal, reason: str = "") -> Picking | None:
    """Physical count: post the difference between what the system thinks and what is on the shelf."""
    if not product.tracks_stock:
        raise ValidationError("Only storable products have a stock quantity to count.")
    if counted < 0:
        raise ValidationError("Counted quantity cannot be negative.")
    current = on_hand_map([product.id]).get(product.id, ZERO)
    diff = counted - current
    if diff == 0:
        return None
    picking = create_picking(
        Picking.Kind.ADJUSTMENT, [{"product": product, "quantity": abs(diff)}],
        origin=reason or f"Count {product.sku}: {current:g} → {counted:g}", outbound_adjustment=diff < 0,
    )
    return validate(picking)


def low_stock_products():
    stock = on_hand_map()
    return [
        (p, stock.get(p.id, ZERO))
        for p in Product.objects.filter(product_type=Product.Type.STORABLE, active=True).filter(~Q(reorder_min=0))
        if stock.get(p.id, ZERO) <= p.reorder_min
    ]
