from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import mixins, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from . import reports, services
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
        qs = Move.objects.select_related("partner", "journal", "sale_order", "purchase_order")
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

    @action(detail=False, methods=["post"])
    def manual(self, request):
        """Create and post a miscellaneous entry, e.g. rent or salaries paid from the bank."""
        data = request.data
        lines = data.get("lines") or []
        specs = []
        for l in lines:
            debit, credit = Decimal(str(l.get("debit") or 0)), Decimal(str(l.get("credit") or 0))
            if debit < 0 or credit < 0 or (debit and credit):
                raise ValidationError("Each line needs either a debit or a credit, not both.")
            if debit or credit:
                specs.append(services.LineSpec(Account.objects.get(pk=l["account"]), debit=debit, credit=credit,
                                               name=l.get("name") or data.get("ref", "")))
        if len(specs) < 2:
            raise ValidationError("A journal entry needs at least two lines.")
        move = services.create_entry(data.get("journal") or "MISC", specs, ref=data.get("ref", ""),
                                     date=parse_date(data.get("date") or "") or timezone.localdate())
        return Response(MoveSerializer(move).data, status=201)

    @action(detail=True, methods=["post"], url_path="register-payment")
    def register_payment(self, request, pk=None):
        amount = request.data.get("amount")
        services.register_payment(self.get_object(), Decimal(str(amount)) if amount not in (None, "") else None)
        return Response(MoveSerializer(self.get_object()).data)


class PaymentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Payment.objects.select_related("partner", "journal", "invoice")
    serializer_class = PaymentSerializer


def _date(request, key):
    value = request.query_params.get(key)
    return parse_date(value) if value else None


@api_view(["GET"])
def profit_and_loss(request):
    return Response(reports.profit_and_loss(_date(request, "date_from"), _date(request, "date_to")))


@api_view(["GET"])
def balance_sheet(request):
    return Response(reports.balance_sheet(_date(request, "as_of")))


@api_view(["GET"])
def aged_balance(request):
    kind = request.query_params.get("kind", "receivable")
    if kind not in ("receivable", "payable"):
        raise ValidationError("kind must be receivable or payable.")
    return Response(reports.aged_balance(kind, timezone.localdate()))
