"""Runs guided scenarios one step at a time and reports what each step changed.

A step's function performs real ERP operations through the normal services. The engine snapshots
stock and account balances around it, so the explanation is always backed by the actual effects.
"""

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Callable

from django.db import transaction
from django.db.models import Max, Sum

from accounting.models import Account, Move, MoveLine
from accounting.serializers import MoveSerializer
from inventory.services import on_hand_map
from masterdata.models import Product

from .models import ScenarioRun

ZERO = Decimal("0")

# The "money buckets" shown beside every step, in plain words.
BUCKETS = [
    ("101000", "Bank", "asset"),
    ("121000", "Customers owe us", "asset"),
    ("110100", "Inventory value", "asset"),
    ("131000", "VAT to reclaim", "asset"),
    ("211000", "We owe vendors", "liability"),
    ("251000", "VAT owed to the state", "liability"),
    ("400000", "Product sales", "income"),
    ("500000", "Cost of goods sold", "expense"),
    ("6", "Running expenses", "expense"),  # every 6xxxxx account
]
DEBIT_NORMAL = {"asset", "expense"}

DOC_URLS = {
    "sale": "/sales/{id}", "purchase": "/purchases/{id}", "picking": "/transfers?open={id}", "invoice": "/invoices/{id}",
    "bill": "/bills/{id}", "entry": "/entries/{id}", "mo": "/manufacturing/{id}", "partner": "/contacts",
    "product": "/products", "report": "{id}",
}


def doc(kind: str, label: str, id_or_path) -> dict:
    return {"kind": kind, "label": label, "url": DOC_URLS[kind].format(id=id_or_path)}


@dataclass
class Step:
    title: str
    actor: str  # who does this in a real company
    run: Callable[[dict], dict]
    prepare: Callable[[dict], str | None] | None = None  # silent setup (e.g. make sure stock exists)


@dataclass
class Scenario:
    key: str
    title: str
    subtitle: str
    lesson: str
    icon: str
    color: str
    steps: list[Step] = field(default_factory=list)

    def meta(self) -> dict:
        return {"key": self.key, "title": self.title, "subtitle": self.subtitle, "lesson": self.lesson, "icon": self.icon,
                "color": self.color, "steps": [{"title": s.title, "actor": s.actor} for s in self.steps]}


def balances() -> list[dict]:
    rows = (MoveLine.objects.filter(move__state=Move.State.POSTED)
            .values("account__code").annotate(d=Sum("debit"), c=Sum("credit")))
    by_code = {r["account__code"]: (r["d"] or ZERO) - (r["c"] or ZERO) for r in rows}
    out = []
    for code, label, group in BUCKETS:
        raw = sum((v for c, v in by_code.items() if c.startswith(code)), ZERO) if len(code) == 1 else by_code.get(code, ZERO)
        out.append({"code": code, "label": label, "group": group, "amount": raw if group in DEBIT_NORMAL else -raw})
    types = dict(Account.objects.values_list("code", "account_type"))
    income = -sum((v for c, v in by_code.items() if types.get(c) == Account.Type.INCOME), ZERO)
    expenses = sum((v for c, v in by_code.items() if types.get(c) in (Account.Type.EXPENSE, Account.Type.COST_OF_REVENUE)), ZERO)
    out.append({"code": "profit", "label": "Profit so far (income − expenses)", "group": "equity", "amount": income - expenses})
    return out


def _stock_changes(before: dict, after: dict) -> list[dict]:
    changed = [pid for pid in set(before) | set(after) if before.get(pid, ZERO) != after.get(pid, ZERO)]
    products = Product.objects.in_bulk(changed)
    return sorted(
        ({"sku": p.sku, "name": p.name, "before": before.get(pid, ZERO), "after": after.get(pid, ZERO)}
         for pid, p in products.items()),
        key=lambda r: r["sku"],
    )


def run_next(run: ScenarioRun, scenario: Scenario) -> dict:
    if run.finished or run.step >= len(scenario.steps):
        raise ValueError("This scenario is already finished.")
    step = scenario.steps[run.step]
    ctx = run.context

    with transaction.atomic():
        note = step.prepare(ctx) if step.prepare else None
        stock_before = on_hand_map()
        last_move = Move.objects.aggregate(m=Max("id"))["m"] or 0
        result = step.run(ctx) or {}
        stock_after = on_hand_map()
        new_entries = (Move.objects.filter(id__gt=last_move, state=Move.State.POSTED)
                       .select_related("journal", "partner", "sale_order", "purchase_order")
                       .prefetch_related("lines__account", "lines__product", "payments").order_by("id"))

        run.context = ctx
        run.step += 1
        run.finished = run.step >= len(scenario.steps)
        run.save()

    return {
        "index": run.step - 1, "title": step.title, "actor": step.actor,
        "outcome": result.get("outcome", "ok"),
        "explanation": result.get("explanation", ""),
        "takeaway": result.get("takeaway", ""),
        "note": note,
        "documents": result.get("documents", []),
        "stock": _stock_changes(stock_before, stock_after),
        "entries": MoveSerializer(new_entries, many=True).data,
        "balances": balances(),
        "finished": run.finished,
    }
