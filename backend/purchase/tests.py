from decimal import Decimal

from masterdata.models import Partner
from masterdata.testing import DemoTestCase


class ProcureToPayTests(DemoTestCase):
    def _order(self, sku, qty, price):
        vendor = Partner.objects.get(name="Woodcraft Supplies")
        return self.ok(self.client.post("/api/purchase-orders/", {"partner": vendor.id, "lines": [
            {"product": self.product(sku).id, "quantity": qty, "price_unit": price}]}, format="json"), 201)

    def test_full_flow_with_average_cost_and_interim_account(self):
        interim_before, payable_before = self.balance("110200"), self.balance("211000")
        shelf = self.product("STOR-002")
        on_hand, old_cost = self.on_hand("STOR-002"), shelf.cost

        po = self._order("STOR-002", 4, "250.00")
        self.assertEqual(po["state"], "draft")
        self.ok(self.client.post(f"/api/purchase-orders/{po['id']}/confirm/"))

        # Billing before the goods arrive is refused (three-way match).
        self.assertEqual(self.client.post(f"/api/purchase-orders/{po['id']}/create-bill/").status_code, 400)

        flow = self.ok(self.client.get(f"/api/purchase-orders/{po['id']}/flow/"))
        self.ok(self.client.post(f"/api/pickings/{flow['pickings'][0]['id']}/validate/"))
        self.assertEqual(self.on_hand("STOR-002"), on_hand + 4)
        shelf.refresh_from_db()
        expected = ((on_hand * old_cost + 4 * Decimal("250")) / (on_hand + 4)).quantize(Decimal("0.01"))
        self.assertEqual(shelf.cost, expected)
        self.assertEqual(self.balance("110200"), interim_before - Decimal("1000.00"))

        bill = self.ok(self.client.post(f"/api/purchase-orders/{po['id']}/create-bill/"), 201)
        bill = self.ok(self.client.post(f"/api/moves/{bill['id']}/post/"))
        self.assertTrue(bill["name"].startswith("BILL/"))
        self.assertEqual(Decimal(bill["amount_total"]), Decimal("1200.00"))  # 1,000 + 20% VAT
        self.assertEqual(self.balance("110200"), interim_before, "bill clears the interim account")
        self.assertEqual(self.balance("211000"), payable_before - Decimal("1200.00"))

        bill = self.ok(self.client.post(f"/api/moves/{bill['id']}/register-payment/", {}, format="json"))
        self.assertEqual(bill["payment_state"], "paid")
        self.assertEqual(self.balance("211000"), payable_before)
        flow = self.ok(self.client.get(f"/api/purchase-orders/{po['id']}/flow/"))
        self.assertEqual(flow["order"]["bill_status"], "billed")
        self.assertEqual(flow["payments"][0]["payment_type"], "outbound")
        self.assertBooksBalanced()

    def test_replenishment_creates_one_rfq_per_vendor(self):
        rows = self.ok(self.client.get("/api/replenishment/"))
        self.assertTrue(rows, "demo data has products under their reorder point")
        for r in rows:
            self.assertLessEqual(Decimal(r["forecast"]), Decimal(r["reorder_min"]))
        items = [{"product": r["id"], "quantity": r["suggested"]} for r in rows]
        orders = self.ok(self.client.post("/api/replenishment/", {"items": items}, format="json"), 201)
        self.assertEqual(len(orders), len({r["vendor"] for r in rows}))
        self.assertTrue(all(o["state"] == "draft" for o in orders))
