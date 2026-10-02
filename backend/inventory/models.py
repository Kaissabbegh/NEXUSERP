"""Warehouses, locations and stock movements (lesson Step 5).

Stock is never stored as a number: on-hand quantity is the sum of done moves
into a location minus done moves out of it, as in Odoo.
"""

from django.db import models
from django.utils import timezone


class Warehouse(models.Model):
    code = models.CharField(max_length=8, unique=True)
    name = models.CharField(max_length=64)

    def __str__(self):
        return self.name


class Location(models.Model):
    class Usage(models.TextChoices):
        INTERNAL = "internal", "Internal"
        CUSTOMER = "customer", "Customer"
        SUPPLIER = "supplier", "Vendor"
        INVENTORY = "inventory", "Inventory Adjustment"
        PRODUCTION = "production", "Production"

    name = models.CharField(max_length=64)
    usage = models.CharField(max_length=16, choices=Usage.choices)
    warehouse = models.ForeignKey(Warehouse, null=True, blank=True, on_delete=models.PROTECT, related_name="locations")

    class Meta:
        ordering = ["usage", "name"]

    def __str__(self):
        return self.full_name

    @property
    def full_name(self) -> str:
        if self.warehouse:
            return f"{self.warehouse.code}/{self.name}"
        return f"Partners/{self.name}" if self.usage in ("customer", "supplier") else f"Virtual/{self.name}"


class Picking(models.Model):
    """A transfer document: receipt, delivery order or inventory adjustment."""

    class Kind(models.TextChoices):
        INCOMING = "incoming", "Receipt"
        OUTGOING = "outgoing", "Delivery Order"
        ADJUSTMENT = "adjustment", "Inventory Adjustment"
        RETURN = "return", "Customer Return"

    class State(models.TextChoices):
        READY = "ready", "Ready"
        DONE = "done", "Done"
        CANCEL = "cancel", "Cancelled"

    name = models.CharField(max_length=32, unique=True)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    state = models.CharField(max_length=16, choices=State.choices, default=State.READY)
    partner = models.ForeignKey("masterdata.Partner", null=True, blank=True, on_delete=models.PROTECT, related_name="pickings")
    origin = models.CharField(max_length=64, blank=True, help_text="Source document, e.g. S00004.")
    sale_order = models.ForeignKey("sales.SaleOrder", null=True, blank=True, on_delete=models.PROTECT, related_name="pickings")
    purchase_order = models.ForeignKey("purchase.PurchaseOrder", null=True, blank=True, on_delete=models.PROTECT, related_name="pickings")
    counterpart_account = models.ForeignKey(
        "accounting.Account", null=True, blank=True, on_delete=models.PROTECT, related_name="+",
        help_text="Overrides the account balancing the stock valuation entry (e.g. equity for opening stock).",
    )
    source_location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="+")
    dest_location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="+")
    scheduled_date = models.DateField(default=timezone.localdate)
    date_done = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.name


class StockMove(models.Model):
    picking = models.ForeignKey(Picking, null=True, blank=True, on_delete=models.CASCADE, related_name="moves")
    production = models.ForeignKey("mrp.ManufacturingOrder", null=True, blank=True, on_delete=models.CASCADE, related_name="moves")
    product = models.ForeignKey("masterdata.Product", on_delete=models.PROTECT, related_name="stock_moves")
    sale_line = models.ForeignKey("sales.SaleOrderLine", null=True, blank=True, on_delete=models.SET_NULL, related_name="stock_moves")
    purchase_line = models.ForeignKey("purchase.PurchaseOrderLine", null=True, blank=True, on_delete=models.SET_NULL, related_name="stock_moves")
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    source_location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="moves_out")
    dest_location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="moves_in")
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    state = models.CharField(max_length=16, choices=Picking.State.choices, default=Picking.State.READY)
    date = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.product.sku} × {self.quantity}"
