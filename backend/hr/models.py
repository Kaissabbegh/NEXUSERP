"""Human resources: employees, payroll and expense claims (lesson Step 8)."""

from decimal import Decimal

from django.db import models
from django.utils import timezone

# Simplified, country-neutral payroll rates. Real payroll follows each country's law and brackets.
EMPLOYEE_SOCIAL_RATE = Decimal("0.09")   # withheld from the employee's gross pay
INCOME_TAX_RATE = Decimal("0.10")        # flat income-tax withholding (real systems use brackets)
EMPLOYER_SOCIAL_RATE = Decimal("0.21")   # paid by the company on top of gross pay


class Department(models.Model):
    name = models.CharField(max_length=64, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Employee(models.Model):
    name = models.CharField(max_length=128)
    job_title = models.CharField(max_length=64)
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="employees")
    email = models.EmailField(blank=True)
    hire_date = models.DateField(default=timezone.localdate)
    wage = models.DecimalField("Monthly gross wage", max_digits=12, decimal_places=2)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class PayrollRun(models.Model):
    class State(models.TextChoices):
        DRAFT = "draft", "Draft"
        POSTED = "posted", "Posted"
        PAID = "paid", "Salaries paid"
        DONE = "done", "Fully settled"

    name = models.CharField(max_length=32, unique=True)
    period = models.DateField(help_text="First day of the month being paid.")
    state = models.CharField(max_length=16, choices=State.choices, default=State.DRAFT)
    move = models.ForeignKey("accounting.Move", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    payment_move = models.ForeignKey("accounting.Move", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    authorities_move = models.ForeignKey("accounting.Move", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period", "-id"]

    def __str__(self):
        return self.name

    def totals(self) -> dict:
        keys = ["gross", "employee_social", "income_tax", "net", "employer_social"]
        out = {k: Decimal("0") for k in keys}
        for slip in self.payslips.all():
            for k in keys:
                out[k] += getattr(slip, k)
        out["cost"] = out["gross"] + out["employer_social"]
        return out


class Payslip(models.Model):
    run = models.ForeignKey(PayrollRun, on_delete=models.CASCADE, related_name="payslips")
    employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="payslips")
    gross = models.DecimalField(max_digits=12, decimal_places=2)
    employee_social = models.DecimalField(max_digits=12, decimal_places=2)
    income_tax = models.DecimalField(max_digits=12, decimal_places=2)
    net = models.DecimalField(max_digits=12, decimal_places=2)
    employer_social = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["employee__name"]


class ExpenseClaim(models.Model):
    class State(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        APPROVED = "approved", "Approved & posted"
        PAID = "paid", "Reimbursed"
        REFUSED = "refused", "Refused"

    employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="expenses")
    description = models.CharField(max_length=128)
    account = models.ForeignKey("accounting.Account", on_delete=models.PROTECT, related_name="+", help_text="Expense category.")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateField(default=timezone.localdate)
    state = models.CharField(max_length=16, choices=State.choices, default=State.SUBMITTED)
    move = models.ForeignKey("accounting.Move", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    payment_move = models.ForeignKey("accounting.Move", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return f"{self.employee} – {self.description}"
