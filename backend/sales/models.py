"""Quotations and sales orders: the start of Order-to-Cash (lesson Step 3)."""

from decimal import Decimal

from django.db import models
from django.utils import timezone


class SaleOrder(models.Model):
    class State(models.TextChoices):
        DRAFT = "draft", "Quotation"
        SALE = "sale", "Sales Order"
        CANCEL = "cancel", "Cancelled"

    name = models.CharField(max_length=32, unique=True)
    partner = models.ForeignKey("masterdata.Partner", on_delete=models.PROTECT, related_name="sale_orders")
    state = models.CharField(max_length=16, choices=State.choices, default=State.DRAFT)
    date_order = models.DateField(default=timezone.localdate)
    validity_date = models.DateField(null=True, blank=True)
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
    def delivery_status(self) -> str:
        lines = [l for l in self.lines.all() if l.product.is_deliverable]
        if self.state != self.State.SALE or not lines:
            return "none"
        delivered = sum(l.qty_delivered for l in lines)
        ordered = sum(l.quantity for l in lines)
        if delivered <= 0:
            return "pending"
        return "full" if delivered >= ordered else "partial"

    @property
    def invoice_status(self) -> str:
        """Goods are invoiced once delivered (and credited when returned); services as ordered."""
        if self.state != self.State.SALE:
            return "no"
        lines = list(self.lines.select_related("product"))
        if any(l.qty_to_invoice > 0 for l in lines):
            return "to_invoice"
        goods = [l for l in lines if l.product.is_deliverable]
        returned = self.pickings.filter(kind="return", state="done").exists()
        if returned or all(l.qty_delivered >= l.quantity for l in goods):
            return "invoiced"
        return "no"  # waiting for the delivery


class SaleOrderLine(models.Model):
    order = models.ForeignKey(SaleOrder, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey("masterdata.Product", on_delete=models.PROTECT, related_name="+")
    description = models.CharField(max_length=256, blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=1)
    price_unit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=5, decimal_places=2, default=0, help_text="Percent.")
    tax = models.ForeignKey("masterdata.Tax", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    qty_delivered = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    qty_invoiced = models.DecimalField(max_digits=12, decimal_places=3, default=0)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.order.name} – {self.product.sku}"

    @property
    def subtotal(self) -> Decimal:
        gross = self.quantity * self.price_unit * (Decimal(100) - self.discount) / Decimal(100)
        return gross.quantize(Decimal("0.01"))

    @property
    def tax_amount(self) -> Decimal:
        return self.tax.compute(self.subtotal) if self.tax else Decimal("0")

    @property
    def qty_to_invoice(self) -> Decimal:
        basis = self.qty_delivered if self.product.is_deliverable else self.quantity
        return max(basis - self.qty_invoiced, Decimal("0"))
