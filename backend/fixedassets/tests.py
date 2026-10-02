from decimal import Decimal

from masterdata.models import Partner
from masterdata.testing import DemoTestCase


class FixedAssetTests(DemoTestCase):
    def test_purchase_is_an_asset_and_depreciation_spreads_the_cost(self):
        vendor = Partner.objects.filter(is_vendor=True).first()
        expenses_before = self.balance("681000")
        asset = self.ok(self.client.post("/api/fixed-assets/", {"name": "Forklift", "account": self.account("151000").id,
                                                                "value": "12000", "useful_life_months": 24}, format="json"), 201)
        vehicles_before = self.balance("151000")
        asset = self.ok(self.client.post(f"/api/fixed-assets/{asset['id']}/purchase/", {"vendor": vendor.id}, format="json"))
        self.assertEqual(self.balance("151000"), vehicles_before + 12000)
        self.assertEqual(self.balance("681000"), expenses_before, "buying is not an expense")
        self.assertEqual(len(asset["schedule"]), 24)
        self.assertEqual(sum(Decimal(r["amount"]) for r in asset["schedule"]), Decimal("12000"))

        asset = self.ok(self.client.post(f"/api/fixed-assets/{asset['id']}/depreciate/"))
        self.assertEqual(Decimal(asset["book_value"]), Decimal("11500.00"))
        self.assertEqual(self.balance("681000"), expenses_before + 500)
        self.assertBooksBalanced()

    def test_accumulated_depreciation_is_not_a_purchase_account(self):
        r = self.client.post("/api/fixed-assets/", {"name": "X", "account": self.account("152000").id, "value": "1",
                                                    "useful_life_months": 12}, format="json")
        self.assertEqual(r.status_code, 400)
