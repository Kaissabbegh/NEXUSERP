from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from . import services
from .models import BillOfMaterials, ManufacturingOrder
from .serializers import BillOfMaterialsSerializer, ManufacturingDetailSerializer, ManufacturingOrderSerializer


class BillOfMaterialsViewSet(viewsets.ModelViewSet):
    queryset = BillOfMaterials.objects.select_related("product").prefetch_related("lines__component__uom")
    serializer_class = BillOfMaterialsSerializer


class ManufacturingOrderViewSet(mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    def get_queryset(self):
        qs = ManufacturingOrder.objects.select_related("product__uom", "bom")
        if s := self.request.query_params.get("state"):
            qs = qs.filter(state=s)
        if self.action == "retrieve":
            qs = qs.prefetch_related("moves__product__uom", "valuation_moves__lines__account", "valuation_moves__journal")
        return qs

    def get_serializer_class(self):
        return ManufacturingDetailSerializer if self.action == "retrieve" else ManufacturingOrderSerializer

    def _detail(self):
        return Response(ManufacturingDetailSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        services.confirm(self.get_object())
        return self._detail()

    @action(detail=True, methods=["post"])
    def produce(self, request, pk=None):
        services.produce(self.get_object())
        return self._detail()

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        services.cancel(self.get_object())
        return self._detail()
