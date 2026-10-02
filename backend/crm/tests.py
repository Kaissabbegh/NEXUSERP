from crm.models import Lead
from masterdata.models import Partner
from masterdata.testing import DemoTestCase


class CrmTests(DemoTestCase):
    def test_lead_to_won_order(self):
        lead = self.ok(self.client.post("/api/leads/", {"name": "New office", "company_name": "Zeta Labs",
                                                        "expected_revenue": "5000"}, format="json"), 201)
        self.assertFalse(Partner.objects.filter(name="Zeta Labs").exists(), "a lead is not a customer yet")
        self.assertEqual(self.client.post(f"/api/leads/{lead['id']}/won/").status_code, 400, "no quotation yet")
        lead = self.ok(self.client.post(f"/api/leads/{lead['id']}/qualify/"))
        self.assertEqual(lead["probability"], 30)
        lead = self.ok(self.client.post(f"/api/leads/{lead['id']}/quotation/"))
        self.assertEqual(lead["stage"], "proposition")
        self.assertTrue(Partner.objects.get(name="Zeta Labs").is_customer)

        # Add a line, then confirming the quotation from Sales wins the opportunity.
        order = self.ok(self.client.get(f"/api/sale-orders/{lead['sale_order']}/"))
        desk = self.product("DESK-003")
        self.ok(self.client.patch(f"/api/sale-orders/{order['id']}/", {"lines": [
            {"product": desk.id, "quantity": 1, "price_unit": "240.00"}]}, format="json"))
        self.ok(self.client.post(f"/api/sale-orders/{order['id']}/confirm/"))
        self.assertEqual(Lead.objects.get(pk=lead["id"]).stage, "won")

    def test_lost_needs_open_lead(self):
        lead = Lead.objects.create(name="Tender", expected_revenue=1000)
        self.ok(self.client.post(f"/api/leads/{lead.id}/lost/", {"reason": "Too expensive"}, format="json"))
        self.assertEqual(self.client.post(f"/api/leads/{lead.id}/qualify/").status_code, 400)
