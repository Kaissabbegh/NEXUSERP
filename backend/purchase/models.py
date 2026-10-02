"""Requests for quotation and purchase orders: Procure-to-Pay (lesson Step 4)."""

from decimal import Decimal

from django.db import models
from django.utils import timezone


class PurchaseOrder(models.Model):
    class State(models.TextChoices):
        DRAFT = "draft", "RFQ"
        PURCHASE = "purchase", "Purchase Order"
        CANCEL = "cancel", "Cancelled"

    name = models.CharField(max_length=32, unique=True)
    partner = models.ForeignKey("masterdata.Partner", on_delete=models.PROTECT, related_name="purchase_orders")
    state = models.CharField(max_length=16, choices=State.choices, default=State.DRAFT)
    date_order = models.DateField(default=timezone.localdate)
    date_planned = models.DateField(null=True, blank=True, help_text="Expected arrival of the goods.")
    payment_term = models.ForeignKey("masterdata.PaymentTerm", null=True, blank=True, on_delete=models.SET_NULL)
    note = models.TextField(blank=True)
    amount_untaxed = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount_tax = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.name

    def compute_amounts(self, save=True):
        untaxed = tax = Decimal("0")
        for line in self.lines.select_related("tax"):
            untaxed += line.subtotal
            tax += line.tax_amount
        self.amount_untaxed, self.amount_tax, self.amount_total = untaxed, tax, untaxed + tax
        if save:
            self.save(update_fields=["amount_untaxed", "amount_tax", "amount_total"])

    @property
    def receipt_status(self) -> str:
        lines = [l for l in self.lines.all() if l.product.is_deliverable]
        if self.state != self.State.PURCHASE or not lines:
            return "none"
        received = sum(l.qty_received for l in lines)
        ordered = sum(l.quantity for l in lines)
        if received <= 0:
            return "pending"
        return "full" if received >= ordered else "partial"

    @property
    def bill_status(self) -> str:
        if self.state != self.State.PURCHASE:
            return "no"
        lines = list(self.lines.all())
        if all(l.qty_billed >= l.quantity for l in lines):
            return "billed"
        if any(l.qty_to_bill > 0 for l in lines):
            return "to_bill"
        return "waiting"  # nothing received yet, so nothing to bill


class PurchaseOrderLine(models.Model):
    order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey("masterdata.Product", on_delete=models.PROTECT, related_name="+")
    description = models.CharField(max_length=256, blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=1)
    price_unit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax = models.ForeignKey("masterdata.Tax", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    qty_received = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    qty_billed = models.DecimalField(max_digits=12, decimal_places=3, default=0)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.order.name} – {self.product.sku}"

    @property
    def subtotal(self) -> Decimal:
        return (self.quantity * self.price_unit).quantize(Decimal("0.01"))

    @property
    def tax_amount(self) -> Decimal:
        return self.tax.compute(self.subtotal) if self.tax else Decimal("0")

    @property
    def qty_to_bill(self) -> Decimal:
        """Bill what was received (three-way match); services are billed as ordered."""
        basis = self.qty_received if self.product.is_deliverable else self.quantity
        return max(basis - self.qty_billed, Decimal("0"))
