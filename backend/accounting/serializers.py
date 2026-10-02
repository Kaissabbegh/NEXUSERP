from decimal import Decimal

from rest_framework import serializers

from .models import Account, Journal, Move, MoveLine, Payment


class AccountSerializer(serializers.ModelSerializer):
    internal_group = serializers.CharField(read_only=True)
    type_display = serializers.CharField(source="get_account_type_display", read_only=True)
    debit = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True, default=Decimal("0"))
    credit = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True, default=Decimal("0"))
    balance = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = ["id", "code", "name", "account_type", "type_display", "internal_group", "description",
                  "debit", "credit", "balance"]

    def get_balance(self, obj) -> Decimal:
        return (getattr(obj, "debit", None) or Decimal("0")) - (getattr(obj, "credit", None) or Decimal("0"))


class JournalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Journal
        fields = ["id", "code", "name", "journal_type", "default_account"]


class MoveLineSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source="account.code", read_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True)
    account_group = serializers.CharField(source="account.internal_group", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True, default=None)

    class Meta:
        model = MoveLine
        fields = ["id", "account", "account_code", "account_name", "account_group", "name", "kind", "product",
                  "product_name", "quantity", "price_unit", "tax", "debit", "credit"]


class MoveListSerializer(serializers.ModelSerializer):
    partner_name = serializers.CharField(source="partner.name", read_only=True, default=None)
    journal_name = serializers.CharField(source="journal.name", read_only=True)
    move_type_display = serializers.CharField(source="get_move_type_display", read_only=True)
    sale_order_name = serializers.CharField(source="sale_order.name", read_only=True, default=None)
    purchase_order_name = serializers.CharField(source="purchase_order.name", read_only=True, default=None)
    journal_code = serializers.CharField(source="journal.code", read_only=True)

    class Meta:
        model = Move
        fields = ["id", "name", "move_type", "move_type_display", "journal", "journal_name", "journal_code", "partner",
                  "partner_name", "date", "invoice_date_due", "ref", "state", "payment_state", "sale_order",
                  "sale_order_name", "purchase_order", "purchase_order_name", "amount_untaxed", "amount_tax",
                  "amount_total", "amount_residual", "created_at"]


class MoveSerializer(MoveListSerializer):
    lines = MoveLineSerializer(many=True, read_only=True)
    payments = serializers.SerializerMethodField()

    class Meta(MoveListSerializer.Meta):
        fields = MoveListSerializer.Meta.fields + ["lines", "payments"]

    def get_payments(self, obj):
        return PaymentSerializer(obj.payments.all(), many=True).data


class PaymentSerializer(serializers.ModelSerializer):
    partner_name = serializers.CharField(source="partner.name", read_only=True)
    journal_name = serializers.CharField(source="journal.name", read_only=True)
    invoice_name = serializers.CharField(source="invoice.name", read_only=True, default=None)

    class Meta:
        model = Payment
        fields = ["id", "name", "partner", "partner_name", "journal", "journal_name", "invoice", "invoice_name",
                  "move", "payment_type", "amount", "date", "state"]
