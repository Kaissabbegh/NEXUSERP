from django.db import models


class ScenarioRun(models.Model):
    """One playthrough of a guided scenario. `context` keeps the ids of documents created so far."""

    key = models.CharField(max_length=32)
    step = models.PositiveIntegerField(default=0, help_text="Index of the next step to run.")
    context = models.JSONField(default=dict)
    finished = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.key} #{self.pk} (step {self.step})"
