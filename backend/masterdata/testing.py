"""Shared test base: the full Nexus Furniture demo company plus an authenticated API client."""

from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db.models import Sum
from rest_framework.test import APITestCase

from accounting.models import Account, MoveLine
from inventory.services import on_hand_map
from masterdata.models import Product


class DemoTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=StringIO())

    def setUp(self):
        self.client.force_authenticate(get_user_model().objects.get(username="demo"))

    # helpers --------------------------------------------------------------------------------
    def ok(self, response, status=200):
        self.assertEqual(response.status_code, status, response.content[:500])
        return response.json()

    def product(self, sku) -> Product:
        return Product.objects.get(sku=sku)

    def on_hand(self, sku) -> Decimal:
        p = self.product(sku)
        return on_hand_map([p.id]).get(p.id, Decimal("0"))

    def balance(self, code) -> Decimal:
        """Debit − credit of posted items on an account."""
        agg = MoveLine.objects.filter(account__code=code, move__state="posted").aggregate(d=Sum("debit"), c=Sum("credit"))
        return (agg["d"] or 0) - (agg["c"] or 0)

    def assertBooksBalanced(self):
        agg = MoveLine.objects.filter(move__state="posted").aggregate(d=Sum("debit"), c=Sum("credit"))
        self.assertEqual(agg["d"], agg["c"])

    def account(self, code) -> Account:
        return Account.objects.get(code=code)
