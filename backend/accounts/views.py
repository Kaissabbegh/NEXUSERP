from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounting.models import Move
from inventory import services as stock
from inventory.models import Picking
from masterdata.models import Product
from mrp.models import ManufacturingOrder
from purchase.models import PurchaseOrder
from sales.models import SaleOrder

ZERO = Decimal("0")


@api_view(["GET"])
def me(request):
    u = request.user
    return Response({"id": u.id, "username": u.username, "first_name": u.first_name, "last_name": u.last_name,
                     "email": u.email})


@api_view(["GET"])
def dashboard(request):
    today = timezone.localdate()
    month_start = today.replace(day=1)
    invoices = Move.objects.filter(move_type=Move.MoveType.OUT_INVOICE, state=Move.State.POSTED)

    revenue_month = invoices.filter(date__gte=month_start).aggregate(s=Sum("amount_untaxed"))["s"] or ZERO
    receivable = invoices.aggregate(s=Sum("amount_residual"))["s"] or ZERO
    bills = Move.objects.filter(move_type=Move.MoveType.IN_INVOICE, state=Move.State.POSTED)
    payable = bills.aggregate(s=Sum("amount_residual"))["s"] or ZERO
    overdue = invoices.filter(invoice_date_due__lt=today, amount_residual__gt=0).aggregate(s=Sum("amount_residual"))["s"] or ZERO

    on_hand = stock.on_hand_map()
    stock_value = sum(
        (on_hand.get(p.id, ZERO) * p.cost for p in Product.objects.filter(product_type=Product.Type.STORABLE)), ZERO,
    ).quantize(Decimal("0.01"))

    since = (month_start - timedelta(days=150)).replace(day=1)
    monthly = (
        invoices.filter(date__gte=since).annotate(m=TruncMonth("date")).values("m")
        .annotate(revenue=Sum("amount_untaxed")).order_by("m")
    )

    low = [{"id": p.id, "sku": p.sku, "name": p.name, "on_hand": q, "reorder_min": p.reorder_min}
           for p, q in stock.low_stock_products()]

    recent = [
        {"kind": "order", "id": o.id, "name": o.name, "partner": o.partner.name, "state": o.get_state_display(),
         "amount": o.amount_total, "at": o.confirmed_at or o.created_at}
        for o in SaleOrder.objects.select_related("partner")[:6]
    ]

    return Response({
        "kpis": {
            "revenue_month": revenue_month,
            "receivable": receivable,
            "overdue": overdue,
            "stock_value": stock_value,
            "quotations": SaleOrder.objects.filter(state=SaleOrder.State.DRAFT).count(),
            "to_deliver": Picking.objects.filter(kind=Picking.Kind.OUTGOING, state=Picking.State.READY).count(),
            "to_invoice": sum(1 for o in SaleOrder.objects.filter(state=SaleOrder.State.SALE).prefetch_related("lines")
                              if o.invoice_status == "to_invoice"),
            "payable": payable,
            "rfqs": PurchaseOrder.objects.filter(state=PurchaseOrder.State.DRAFT).count(),
            "to_receive": Picking.objects.filter(kind=Picking.Kind.INCOMING, state=Picking.State.READY).count(),
            "to_bill": sum(1 for o in PurchaseOrder.objects.filter(state=PurchaseOrder.State.PURCHASE)
                           .prefetch_related("lines__product") if o.bill_status == "to_bill"),
            "to_produce": ManufacturingOrder.objects.filter(state=ManufacturingOrder.State.CONFIRMED).count(),
        },
        "monthly_revenue": [{"month": r["m"].strftime("%Y-%m"), "revenue": r["revenue"]} for r in monthly],
        "low_stock": low,
        "recent_orders": recent,
    })
