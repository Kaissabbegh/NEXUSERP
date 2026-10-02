"""Financial reports computed from posted journal items."""

from datetime import date as Date
from decimal import Decimal

from django.db.models import Q, Sum

from .models import Account, Move

ZERO = Decimal("0")


def _balances(date_from: Date | None, date_to: Date | None) -> list[dict]:
    flt = Q(lines__move__state=Move.State.POSTED)
    if date_from:
        flt &= Q(lines__move__date__gte=date_from)
    if date_to:
        flt &= Q(lines__move__date__lte=date_to)
    rows = Account.objects.annotate(d=Sum("lines__debit", filter=flt), c=Sum("lines__credit", filter=flt))
    return [
        {"id": a.id, "code": a.code, "name": a.name, "type": a.account_type, "group": a.internal_group,
         "debit": a.d or ZERO, "credit": a.c or ZERO}
        for a in rows
    ]


def _section(rows, group, sign, types=None):
    """sign=+1 for debit-normal groups (assets, expenses), -1 for credit-normal ones."""
    lines = [
        {"id": r["id"], "code": r["code"], "name": r["name"], "amount": (r["debit"] - r["credit"]) * sign}
        for r in rows
        if r["group"] == group and (types is None or r["type"] in types)
    ]
    lines = [l for l in lines if l["amount"] != 0]
    return {"lines": lines, "total": sum((l["amount"] for l in lines), ZERO)}


def profit_and_loss(date_from: Date | None, date_to: Date | None) -> dict:
    rows = _balances(date_from, date_to)
    revenue = _section(rows, "income", -1)
    cost = _section(rows, "expense", 1, types={Account.Type.COST_OF_REVENUE})
    expenses = _section(rows, "expense", 1, types={Account.Type.EXPENSE})
    gross = revenue["total"] - cost["total"]
    return {
        "date_from": date_from, "date_to": date_to,
        "revenue": revenue, "cost_of_revenue": cost, "gross_profit": gross,
        "gross_margin": (gross / revenue["total"] * 100).quantize(Decimal("0.1")) if revenue["total"] else None,
        "expenses": expenses, "net_profit": gross - expenses["total"],
    }


def balance_sheet(as_of: Date | None) -> dict:
    rows = _balances(None, as_of)
    assets = _section(rows, "asset", 1)
    liabilities = _section(rows, "liability", -1)
    equity = _section(rows, "equity", -1)
    earnings = profit_and_loss(None, as_of)["net_profit"]
    equity["lines"].append({"id": None, "code": "", "name": "Current year earnings (profit not yet distributed)", "amount": earnings})
    equity["total"] += earnings
    return {
        "as_of": as_of, "assets": assets, "liabilities": liabilities, "equity": equity,
        "liabilities_and_equity": liabilities["total"] + equity["total"],
        "balanced": assets["total"] == liabilities["total"] + equity["total"],
    }


BUCKETS = [("not_due", "Not due yet"), ("d1_30", "1–30 days late"), ("d31_60", "31–60 days late"),
           ("d61_90", "61–90 days late"), ("d90", "90+ days late")]


def _bucket(days_late: int) -> str:
    if days_late <= 0:
        return "not_due"
    if days_late <= 30:
        return "d1_30"
    if days_late <= 60:
        return "d31_60"
    if days_late <= 90:
        return "d61_90"
    return "d90"


def aged_balance(kind: str, today: Date) -> dict:
    """kind='receivable' (customers owe us) or 'payable' (we owe vendors)."""
    move_type = Move.MoveType.OUT_INVOICE if kind == "receivable" else Move.MoveType.IN_INVOICE
    open_docs = (
        Move.objects.filter(move_type=move_type, state=Move.State.POSTED, amount_residual__gt=0)
        .select_related("partner").order_by("invoice_date_due")
    )
    partners: dict[int, dict] = {}
    totals = {k: ZERO for k, _ in BUCKETS} | {"total": ZERO}
    for m in open_docs:
        due = m.invoice_date_due or m.date
        days = (today - due).days
        b = _bucket(days)
        row = partners.setdefault(m.partner_id, {"partner": m.partner_id, "name": m.partner.name, "documents": [],
                                                 **{k: ZERO for k, _ in BUCKETS}, "total": ZERO})
        row[b] += m.amount_residual
        row["total"] += m.amount_residual
        totals[b] += m.amount_residual
        totals["total"] += m.amount_residual
        row["documents"].append({"id": m.id, "name": m.name, "date": m.date, "due": due, "days_late": max(days, 0),
                                 "bucket": b, "residual": m.amount_residual, "total": m.amount_total})
    return {"kind": kind, "buckets": [{"key": k, "label": l} for k, l in BUCKETS],
            "partners": sorted(partners.values(), key=lambda r: -r["total"]), "totals": totals}
