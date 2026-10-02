import calendar
from datetime import date as Date
from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from accounting import services as acc
from accounting.models import Account, Move, MoveLine
from masterdata.models import Partner, Tax

from .models import DepreciationLine, FixedAsset

DEPRECIATION_EXPENSE, ACCUMULATED = "681000", "152000"


def _month_end(d: Date, months_ahead: int) -> Date:
    y, m = divmod(d.month - 1 + months_ahead, 12)
    year, month = d.year + y, m + 1
    return Date(year, month, calendar.monthrange(year, month)[1])


@transaction.atomic
def purchase(asset: FixedAsset, vendor: Partner) -> FixedAsset:
    """Buy the asset with a vendor bill: Dr fixed-asset account (+ VAT to reclaim) / Cr Payable.
    It is NOT an expense: the company now owns something that will serve for years."""
    if asset.state != FixedAsset.State.DRAFT or asset.bill_id:
        raise ValidationError("This asset is already purchased.")
    vat = Tax.objects.filter(scope=Tax.Scope.PURCHASE).order_by("rate").last()
    tax = vat.compute(asset.value) if vat else Decimal("0")
    bill = Move.objects.create(move_type=Move.MoveType.IN_INVOICE, journal=acc.journal("BILL"), partner=vendor,
                               date=asset.acquisition_date, invoice_date_due=acc.due_date(asset.acquisition_date, vendor),
                               ref=asset.name, amount_untaxed=asset.value, amount_tax=tax, amount_total=asset.value + tax)
    MoveLine.objects.create(move=bill, account=asset.account, partner=vendor, name=asset.name, kind=MoveLine.Kind.PRODUCT,
                            quantity=1, price_unit=asset.value, debit=asset.value)
    if tax:
        MoveLine.objects.create(move=bill, account=vat.account, partner=vendor, name=vat.name, kind=MoveLine.Kind.TAX, tax=vat, debit=tax)
    MoveLine.objects.create(move=bill, account=vendor.payable_account, partner=vendor, name=f"Due {bill.invoice_date_due}",
                            kind=MoveLine.Kind.PAYABLE, credit=asset.value + tax)
    acc.post(bill)
    asset.vendor, asset.bill, asset.state = vendor, bill, FixedAsset.State.RUNNING
    asset.save(update_fields=["vendor", "bill", "state"])
    return asset


def schedule(asset: FixedAsset) -> list[dict]:
    """Straight-line plan: the same amount every month until the value reaches zero."""
    done = {l.date: l for l in asset.lines.all()}
    rows, remaining = [], asset.value
    for i in range(asset.useful_life_months):
        amount = remaining if i == asset.useful_life_months - 1 else min(asset.monthly_depreciation, remaining)
        day = _month_end(asset.acquisition_date, i)
        remaining -= amount
        line = done.get(day)
        rows.append({"date": day, "amount": amount, "book_value": remaining, "posted": bool(line),
                     "move": line.move_id if line else None})
    return rows


@transaction.atomic
def depreciate_next(asset: FixedAsset) -> DepreciationLine:
    """Post the next month: Dr Depreciation expense / Cr Accumulated depreciation."""
    if asset.state != FixedAsset.State.RUNNING:
        raise ValidationError("Only assets in use can be depreciated.")
    nxt = next((r for r in schedule(asset) if not r["posted"]), None)
    if not nxt:
        raise ValidationError("This asset is fully depreciated.")
    label = f"Depreciation {asset.name} {nxt['date']:%b %Y}"
    move = acc.create_entry("MISC", [
        acc.LineSpec(Account.objects.get(code=DEPRECIATION_EXPENSE), debit=nxt["amount"], name=label),
        acc.LineSpec(Account.objects.get(code=ACCUMULATED), credit=nxt["amount"], name=label),
    ], ref=asset.name, date=nxt["date"])
    line = DepreciationLine.objects.create(asset=asset, date=nxt["date"], amount=nxt["amount"], move=move)
    if asset.book_value <= 0:
        asset.state = FixedAsset.State.CLOSED
        asset.save(update_fields=["state"])
    return line
