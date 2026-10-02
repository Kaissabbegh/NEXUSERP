from rest_framework import serializers

from .models import Location, Picking, StockMove, Warehouse


class WarehouseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Warehouse
        fields = ["id", "code", "name"]


class LocationSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Location
        fields = ["id", "name", "full_name", "usage", "warehouse"]


class StockMoveSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    uom_name = serializers.CharField(source="product.uom.name", read_only=True)

    class Meta:
        model = StockMove
        fields = ["id", "product", "product_name", "product_sku", "uom_name", "quantity", "unit_cost", "state", "date"]


class PickingSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    partner_name = serializers.CharField(source="partner.name", read_only=True, default=None)
    source_location_name = serializers.CharField(source="source_location.full_name", read_only=True)
    dest_location_name = serializers.CharField(source="dest_location.full_name", read_only=True)
    moves = StockMoveSerializer(many=True, read_only=True)
    valuation_entry = serializers.SerializerMethodField()

    class Meta:
        model = Picking
        fields = ["id", "name", "kind", "kind_display", "state", "partner", "partner_name", "origin", "sale_order",
                  "source_location_name", "dest_location_name", "scheduled_date", "date_done", "moves",
                  "valuation_entry", "created_at"]

    def get_valuation_entry(self, obj):
        move = next(iter(obj.valuation_moves.all()), None)
        return {"id": move.id, "name": move.name} if move else None
