from rest_framework import viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounting.serializers import MoveSerializer

from . import services
from .models import PurchaseOrder
from .serializers import PurchaseFlowSerializer, PurchaseOrderListSerializer, PurchaseOrderSerializer


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    def get_queryset(self):
        qs = PurchaseOrder.objects.select_related("partner", "payment_term").prefetch_related(
            "lines__product__uom", "lines__tax",
        )
        if s := self.request.query_params.get("state"):
            qs = qs.filter(state=s)
        if p := self.request.query_params.get("partner"):
            qs = qs.filter(partner_id=p)
        return qs

    def get_serializer_class(self):
        return PurchaseOrderListSerializer if self.action == "list" else PurchaseOrderSerializer

    def perform_destroy(self, instance):
        if instance.state != PurchaseOrder.State.DRAFT:
            raise ValidationError("Only RFQs can be deleted. Cancel the order instead.")
        instance.delete()

    def _detail(self):
        return Response(PurchaseOrderSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        services.confirm(self.get_object())
        return self._detail()

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        services.cancel(self.get_object())
        return self._detail()

    @action(detail=True, methods=["post"], url_path="create-bill")
    def create_bill(self, request, pk=None):
        bill = services.create_bill(self.get_object())
        return Response(MoveSerializer(bill).data, status=201)

    @action(detail=True, methods=["get"])
    def flow(self, request, pk=None):
        order = self.get_object()
        return Response(PurchaseFlowSerializer({"order": order, **services.flow(order)}).data)


@api_view(["GET", "POST"])
def replenishment(request):
    if request.method == "GET":
        return Response(services.replenishment())
    orders = services.create_rfqs(request.data.get("items") or [])
    return Response(PurchaseOrderListSerializer(orders, many=True).data, status=201)
