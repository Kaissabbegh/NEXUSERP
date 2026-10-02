"""CRM: leads and opportunities, the step before a quotation."""

from django.db import models


class Lead(models.Model):
    class Stage(models.TextChoices):
        NEW = "new", "New"
        QUALIFIED = "qualified", "Qualified"
        PROPOSITION = "proposition", "Proposition"
        WON = "won", "Won"
        LOST = "lost", "Lost"

    # Default win probability per stage, used for the weighted pipeline.
    PROBABILITY = {"new": 10, "qualified": 30, "proposition": 60, "won": 100, "lost": 0}

    name = models.CharField(max_length=128, help_text="What the prospect wants, e.g. 'Furnish new office'.")
    contact_name = models.CharField(max_length=128, blank=True)
    company_name = models.CharField(max_length=128, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    source = models.CharField(max_length=32, blank=True, help_text="Website, referral, trade show…")
    partner = models.ForeignKey("masterdata.Partner", null=True, blank=True, on_delete=models.SET_NULL, related_name="leads")
    expected_revenue = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    probability = models.PositiveIntegerField(default=10)
    stage = models.CharField(max_length=16, choices=Stage.choices, default=Stage.NEW)
    sale_order = models.ForeignKey("sales.SaleOrder", null=True, blank=True, on_delete=models.SET_NULL, related_name="leads")
    lost_reason = models.CharField(max_length=128, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    @property
    def weighted_revenue(self):
        return self.expected_revenue * self.probability / 100
