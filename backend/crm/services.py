from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounting.models import Account
from masterdata.models import Partner, PaymentTerm, Product
from sales import services as sales
from sales.models import SaleOrder, SaleOrderLine

from .models import Lead

OPEN = (Lead.Stage.NEW, Lead.Stage.QUALIFIED, Lead.Stage.PROPOSITION)


def set_stage(lead: Lead, stage: str) -> Lead:
    lead.stage = stage
    lead.probability = Lead.PROBABILITY[stage]
    lead.save(update_fields=["stage", "probability"])
    return lead


@transaction.atomic
def qualify(lead: Lead) -> Lead:
    if lead.stage != Lead.Stage.NEW:
        raise ValidationError("Only new leads can be qualified.")
    return set_stage(lead, Lead.Stage.QUALIFIED)


@transaction.atomic
def convert_to_customer(lead: Lead) -> Partner:
    """Create (or reuse) the customer record. Until now the prospect only existed in the CRM."""
    if lead.partner:
        return lead.partner
    name = lead.company_name or lead.contact_name or lead.name
    partner = Partner.objects.filter(name=name).first()
    if not partner:
        partner = Partner.objects.create(
            name=name, email=lead.email, phone=lead.phone, is_customer=True, is_company=bool(lead.company_name),
            payment_term=PaymentTerm.objects.filter(days=30).first(),
            receivable_account=Account.objects.get(code="121000"), payable_account=Account.objects.get(code="211000"),
        )
    lead.partner = partner
    lead.save(update_fields=["partner"])
    return partner


@transaction.atomic
def create_quotation(lead: Lead, items: list[tuple[Product, Decimal]] | None = None) -> SaleOrder:
    if lead.stage not in OPEN:
        raise ValidationError("This opportunity is already closed.")
    if lead.sale_order_id:
        return lead.sale_order
    partner = convert_to_customer(lead)
    order = SaleOrder.objects.create(name=sales.new_order_name(), partner=partner, payment_term=partner.payment_term,
                                     note=f"From opportunity: {lead.name}")
    for product, qty in items or []:
        SaleOrderLine.objects.create(order=order, product=product, description=product.name, quantity=qty,
                                     price_unit=product.sale_price, tax=product.sale_tax)
    order.compute_amounts()
    lead.sale_order = order
    if order.amount_untaxed:
        lead.expected_revenue = order.amount_untaxed
    lead.save(update_fields=["sale_order", "expected_revenue"])
    set_stage(lead, Lead.Stage.PROPOSITION)
    return order


@transaction.atomic
def mark_lost(lead: Lead, reason: str) -> Lead:
    if lead.stage not in OPEN:
        raise ValidationError("This opportunity is already closed.")
    lead.lost_reason = reason or "No reason given"
    lead.closed_at = timezone.now()
    lead.save(update_fields=["lost_reason", "closed_at"])
    return set_stage(lead, Lead.Stage.LOST)


@transaction.atomic
def mark_won(lead: Lead) -> Lead:
    """Winning = the customer accepts the quotation, so we confirm it."""
    if lead.stage not in OPEN:
        raise ValidationError("This opportunity is already closed.")
    if not lead.sale_order:
        raise ValidationError("Create a quotation first: you win an opportunity when the customer accepts it.")
    if lead.sale_order.state == SaleOrder.State.DRAFT:
        sales.confirm(lead.sale_order)  # also marks the lead won
    lead.refresh_from_db()
    return lead
