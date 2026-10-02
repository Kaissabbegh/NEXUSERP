from decimal import Decimal

from masterdata.models import Partner
from masterdata.testing import DemoTestCase


class OrderToCashTests(DemoTestCase):
    def test_full_flow_posts_expected_entries(self):
        customer = Partner.objects.get(name="Brightline Studio")
        chair = self.product("CHAIR-001")
        stock_before, cost = self.on_hand("CHAIR-001"), chair.cost

        so = self.ok(self.client.post("/api/sale-orders/", {"partner": customer.id, "lines": [
            {"product": chair.id, "quantity": 5, "price_unit": "320.00"}]}, format="json"), 201)
        self.assertEqual(Decimal(so["amount_total"]), Decimal("1920.00"))
        self.ok(self.client.post(f"/api/sale-orders/{so['id']}/confirm/"))
        self.assertEqual(self.on_hand("CHAIR-001"), stock_before, "confirming must not move stock")

        flow = self.ok(self.client.get(f"/api/sale-orders/{so['id']}/flow/"))
        self.ok(self.client.post(f"/api/pickings/{flow['pickings'][0]['id']}/validate/"))
        self.assertEqual(self.on_hand("CHAIR-001"), stock_before - 5)

        inv = self.ok(self.client.post(f"/api/sale-orders/{so['id']}/create-invoice/"), 201)
        inv = self.ok(self.client.post(f"/api/moves/{inv['id']}/post/"))
        self.assertTrue(inv["name"].startswith("INV/"))
        inv = self.ok(self.client.post(f"/api/moves/{inv['id']}/register-payment/", {}, format="json"))
        self.assertEqual(inv["payment_state"], "paid")

        flow = self.ok(self.client.get(f"/api/sale-orders/{so['id']}/flow/"))
        by_journal = {e["journal_code"]: e for e in flow["entries"]}
        self.assertEqual(set(by_journal), {"STJ", "INV", "BNK"})
        cogs = next(l for l in by_journal["STJ"]["lines"] if l["account_code"] == "500000")
        self.assertEqual(Decimal(cogs["debit"]), (cost * 5).quantize(Decimal("0.01")))
        vat = next(l for l in by_journal["INV"]["lines"] if l["account_code"] == "251000")
        self.assertEqual(Decimal(vat["credit"]), Decimal("320.00"))
        self.assertEqual(flow["order"]["invoice_status"], "invoiced")
        self.assertBooksBalanced()

    def test_quotation_has_no_accounting_or_stock_impact(self):
        customer = Partner.objects.get(name="Atlas Consulting")
        desk = self.product("DESK-001")
        so = self.ok(self.client.post("/api/sale-orders/", {"partner": customer.id, "lines": [
            {"product": desk.id, "quantity": 1, "price_unit": "890.00"}]}, format="json"), 201)
        flow = self.ok(self.client.get(f"/api/sale-orders/{so['id']}/flow/"))
        self.assertEqual(flow["pickings"], [])
        self.assertEqual(flow["entries"], [])

    def test_credit_limit_blocks_confirmation(self):
        customer = Partner.objects.get(name="Echo Coworking")  # limit 5,000
        table = self.product("TABLE-001")
        so = self.ok(self.client.post("/api/sale-orders/", {"partner": customer.id, "lines": [
            {"product": table.id, "quantity": 3, "price_unit": "2150.00"}]}, format="json"), 201)
        r = self.client.post(f"/api/sale-orders/{so['id']}/confirm/")
        self.assertEqual(r.status_code, 400)
        self.assertIn("Credit limit", r.content.decode())

    def test_cannot_ship_more_than_on_hand(self):
        customer = Partner.objects.get(name="Delta Logistics")
        shelf = self.product("STOR-002")
        qty = int(self.on_hand("STOR-002")) + 5
        so = self.ok(self.client.post("/api/sale-orders/", {"partner": customer.id, "lines": [
            {"product": shelf.id, "quantity": qty, "price_unit": "380.00"}]}, format="json"), 201)
        self.ok(self.client.post(f"/api/sale-orders/{so['id']}/confirm/"))
        flow = self.ok(self.client.get(f"/api/sale-orders/{so['id']}/flow/"))
        r = self.client.post(f"/api/pickings/{flow['pickings'][0]['id']}/validate/")
        self.assertEqual(r.status_code, 400)
        self.assertIn("Not enough stock", r.content.decode())
