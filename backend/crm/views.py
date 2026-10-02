from django.db.models import Count, Sum
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from . import services
from .models import Lead


class LeadSerializer(serializers.ModelSerializer):
    stage_display = serializers.CharField(source="get_stage_display", read_only=True)
    partner_name = serializers.CharField(source="partner.name", read_only=True, default=None)
    sale_order_name = serializers.CharField(source="sale_order.name", read_only=True, default=None)
    sale_order_state = serializers.CharField(source="sale_order.state", read_only=True, default=None)
    weighted_revenue = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Lead
        fields = ["id", "name", "contact_name", "company_name", "email", "phone", "source", "partner", "partner_name",
                  "expected_revenue", "probability", "weighted_revenue", "stage", "stage_display", "sale_order",
                  "sale_order_name", "sale_order_state", "lost_reason", "notes", "created_at", "closed_at"]
        read_only_fields = ["stage", "probability", "sale_order", "lost_reason", "closed_at", "partner"]


class LeadViewSet(viewsets.ModelViewSet):
    serializer_class = LeadSerializer
    queryset = Lead.objects.select_related("partner", "sale_order")

    def _ok(self):
        return Response(LeadSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"])
    def qualify(self, request, pk=None):
        services.qualify(self.get_object())
        return self._ok()

    @action(detail=True, methods=["post"])
    def quotation(self, request, pk=None):
        services.create_quotation(self.get_object())
        return self._ok()

    @action(detail=True, methods=["post"])
    def won(self, request, pk=None):
        services.mark_won(self.get_object())
        return self._ok()

    @action(detail=True, methods=["post"])
    def lost(self, request, pk=None):
        services.mark_lost(self.get_object(), request.data.get("reason", ""))
        return self._ok()

    @action(detail=False, methods=["get"])
    def summary(self, request):
        rows = Lead.objects.values("stage").annotate(n=Count("id"), revenue=Sum("expected_revenue"))
        stats = {r["stage"]: {"count": r["n"], "revenue": r["revenue"]} for r in rows}
        closed = (stats.get("won", {}).get("count", 0) + stats.get("lost", {}).get("count", 0))
        open_leads = Lead.objects.filter(stage__in=services.OPEN)
        return Response({
            "stages": stats,
            "weighted_pipeline": sum((l.weighted_revenue for l in open_leads), 0),
            "win_rate": round(stats.get("won", {}).get("count", 0) / closed * 100) if closed else None,
        })
