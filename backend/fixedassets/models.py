"""Fixed assets: long-lived things the company owns (vehicles, machines, computers) and their depreciation."""

from decimal import Decimal

from django.db import models
from django.utils import timezone


class FixedAsset(models.Model):
    class State(models.TextChoices):
        DRAFT = "draft", "Draft"
        RUNNING = "running", "Depreciating"
        CLOSED = "closed", "Fully depreciated"

    name = models.CharField(max_length=128)
    account = models.ForeignKey("accounting.Account", on_delete=models.PROTECT, related_name="+",
                                help_text="Fixed-asset account where the purchase is recorded.")
    value = models.DecimalField("Purchase value", max_digits=14, decimal_places=2)
    acquisition_date = models.DateField(default=timezone.localdate)
    useful_life_months = models.PositiveIntegerField(default=60)
    vendor = models.ForeignKey("masterdata.Partner", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    bill = models.ForeignKey("accounting.Move", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    state = models.CharField(max_length=16, choices=State.choices, default=State.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-acquisition_date", "-id"]

    def __str__(self):
        return self.name

    @property
    def monthly_depreciation(self) -> Decimal:
        return (self.value / self.useful_life_months).quantize(Decimal("0.01"))

    @property
    def depreciated(self) -> Decimal:
        return sum((l.amount for l in self.lines.all()), Decimal("0"))

    @property
    def book_value(self) -> Decimal:
        return self.value - self.depreciated


class DepreciationLine(models.Model):
    asset = models.ForeignKey(FixedAsset, on_delete=models.CASCADE, related_name="lines")
    date = models.DateField()
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    move = models.ForeignKey("accounting.Move", on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["date", "id"]
