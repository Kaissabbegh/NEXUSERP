"""Double-entry accounting: every business event ends here (lesson Step 6)."""

from decimal import Decimal

from django.db import models
from django.utils import timezone


class Account(models.Model):
    class Type(models.TextChoices):
        RECEIVABLE = "asset_receivable", "Receivable"
        CASH = "asset_cash", "Bank and Cash"
        CURRENT_ASSET = "asset_current", "Current Assets"
        FIXED_ASSET = "asset_fixed", "Fixed Assets"
        PAYABLE = "liability_payable", "Payable"
        CURRENT_LIABILITY = "liability_current", "Current Liabilities"
        EQUITY = "equity", "Equity"
        INCOME = "income", "Income"
        COST_OF_REVENUE = "expense_direct_cost", "Cost of Revenue"
        EXPENSE = "expense", "Expenses"

    code = models.CharField(max_length=16, unique=True)
    name = models.CharField(max_length=128)
    account_type = models.CharField(max_length=32, choices=Type.choices)
    description = models.TextField(blank=True, help_text="Plain-English explanation shown in the UI.")

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} {self.name}"

    @property
    def internal_group(self) -> str:
        t = self.account_type
        if t.startswith("asset"):
            return "asset"
        if t.startswith("liability"):
            return "liability"
        if t == self.Type.EQUITY:
            return "equity"
        if t == self.Type.INCOME:
            return "income"
        return "expense"


class Journal(models.Model):
    class Type(models.TextChoices):
        SALE = "sale", "Sales"
        PURCHASE = "purchase", "Purchases"
        BANK = "bank", "Bank"
        CASH = "cash", "Cash"
        GENERAL = "general", "Miscellaneous"

    code = models.CharField(max_length=8, unique=True)
    name = models.CharField(max_length=64)
    journal_type = models.CharField(max_length=16, choices=Type.choices)
    default_account = models.ForeignKey(Account, null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return self.name


class Move(models.Model):
    """A journal entry. Customer invoices are journal entries too, as in Odoo."""

    class MoveType(models.TextChoices):
        ENTRY = "entry", "Journal Entry"
        OUT_INVOICE = "out_invoice", "Customer Invoice"
        IN_INVOICE = "in_invoice", "Vendor Bill"

    class State(models.TextChoices):
        DRAFT = "draft", "Draft"
        POSTED = "posted", "Posted"
        CANCEL = "cancel", "Cancelled"

    class PaymentState(models.TextChoices):
        NOT_PAID = "not_paid", "Not Paid"
        PARTIAL = "partial", "Partially Paid"
        PAID = "paid", "Paid"

    name = models.CharField(max_length=32, default="/")
    move_type = models.CharField(max_length=16, choices=MoveType.choices, default=MoveType.ENTRY)
    journal = models.ForeignKey(Journal, on_delete=models.PROTECT, related_name="moves")
    partner = models.ForeignKey("masterdata.Partner", null=True, blank=True, on_delete=models.PROTECT, related_name="moves")
    date = models.DateField(default=timezone.localdate)
    invoice_date_due = models.DateField(null=True, blank=True)
    ref = models.CharField(max_length=128, blank=True)
    state = models.CharField(max_length=16, choices=State.choices, default=State.DRAFT)
    payment_state = models.CharField(max_length=16, choices=PaymentState.choices, default=PaymentState.NOT_PAID)
    sale_order = models.ForeignKey("sales.SaleOrder", null=True, blank=True, on_delete=models.PROTECT, related_name="invoices")
    picking = models.ForeignKey("inventory.Picking", null=True, blank=True, on_delete=models.PROTECT, related_name="valuation_moves")
    purchase_order = models.ForeignKey("purchase.PurchaseOrder", null=True, blank=True, on_delete=models.PROTECT, related_name="bills")
    production = models.ForeignKey("mrp.ManufacturingOrder", null=True, blank=True, on_delete=models.PROTECT, related_name="valuation_moves")
    amount_untaxed = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount_tax = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount_residual = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return self.name

    @property
    def is_invoice(self) -> bool:
        return self.move_type in (self.MoveType.OUT_INVOICE, self.MoveType.IN_INVOICE)


class MoveLine(models.Model):
    """A journal item: one debit or credit on one account."""

    class Kind(models.TextChoices):
        PRODUCT = "product", "Product"
        TAX = "tax", "Tax"
        RECEIVABLE = "receivable", "Receivable"
        PAYABLE = "payable", "Payable"
        LIQUIDITY = "liquidity", "Bank / Cash"
        STOCK = "stock", "Stock Valuation"
        COGS = "cogs", "Cost of Goods Sold"
        OTHER = "other", "Other"

    move = models.ForeignKey(Move, on_delete=models.CASCADE, related_name="lines")
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="lines")
    partner = models.ForeignKey("masterdata.Partner", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    product = models.ForeignKey("masterdata.Product", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    name = models.CharField(max_length=256, blank=True)
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.OTHER)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    price_unit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax = models.ForeignKey("masterdata.Tax", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    debit = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    credit = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.account.code} D{self.debit} C{self.credit}"


class Payment(models.Model):
    class State(models.TextChoices):
        DRAFT = "draft", "Draft"
        POSTED = "posted", "Posted"

    class Type(models.TextChoices):
        INBOUND = "inbound", "Received from customer"
        OUTBOUND = "outbound", "Sent to vendor"

    name = models.CharField(max_length=32, default="/")
    partner = models.ForeignKey("masterdata.Partner", on_delete=models.PROTECT, related_name="payments")
    journal = models.ForeignKey(Journal, on_delete=models.PROTECT, related_name="payments")
    invoice = models.ForeignKey(Move, null=True, blank=True, on_delete=models.PROTECT, related_name="payments")
    move = models.OneToOneField(Move, null=True, blank=True, on_delete=models.PROTECT, related_name="payment_of")
    payment_type = models.CharField(max_length=16, choices=Type.choices, default=Type.INBOUND)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    date = models.DateField(default=timezone.localdate)
    state = models.CharField(max_length=16, choices=State.choices, default=State.DRAFT)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return self.name
