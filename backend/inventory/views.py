from decimal import Decimal

from rest_framework import viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from masterdata.models import Product

from . import services
from .models import Location, Picking, StockMove, Warehouse
from .serializers import LocationSerializer, PickingSerializer, StockMoveSerializer, WarehouseSerializer


class WarehouseViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer


class LocationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Location.objects.select_related("warehouse")
    serializer_class = LocationSerializer


class PickingViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PickingSerializer

    def get_queryset(self):
        qs = Picking.objects.select_related("partner", "source_location__warehouse", "dest_location__warehouse") \
            .prefetch_related("moves__product__uom", "valuation_moves")
        if k := self.request.query_params.get("kind"):
            qs = qs.filter(kind=k)
        if s := self.request.query_params.get("state"):
            qs = qs.filter(state=s)
        return qs

    @action(detail=True, methods=["post"])
    def validate(self, request, pk=None):
        services.validate(self.get_object())
        return Response(self.get_serializer(self.get_object()).data)


@api_view(["GET"])
def stock_overview(request):
    """On-hand, reserved and value per storable product."""
    products = Product.objects.filter(product_type=Product.Type.STORABLE).select_related("uom", "category")
    on_hand, reserved = services.on_hand_map(), services.reserved_map()
    rows = []
    for p in products:
        qty = on_hand.get(p.id, Decimal("0"))
        res = reserved.get(p.id, Decimal("0"))
        rows.append({
            "id": p.id, "sku": p.sku, "name": p.name, "category": p.category.name, "uom": p.uom.name,
            "on_hand": qty, "reserved": res, "available": qty - res, "cost": p.cost,
            "value": (qty * p.cost).quantize(Decimal("0.01")), "reorder_min": p.reorder_min,
            "low": p.reorder_min > 0 and qty - res <= p.reorder_min,
        })
    return Response(rows)


@api_view(["GET"])
def product_moves(request, product_id: int):
    moves = StockMove.objects.filter(product_id=product_id, state="done").select_related("product__uom") \
        .order_by("-date")[:50]
    return Response(StockMoveSerializer(moves, many=True).data)
