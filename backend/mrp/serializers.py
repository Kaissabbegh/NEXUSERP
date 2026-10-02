from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from accounting.serializers import MoveSerializer
from inventory.serializers import StockMoveSerializer

from . import services
from .models import BillOfMaterials, BomLine, ManufacturingOrder


class BomLineSerializer(serializers.ModelSerializer):
    component_name = serializers.CharField(source="component.name", read_only=True)
    component_sku = serializers.CharField(source="component.sku", read_only=True)
    uom_name = serializers.CharField(source="component.uom.name", read_only=True)
    cost = serializers.DecimalField(source="component.cost", max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = BomLine
        fields = ["id", "component", "component_name", "component_sku", "uom_name", "quantity", "cost"]


class BillOfMaterialsSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_cost = serializers.DecimalField(source="product.cost", max_digits=14, decimal_places=2, read_only=True)
    product_price = serializers.DecimalField(source="product.sale_price", max_digits=14, decimal_places=2, read_only=True)
    lines = BomLineSerializer(many=True)
    component_cost = serializers.SerializerMethodField()

    class Meta:
        model = BillOfMaterials
        fields = ["id", "product", "product_name", "product_sku", "product_cost", "product_price", "quantity", "code",
                  "lines", "component_cost"]

    def get_component_cost(self, obj) -> Decimal:
        total = sum((l.quantity * l.component.cost for l in obj.lines.all()), Decimal("0"))
        return (total / obj.quantity).quantize(Decimal("0.01"))

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError("A bill of materials needs at least one component.")
        return lines

    def validate(self, attrs):
        product = attrs.get("product") or self.instance.product
        if any(l["component"] == product for l in attrs.get("lines", [])):
            raise serializers.ValidationError("A product cannot be a component of itself.")
        return attrs

    @transaction.atomic
    def create(self, validated):
        lines = validated.pop("lines")
        bom = BillOfMaterials.objects.create(**validated)
        for l in lines:
            BomLine.objects.create(bom=bom, **l)
        return bom

    @transaction.atomic
    def update(self, bom, validated):
        lines = validated.pop("lines", None)
        bom = super().update(bom, validated)
        if lines is not None:
            bom.lines.all().delete()
            for l in lines:
                BomLine.objects.create(bom=bom, **l)
        return bom


class ManufacturingOrderSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    uom_name = serializers.CharField(source="product.uom.name", read_only=True)
    state_display = serializers.CharField(source="get_state_display", read_only=True)

    class Meta:
        model = ManufacturingOrder
        fields = ["id", "name", "product", "product_name", "product_sku", "uom_name", "bom", "quantity", "state",
                  "state_display", "origin", "date_planned", "date_done", "unit_cost", "created_at"]
        read_only_fields = ["name", "product", "state", "date_done", "unit_cost"]

    def create(self, validated):
        return services.create(validated["bom"], validated["quantity"], validated.get("origin", ""))


class ManufacturingDetailSerializer(ManufacturingOrderSerializer):
    components = serializers.SerializerMethodField()
    moves = StockMoveSerializer(many=True, read_only=True)
    entries = MoveSerializer(source="valuation_moves", many=True, read_only=True)

    class Meta(ManufacturingOrderSerializer.Meta):
        fields = ManufacturingOrderSerializer.Meta.fields + ["components", "moves", "entries"]

    def get_components(self, obj):
        return services.components(obj)
