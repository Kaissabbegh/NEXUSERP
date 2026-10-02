from decimal import Decimal

from django.db.models import Q, Sum
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from . import services
from .models import Account, Journal, Move, Payment
from .serializers import (
    AccountSerializer, JournalSerializer, MoveListSerializer, MoveSerializer, PaymentSerializer,
)

POSTED = Q(lines__move__state=Move.State.POSTED)


class AccountViewSet(viewsets.ModelViewSet):
    serializer_class = AccountSerializer
    queryset = Account.objects.annotate(
        debit=Sum("lines__debit", filter=POSTED), credit=Sum("lines__credit", filter=POSTED),
    )


class JournalViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Journal.objects.all()
    serializer_class = JournalSerializer


class MoveViewSet(viewsets.ReadOnlyModelViewSet):
    def get_queryset(self):
        qs = Move.objects.select_related("partner", "journal", "sale_order")
        if t := self.request.query_params.get("type"):
            qs = qs.filter(move_type=t)
        if s := self.request.query_params.get("state"):
            qs = qs.filter(state=s)
        if a := self.request.query_params.get("account"):
            qs = qs.filter(lines__account_id=a).distinct()
        if self.action == "retrieve":
            qs = qs.prefetch_related("lines__account", "lines__product", "payments")
        return qs

    def get_serializer_class(self):
        return MoveSerializer if self.action != "list" else MoveListSerializer

    @action(detail=True, methods=["post"], url_path="post")
    def post_entry(self, request, pk=None):
        move = services.post(self.get_object())
        return Response(MoveSerializer(move).data)

    @action(detail=True, methods=["post"], url_path="register-payment")
    def register_payment(self, request, pk=None):
        amount = request.data.get("amount")
        services.register_payment(self.get_object(), Decimal(str(amount)) if amount not in (None, "") else None)
        return Response(MoveSerializer(self.get_object()).data)


class PaymentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Payment.objects.select_related("partner", "journal", "invoice")
    serializer_class = PaymentSerializer
