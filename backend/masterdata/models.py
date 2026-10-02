"""Master data: the "nouns" every transaction points to (lesson Step 2)."""

from decimal import Decimal

from django.db import models, transaction


class Sequence(models.Model):
    """Gap-free document numbering (S00001, INV/2026/0001, WH/OUT/00001...)."""

    code = models.CharField(max_length=64, unique=True)
    next_number = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f"{self.code} → {self.next_number}"

    @classmethod
    def next(cls, code: str) -> int:
        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(code=code)
            number = seq.next_number
            seq.next_number += 1
            seq.save(update_fields=["next_number"])
            return number


class PaymentTerm(models.Model):
    name = models.CharField(max_length=64)
    days = models.PositiveIntegerField(default=0, help_text="Days after invoice date the payment is due.")

    class Meta:
        ordering = ["days"]

    def __str__(self):
        return self.name


class Tax(models.Model):
    class Scope(models.TextChoices):
        SALE = "sale", "Sales"
        PURCHASE = "purchase", "Purchases"

    name = models.CharField(max_length=64)
    rate = models.DecimalField(max_digits=6, decimal_places=2, help_text="Percentage, e.g. 20 for 20%.")
    scope = models.CharField(max_length=16, choices=Scope.choices, default=Scope.SALE)
    account = models.ForeignKey(
        "accounting.Account", on_delete=models.PROTECT, related_name="taxes",
        help_text="Where collected/paid tax is booked (a liability for sales tax).",
    )

    class Meta:
        ordering = ["scope", "rate"]
        verbose_name_plural = "taxes"

    def __str__(self):
        return self.name

    def compute(self, base: Decimal) -> Decimal:
        return (base * self.rate / Decimal(100)).quantize(Decimal("0.01"))


class Partner(models.Model):
    """One model for customers and vendors, like Odoo's res.partner."""

    name = models.CharField(max_length=128)
    is_company = models.BooleanField(default=True)
    is_customer = models.BooleanField(default=False)
    is_vendor = models.BooleanField(default=False)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    street = models.CharField(max_length=128, blank=True)
    city = models.CharField(max_length=64, blank=True)
    country = models.CharField(max_length=64, blank=True)
    vat = models.CharField("Tax ID", max_length=32, blank=True)
    payment_term = models.ForeignKey(PaymentTerm, null=True, blank=True, on_delete=models.SET_NULL)
    credit_limit = models.DecimalField(max_digits=14, decimal_places=2, default=0, help_text="0 = no limit.")
    receivable_account = models.ForeignKey(
        "accounting.Account", on_delete=models.PROTECT, related_name="+",
    )
    payable_account = models.ForeignKey(
        "accounting.Account", on_delete=models.PROTECT, related_name="+",
    )
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class UnitOfMeasure(models.Model):
    name = models.CharField(max_length=32, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class ProductCategory(models.Model):
    """Categories carry the accounting setup so every product in them posts the same way."""

    name = models.CharField(max_length=64, unique=True)
    income_account = models.ForeignKey(
        "accounting.Account", on_delete=models.PROTECT, related_name="+",
        help_text="Credited when the product is invoiced (revenue).",
    )
    expense_account = models.ForeignKey(
        "accounting.Account", on_delete=models.PROTECT, related_name="+",
        help_text="Debited when the product leaves stock (cost of goods sold).",
    )
    stock_valuation_account = models.ForeignKey(
        "accounting.Account", on_delete=models.PROTECT, related_name="+",
        help_text="Asset account holding the value of goods in the warehouse.",
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "product categories"

    def __str__(self):
        return self.name


class Product(models.Model):
    class Type(models.TextChoices):
        STORABLE = "storable", "Storable"
        CONSUMABLE = "consumable", "Consumable"
        SERVICE = "service", "Service"

    sku = models.CharField("Internal reference", max_length=32, unique=True)
    name = models.CharField(max_length=128)
    product_type = models.CharField(max_length=16, choices=Type.choices, default=Type.STORABLE)
    category = models.ForeignKey(ProductCategory, on_delete=models.PROTECT, related_name="products")
    uom = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT, related_name="+")
    sale_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    sale_tax = models.ForeignKey(Tax, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    barcode = models.CharField(max_length=64, blank=True)
    reorder_min = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    description = models.TextField(blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sku"]

    def __str__(self):
        return f"[{self.sku}] {self.name}"

    @property
    def tracks_stock(self) -> bool:
        return self.product_type == self.Type.STORABLE

    @property
    def is_deliverable(self) -> bool:
        return self.product_type != self.Type.SERVICE
