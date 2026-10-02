from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounting.models import MoveLine
from accounting.services import LineSpec, create_entry
from inventory import services as stock
from inventory.models import Picking, StockMove
from masterdata.models import Product, Sequence

from .models import BillOfMaterials, ManufacturingOrder

ZERO = Decimal("0")
CENT = Decimal("0.01")


def new_mo_name() -> str:
    return f"WH/MO/{Sequence.next('mrp.production'):05d}"


def components(mo: ManufacturingOrder) -> list[dict]:
    """Component needs for this MO, with current availability."""
    lines = list(mo.bom.lines.select_related("component__uom"))
    on_hand = stock.on_hand_map([l.component_id for l in lines])
    reserved = stock.reserved_map([l.component_id for l in lines])
    out = []
    for l in lines:
        need = (l.quantity * mo.factor).quantize(Decimal("0.001"))
        available = on_hand.get(l.component_id, ZERO) - reserved.get(l.component_id, ZERO)
        out.append({
            "product": l.component_id, "sku": l.component.sku, "name": l.component.name, "uom": l.component.uom.name,
            "quantity": need, "available": available, "cost": l.component.cost,
            "value": (need * l.component.cost).quantize(CENT), "ok": not l.component.tracks_stock or available >= need,
        })
    return out


@transaction.atomic
def create(bom: BillOfMaterials, quantity: Decimal, origin: str = "") -> ManufacturingOrder:
    if quantity <= 0:
        raise ValidationError("Quantity to produce must be positive.")
    return ManufacturingOrder.objects.create(name=new_mo_name(), product=bom.product, bom=bom, quantity=quantity, origin=origin)


@transaction.atomic
def confirm(mo: ManufacturingOrder) -> ManufacturingOrder:
    if mo.state != ManufacturingOrder.State.DRAFT:
        raise ValidationError("Only draft manufacturing orders can be confirmed.")
    mo.state = ManufacturingOrder.State.CONFIRMED
    mo.save(update_fields=["state"])
    return mo


@transaction.atomic
def produce(mo: ManufacturingOrder) -> ManufacturingOrder:
    """Consume components, produce the finished good, and move their value between inventory lines."""
    if mo.state != ManufacturingOrder.State.CONFIRMED:
        raise ValidationError("Confirm the manufacturing order before producing.")
    needs = components(mo)
    short = [f"{c['name']} (need {c['quantity']:g}, have {c['available']:g})" for c in needs if not c["ok"]]
    if short:
        raise ValidationError("Missing components: " + "; ".join(short))

    internal, production = stock.location("internal"), stock.location("production")
    now = timezone.now()
    lines: list[LineSpec] = []
    total = ZERO
    for c in needs:
        comp = Product.objects.select_related("category").get(pk=c["product"])
        StockMove.objects.create(production=mo, product=comp, quantity=c["quantity"], source_location=internal,
                                 dest_location=production, unit_cost=comp.cost, state=Picking.State.DONE, date=now)
        if comp.tracks_stock and c["value"]:
            lines.append(LineSpec(comp.category.stock_valuation_account, credit=c["value"], name=f"{mo.name} – consume {comp.name}",
                                  kind=MoveLine.Kind.STOCK, product=comp, quantity=c["quantity"], price_unit=comp.cost))
        total += c["value"]

    product = mo.product
    unit_cost = (total / mo.quantity).quantize(CENT)
    on_hand = stock.on_hand_map([product.id]).get(product.id, ZERO)
    StockMove.objects.create(production=mo, product=product, quantity=mo.quantity, source_location=production,
                             dest_location=internal, unit_cost=unit_cost, state=Picking.State.DONE, date=now)
    stock.apply_average_cost(product, on_hand, mo.quantity, unit_cost)
    if total:
        lines.insert(0, LineSpec(product.category.stock_valuation_account, debit=total, name=f"{mo.name} – produce {product.name}",
                                 kind=MoveLine.Kind.STOCK, product=product, quantity=mo.quantity, price_unit=unit_cost))
        create_entry("STJ", lines, ref=mo.name, production=mo)

    mo.state, mo.date_done, mo.unit_cost = ManufacturingOrder.State.DONE, now, unit_cost
    mo.save(update_fields=["state", "date_done", "unit_cost"])
    return mo


@transaction.atomic
def cancel(mo: ManufacturingOrder) -> ManufacturingOrder:
    if mo.state == ManufacturingOrder.State.DONE:
        raise ValidationError("A finished manufacturing order cannot be cancelled.")
    mo.state = ManufacturingOrder.State.CANCEL
    mo.save(update_fields=["state"])
    return mo
