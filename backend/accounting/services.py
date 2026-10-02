from dataclasses import dataclass
from datetime import date as Date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from masterdata.models import Sequence

from .models import Account, Journal, Move, MoveLine, Payment

ZERO = Decimal("0")


@dataclass
class LineSpec:
    account: Account
    debit: Decimal = ZERO
    credit: Decimal = ZERO
    name: str = ""
    kind: str = MoveLine.Kind.OTHER
    partner: object = None
    product: object = None
    quantity: Decimal = ZERO
    price_unit: Decimal = ZERO
    tax: object = None


def journal(code: str) -> Journal:
    return Journal.objects.get(code=code)


def _assign_name(move: Move) -> None:
    year = move.date.year
    number = Sequence.next(f"move/{move.journal.code}/{year}")
    move.name = f"{move.journal.code}/{year}/{number:04d}"


@transaction.atomic
def post(move: Move) -> Move:
    if move.state != Move.State.DRAFT:
        raise ValidationError(f"{move.name} is not a draft.")
    lines = list(move.lines.all())
    if not lines:
        raise ValidationError("Cannot post an entry without journal items.")
    debit = sum((l.debit for l in lines), ZERO)
    credit = sum((l.credit for l in lines), ZERO)
    if debit != credit:
        raise ValidationError(f"Entry is unbalanced: debit {debit} ≠ credit {credit}.")
    _assign_name(move)
    move.state = Move.State.POSTED
    if move.is_invoice:
        move.amount_residual = move.amount_total
    move.save()
    return move


@transaction.atomic
def create_entry(journal_code: str, lines: list[LineSpec], ref: str = "", **links) -> Move:
    """Create and immediately post a balanced journal entry."""
    move = Move.objects.create(journal=journal(journal_code), ref=ref, move_type=Move.MoveType.ENTRY, **links)
    for spec in lines:
        MoveLine.objects.create(move=move, **spec.__dict__)
    total = sum((s.debit for s in lines), ZERO)
    move.amount_untaxed = move.amount_total = total
    move.save(update_fields=["amount_untaxed", "amount_total"])
    return post(move)


def due_date(invoice_date: Date, partner) -> Date:
    days = partner.payment_term.days if partner.payment_term else 0
    return invoice_date + timedelta(days=days)


@transaction.atomic
def register_payment(invoice: Move, amount: Decimal | None = None, journal_code: str = "BNK", date: Date | None = None) -> Payment:
    """Customer invoice: money comes in (Dr Bank / Cr Receivable).
    Vendor bill: money goes out (Dr Payable / Cr Bank)."""
    if not invoice.is_invoice or invoice.state != Move.State.POSTED:
        raise ValidationError("Only posted invoices and bills can be paid.")
    if invoice.amount_residual <= 0:
        raise ValidationError(f"{invoice.name} is already fully paid.")
    amount = Decimal(amount) if amount is not None else invoice.amount_residual
    if amount <= 0 or amount > invoice.amount_residual:
        raise ValidationError(f"Amount must be between 0 and {invoice.amount_residual}.")

    bank = journal(journal_code)
    partner = invoice.partner
    inbound = invoice.move_type == Move.MoveType.OUT_INVOICE
    label = f"Payment {'from' if inbound else 'to'} {partner.name} for {invoice.name}"
    liquidity = LineSpec(bank.default_account, name=label, kind=MoveLine.Kind.LIQUIDITY, partner=partner)
    if inbound:
        liquidity.debit = amount
        counterpart = LineSpec(partner.receivable_account, credit=amount, name=label, kind=MoveLine.Kind.RECEIVABLE, partner=partner)
    else:
        liquidity.credit = amount
        counterpart = LineSpec(partner.payable_account, debit=amount, name=label, kind=MoveLine.Kind.PAYABLE, partner=partner)

    payment = Payment.objects.create(
        partner=partner, journal=bank, invoice=invoice, amount=amount, date=date or today(),
        payment_type=Payment.Type.INBOUND if inbound else Payment.Type.OUTBOUND,
    )
    payment.move = create_entry(journal_code, [counterpart, liquidity] if not inbound else [liquidity, counterpart],
                                ref=invoice.name, date=payment.date)
    payment.name = payment.move.name
    payment.state = Payment.State.POSTED
    payment.save()

    invoice.amount_residual -= amount
    invoice.payment_state = Move.PaymentState.PAID if invoice.amount_residual <= 0 else Move.PaymentState.PARTIAL
    invoice.save(update_fields=["amount_residual", "payment_state"])
    return payment


def today():
    return timezone.localdate()
