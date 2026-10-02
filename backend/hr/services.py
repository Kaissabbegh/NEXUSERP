from datetime import date as Date
from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from accounting.models import Account
from accounting.services import LineSpec, create_entry
from masterdata.models import Sequence

from .models import (
    EMPLOYEE_SOCIAL_RATE, EMPLOYER_SOCIAL_RATE, INCOME_TAX_RATE, Employee, ExpenseClaim, Payslip, PayrollRun,
)

CENT = Decimal("0.01")
SALARIES, EMPLOYER_CHARGES = "620000", "621000"
SOCIAL_PAYABLE, TAX_PAYABLE, SALARIES_PAYABLE, EMPLOYEE_PAYABLE = "254000", "255000", "256000", "257000"
BANK = "101000"


def acct(code) -> Account:
    return Account.objects.get(code=code)


def compute_payslip(gross: Decimal) -> dict:
    """Gross → net: the employee receives gross minus their social contribution and income tax withheld."""
    social = (gross * EMPLOYEE_SOCIAL_RATE).quantize(CENT)
    tax = ((gross - social) * INCOME_TAX_RATE).quantize(CENT)  # tax applies after social contributions
    return {"gross": gross, "employee_social": social, "income_tax": tax, "net": gross - social - tax,
            "employer_social": (gross * EMPLOYER_SOCIAL_RATE).quantize(CENT)}


@transaction.atomic
def create_run(period: Date) -> PayrollRun:
    period = period.replace(day=1)
    employees = list(Employee.objects.filter(active=True, hire_date__lte=period.replace(day=28)))
    if not employees:
        raise ValidationError("No active employees to pay.")
    run = PayrollRun.objects.create(name=f"PAY/{period:%Y/%m}-{Sequence.next(f'payroll/{period:%Y%m}')}", period=period)
    for e in employees:
        Payslip.objects.create(run=run, employee=e, **compute_payslip(e.wage))
    return run


@transaction.atomic
def post_run(run: PayrollRun) -> PayrollRun:
    """Record the payroll cost. The company owes three groups of people: employees (net), social security, tax office."""
    if run.state != PayrollRun.State.DRAFT:
        raise ValidationError("This payroll is already posted.")
    t = run.totals()
    label = f"Payroll {run.period:%B %Y}"
    run.move = create_entry("SAL", [
        LineSpec(acct(SALARIES), debit=t["gross"], name=f"{label} – gross salaries"),
        LineSpec(acct(EMPLOYER_CHARGES), debit=t["employer_social"], name=f"{label} – employer social charges"),
        LineSpec(acct(SOCIAL_PAYABLE), credit=t["employee_social"] + t["employer_social"], name=f"{label} – social security due"),
        LineSpec(acct(TAX_PAYABLE), credit=t["income_tax"], name=f"{label} – income tax withheld"),
        LineSpec(acct(SALARIES_PAYABLE), credit=t["net"], name=f"{label} – net salaries due"),
    ], ref=run.name, date=run.period.replace(day=28))
    run.state = PayrollRun.State.POSTED
    run.save(update_fields=["move", "state"])
    return run


@transaction.atomic
def pay_salaries(run: PayrollRun) -> PayrollRun:
    if run.state != PayrollRun.State.POSTED:
        raise ValidationError("Post the payroll before paying salaries.")
    net = run.totals()["net"]
    run.payment_move = create_entry("BNK", [
        LineSpec(acct(SALARIES_PAYABLE), debit=net, name=f"Net salaries {run.period:%B %Y}"),
        LineSpec(acct(BANK), credit=net, name=f"Net salaries {run.period:%B %Y}"),
    ], ref=run.name)
    run.state = PayrollRun.State.PAID
    run.save(update_fields=["payment_move", "state"])
    return run


@transaction.atomic
def pay_authorities(run: PayrollRun) -> PayrollRun:
    if run.state != PayrollRun.State.PAID:
        raise ValidationError("Pay the employees first, then the social security and tax office.")
    t = run.totals()
    social = t["employee_social"] + t["employer_social"]
    run.authorities_move = create_entry("BNK", [
        LineSpec(acct(SOCIAL_PAYABLE), debit=social, name=f"Social security {run.period:%B %Y}"),
        LineSpec(acct(TAX_PAYABLE), debit=t["income_tax"], name=f"Income tax withheld {run.period:%B %Y}"),
        LineSpec(acct(BANK), credit=social + t["income_tax"], name=f"Payroll charges {run.period:%B %Y}"),
    ], ref=run.name)
    run.state = PayrollRun.State.DONE
    run.save(update_fields=["authorities_move", "state"])
    return run


# --- Expense claims ----------------------------------------------------------------------------
@transaction.atomic
def approve_expense(claim: ExpenseClaim) -> ExpenseClaim:
    """The manager approves: the cost is recorded and the company now owes the employee."""
    if claim.state != ExpenseClaim.State.SUBMITTED:
        raise ValidationError("Only submitted claims can be approved.")
    label = f"{claim.employee.name}: {claim.description}"
    claim.move = create_entry("MISC", [
        LineSpec(claim.account, debit=claim.amount, name=label),
        LineSpec(acct(EMPLOYEE_PAYABLE), credit=claim.amount, name=label),
    ], ref="Expense claim", date=claim.date)
    claim.state = ExpenseClaim.State.APPROVED
    claim.save(update_fields=["move", "state"])
    return claim


@transaction.atomic
def refuse_expense(claim: ExpenseClaim) -> ExpenseClaim:
    if claim.state != ExpenseClaim.State.SUBMITTED:
        raise ValidationError("Only submitted claims can be refused.")
    claim.state = ExpenseClaim.State.REFUSED
    claim.save(update_fields=["state"])
    return claim


@transaction.atomic
def reimburse_expense(claim: ExpenseClaim) -> ExpenseClaim:
    if claim.state != ExpenseClaim.State.APPROVED:
        raise ValidationError("Approve the claim before reimbursing it.")
    label = f"Reimburse {claim.employee.name}: {claim.description}"
    claim.payment_move = create_entry("BNK", [
        LineSpec(acct(EMPLOYEE_PAYABLE), debit=claim.amount, name=label),
        LineSpec(acct(BANK), credit=claim.amount, name=label),
    ], ref="Expense reimbursement")
    claim.state = ExpenseClaim.State.PAID
    claim.save(update_fields=["payment_move", "state"])
    return claim
