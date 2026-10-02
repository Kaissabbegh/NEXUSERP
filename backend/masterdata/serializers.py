from decimal import Decimal

from rest_framework import serializers

from accounting.models import Account
from inventory.services import on_hand_map, reserved_map

from .models import Partner, PaymentTerm, Product, ProductCategory, Tax, UnitOfMeasure


class PaymentTermSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentTerm
        fields = ["id", "name", "days"]


class TaxSerializer(serializers.ModelSerializer):
    account_display = serializers.StringRelatedField(source="account", read_only=True)

    class Meta:
        model = Tax
        fields = ["id", "name", "rate", "scope", "account", "account_display"]


class UnitOfMeasureSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitOfMeasure
        fields = ["id", "name"]


class PartnerSerializer(serializers.ModelSerializer):
    payment_term_name = serializers.CharField(source="payment_term.name", read_only=True, default=None)
    receivable_account = serializers.PrimaryKeyRelatedField(queryset=Account.objects.all(), required=False)
    payable_account = serializers.PrimaryKeyRelatedField(queryset=Account.objects.all(), required=False)
    open_balance = serializers.SerializerMethodField()

    class Meta:
        model = Partner
        fields = [
            "id", "name", "is_company", "is_customer", "is_vendor", "email", "phone", "street", "city",
            "country", "vat", "payment_term", "payment_term_name", "credit_limit", "receivable_account",
            "payable_account", "active", "open_balance", "created_at",
        ]

    def get_open_balance(self, obj) -> Decimal:
        return self.context.get("balances", {}).get(obj.id, Decimal("0"))

    def create(self, validated):
        validated.setdefault("receivable_account", Account.objects.get(code="121000"))
        validated.setdefault("payable_account", Account.objects.get(code="211000"))
        return super().create(validated)


class ProductCategorySerializer(serializers.ModelSerializer):
    income_account_display = serializers.StringRelatedField(source="income_account", read_only=True)
    expense_account_display = serializers.StringRelatedField(source="expense_account", read_only=True)
    stock_valuation_account_display = serializers.StringRelatedField(source="stock_valuation_account", read_only=True)
    product_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = ProductCategory
        fields = [
            "id", "name", "income_account", "income_account_display", "expense_account",
            "expense_account_display", "stock_valuation_account", "stock_valuation_account_display", "product_count",
        ]


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    uom_name = serializers.CharField(source="uom.name", read_only=True)
    sale_tax_name = serializers.CharField(source="sale_tax.name", read_only=True, default=None)
    on_hand = serializers.SerializerMethodField()
    reserved = serializers.SerializerMethodField()
    margin = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "sku", "name", "product_type", "category", "category_name", "uom", "uom_name", "sale_price",
            "cost", "sale_tax", "sale_tax_name", "barcode", "reorder_min", "description", "active",
            "on_hand", "reserved", "margin",
        ]

    def _stock(self, key):
        # Computed once per response and shared by every row (list serializers share context).
        if key not in self.context:
            self.context[key] = (on_hand_map if key == "on_hand" else reserved_map)()
        return self.context[key]

    def get_on_hand(self, obj) -> Decimal | None:
        return self._stock("on_hand").get(obj.id, Decimal("0")) if obj.tracks_stock else None

    def get_reserved(self, obj) -> Decimal | None:
        return self._stock("reserved").get(obj.id, Decimal("0")) if obj.tracks_stock else None

    def get_margin(self, obj) -> Decimal | None:
        if not obj.sale_price:
            return None
        return ((obj.sale_price - obj.cost) / obj.sale_price * 100).quantize(Decimal("0.1"))
