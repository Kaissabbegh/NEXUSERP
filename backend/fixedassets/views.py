from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from masterdata.models import Partner

from . import services
from .models import FixedAsset


class FixedAssetSerializer(serializers.ModelSerializer):
    state_display = serializers.CharField(source="get_state_display", read_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True)
    vendor_name = serializers.CharField(source="vendor.name", read_only=True, default=None)
    monthly_depreciation = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    depreciated = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    book_value = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    schedule = serializers.SerializerMethodField()

    class Meta:
        model = FixedAsset
        fields = ["id", "name", "account", "account_name", "value", "acquisition_date", "useful_life_months", "vendor",
                  "vendor_name", "bill", "state", "state_display", "monthly_depreciation", "depreciated", "book_value",
                  "schedule", "created_at"]
        read_only_fields = ["vendor", "bill", "state"]

    def get_schedule(self, obj):
        return services.schedule(obj) if self.context.get("detail") else None

    def validate_account(self, account):
        if account.account_type != account.Type.FIXED_ASSET or account.code == services.ACCUMULATED:
            raise serializers.ValidationError("Choose a fixed-asset account (e.g. Vehicles, Office Equipment).")
        return account


class FixedAssetViewSet(mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    queryset = FixedAsset.objects.select_related("account", "vendor").prefetch_related("lines")
    serializer_class = FixedAssetSerializer

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "detail": self.action != "list"}

    def _detail(self):
        return Response(FixedAssetSerializer(self.get_object(), context={"detail": True}).data)

    @action(detail=True, methods=["post"])
    def purchase(self, request, pk=None):
        try:
            vendor = Partner.objects.get(pk=request.data.get("vendor"), is_vendor=True)
        except Partner.DoesNotExist:
            raise ValidationError("Choose the vendor you buy it from.")
        services.purchase(self.get_object(), vendor)
        return self._detail()

    @action(detail=True, methods=["post"])
    def depreciate(self, request, pk=None):
        services.depreciate_next(self.get_object())
        return self._detail()
