from django.db.models import Count, Q, Sum
from rest_framework import viewsets

from accounting.models import Move

from .models import Partner, PaymentTerm, Product, ProductCategory, Tax, UnitOfMeasure
from .serializers import (
    PartnerSerializer, PaymentTermSerializer, ProductCategorySerializer, ProductSerializer, TaxSerializer,
    UnitOfMeasureSerializer,
)


class PaymentTermViewSet(viewsets.ModelViewSet):
    queryset = PaymentTerm.objects.all()
    serializer_class = PaymentTermSerializer


class TaxViewSet(viewsets.ModelViewSet):
    queryset = Tax.objects.select_related("account")
    serializer_class = TaxSerializer


class UnitOfMeasureViewSet(viewsets.ModelViewSet):
    queryset = UnitOfMeasure.objects.all()
    serializer_class = UnitOfMeasureSerializer


class PartnerViewSet(viewsets.ModelViewSet):
    serializer_class = PartnerSerializer

    def get_queryset(self):
        qs = Partner.objects.select_related("payment_term")
        role = self.request.query_params.get("role")
        if role == "customer":
            qs = qs.filter(is_customer=True)
        elif role == "vendor":
            qs = qs.filter(is_vendor=True)
        if search := self.request.query_params.get("search"):
            qs = qs.filter(Q(name__icontains=search) | Q(email__icontains=search) | Q(city__icontains=search))
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        rows = (
            Move.objects.filter(move_type=Move.MoveType.OUT_INVOICE, state=Move.State.POSTED)
            .values("partner").annotate(s=Sum("amount_residual"))
        )
        ctx["balances"] = {r["partner"]: r["s"] for r in rows}
        return ctx


class ProductCategoryViewSet(viewsets.ModelViewSet):
    queryset = ProductCategory.objects.select_related(
        "income_account", "expense_account", "stock_valuation_account",
    ).annotate(product_count=Count("products"))
    serializer_class = ProductCategorySerializer


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer

    def get_queryset(self):
        qs = Product.objects.select_related("category", "uom", "sale_tax")
        if t := self.request.query_params.get("type"):
            qs = qs.filter(product_type=t)
        if search := self.request.query_params.get("search"):
            qs = qs.filter(Q(name__icontains=search) | Q(sku__icontains=search) | Q(barcode=search))
        return qs
