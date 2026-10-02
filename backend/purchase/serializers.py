from django.db import transaction
from rest_framework import serializers

from accounting.serializers import MoveSerializer, PaymentSerializer
from inventory.serializers import PickingSerializer

from .models import PurchaseOrder, PurchaseOrderLine
from .services import new_order_name


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_type = serializers.CharField(source="product.product_type", read_only=True)
    uom_name = serializers.CharField(source="product.uom.name", read_only=True)
    tax_name = serializers.CharField(source="tax.name", read_only=True, default=None)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    tax_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrderLine
        fields = ["id", "product", "product_name", "product_sku", "product_type", "uom_name", "description",
                  "quantity", "price_unit", "tax", "tax_name", "subtotal", "tax_amount", "qty_received", "qty_billed"]
        read_only_fields = ["qty_received", "qty_billed"]


class PurchaseOrderListSerializer(serializers.ModelSerializer):
    partner_name = serializers.CharField(source="partner.name", read_only=True)
    state_display = serializers.CharField(source="get_state_display", read_only=True)
    receipt_status = serializers.CharField(read_only=True)
    bill_status = serializers.CharField(read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = ["id", "name", "partner", "partner_name", "state", "state_display", "date_order", "date_planned",
                  "amount_total", "receipt_status", "bill_status", "created_at"]


class PurchaseOrderSerializer(PurchaseOrderListSerializer):
    payment_term_name = serializers.CharField(source="payment_term.name", read_only=True, default=None)
    lines = PurchaseOrderLineSerializer(many=True)

    class Meta:
        model = PurchaseOrder
        fields = PurchaseOrderListSerializer.Meta.fields + [
            "payment_term", "payment_term_name", "note", "amount_untaxed", "amount_tax", "confirmed_at", "lines",
        ]
        read_only_fields = ["name", "state", "amount_untaxed", "amount_tax", "amount_total", "confirmed_at"]

    def validate(self, attrs):
        if self.instance and self.instance.state != PurchaseOrder.State.DRAFT:
            raise serializers.ValidationError("Only RFQs can be edited. Confirmed purchase orders are locked.")
        return attrs

    def _write_lines(self, order, lines):
        order.lines.all().delete()
        for data in lines:
            data.pop("id", None)
            product = data["product"]
            data.setdefault("description", product.name)
            if "tax" not in data:
                data["tax"] = product.purchase_tax
            PurchaseOrderLine.objects.create(order=order, **data)
        order.compute_amounts()

    @transaction.atomic
    def create(self, validated):
        lines = validated.pop("lines", [])
        validated.setdefault("payment_term", validated["partner"].payment_term)
        order = PurchaseOrder.objects.create(name=new_order_name(), **validated)
        self._write_lines(order, lines)
        return order

    @transaction.atomic
    def update(self, order, validated):
        lines = validated.pop("lines", None)
        order = super().update(order, validated)
        if lines is not None:
            self._write_lines(order, lines)
        return order


class PurchaseFlowSerializer(serializers.Serializer):
    order = PurchaseOrderSerializer()
    pickings = PickingSerializer(many=True)
    bills = MoveSerializer(many=True)
    payments = PaymentSerializer(many=True)
    entries = MoveSerializer(many=True)
