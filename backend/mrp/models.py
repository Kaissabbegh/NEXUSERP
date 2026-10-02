"""Bills of materials and manufacturing orders (lesson Step 7)."""

from django.db import models
from django.utils import timezone


class BillOfMaterials(models.Model):
    """The recipe: which components, in which quantities, make a finished product."""

    product = models.ForeignKey("masterdata.Product", on_delete=models.PROTECT, related_name="boms")
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=1, help_text="Quantity this recipe produces.")
    code = models.CharField(max_length=32, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["product__sku"]
        verbose_name_plural = "bills of materials"

    def __str__(self):
        return f"BoM {self.product.name}"


class BomLine(models.Model):
    bom = models.ForeignKey(BillOfMaterials, on_delete=models.CASCADE, related_name="lines")
    component = models.ForeignKey("masterdata.Product", on_delete=models.PROTECT, related_name="+")
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=1)

    class Meta:
        ordering = ["id"]


class ManufacturingOrder(models.Model):
    class State(models.TextChoices):
        DRAFT = "draft", "Draft"
        CONFIRMED = "confirmed", "Confirmed"
        DONE = "done", "Done"
        CANCEL = "cancel", "Cancelled"

    name = models.CharField(max_length=32, unique=True)
    product = models.ForeignKey("masterdata.Product", on_delete=models.PROTECT, related_name="+")
    bom = models.ForeignKey(BillOfMaterials, on_delete=models.PROTECT, related_name="productions")
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=1)
    state = models.CharField(max_length=16, choices=State.choices, default=State.DRAFT)
    origin = models.CharField(max_length=64, blank=True)
    date_planned = models.DateField(default=timezone.localdate)
    date_done = models.DateTimeField(null=True, blank=True)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0, help_text="Cost per unit produced (sum of components).")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.name

    @property
    def factor(self):
        return self.quantity / self.bom.quantity
