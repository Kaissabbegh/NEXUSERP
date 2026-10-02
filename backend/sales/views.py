from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounting.serializers import MoveSerializer
from inventory.serializers import PickingSerializer

from . import services
from .models import SaleOrder, SaleOrderLine
from .serializers import FlowSerializer, SaleOrderListSerializer, SaleOrderSerializer


class SaleOrderViewSet(viewsets.ModelViewSet):
    def get_queryset(self):
        qs = SaleOrder.objects.select_related("partner", "payment_term").prefetch_related(
            "lines__product__uom", "lines__tax",
        )
        if s := self.request.query_params.get("state"):
            qs = qs.filter(state=s)
        if p := self.request.query_params.get("partner"):
            qs = qs.filter(partner_id=p)
        return qs

    def get_serializer_class(self):
        return SaleOrderListSerializer if self.action == "list" else SaleOrderSerializer

    def perform_destroy(self, instance):
        if instance.state != SaleOrder.State.DRAFT:
            raise ValidationError("Only quotations can be deleted. Cancel the order instead.")
        instance.delete()

    def _detail(self):
        return Response(SaleOrderSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        services.confirm(self.get_object())
        return self._detail()

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        services.cancel(self.get_object())
        return self._detail()

    @action(detail=True, methods=["post"], url_path="create-invoice")
    def create_invoice(self, request, pk=None):
        invoice = services.create_invoice(self.get_object())
        return Response(MoveSerializer(invoice).data, status=201)

    def _items(self, order):
        rows = self.request.data.get("lines") or []
        lines = {l.id: l for l in SaleOrderLine.objects.filter(order=order).select_related("product__category", "tax")}
        items = [(lines[int(r["line"])], r["quantity"]) for r in rows if int(r["line"]) in lines]
        if not items:
            raise ValidationError("Choose at least one order line.")
        return items

    @action(detail=True, methods=["post"], url_path="return")
    def create_return(self, request, pk=None):
        order = self.get_object()
        picking = services.create_return(order, self._items(order))
        return Response(PickingSerializer(picking).data, status=201)

    @action(detail=True, methods=["post"], url_path="credit-note")
    def credit_note(self, request, pk=None):
        order = self.get_object()
        note = services.create_credit_note(order, self._items(order))
        return Response(MoveSerializer(note).data, status=201)

    @action(detail=True, methods=["get"])
    def flow(self, request, pk=None):
        order = self.get_object()
        return Response(FlowSerializer({"order": order, **services.flow(order)}).data)
