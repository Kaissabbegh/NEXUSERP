from decimal import Decimal

from masterdata.testing import DemoTestCase


class StockCountTests(DemoTestCase):
    def test_count_lower_than_system_books_a_loss(self):
        chair = self.product("CHAIR-003")
        system = self.on_hand("CHAIR-003")
        loss_before = self.balance("630000")

        picking = self.ok(self.client.post("/api/stock/adjust/", {"product": chair.id, "counted": str(system - 2)}, format="json"), 201)
        self.assertEqual(picking["dest_location_name"], "Virtual/Inventory adjustment")
        self.assertEqual(self.on_hand("CHAIR-003"), system - 2)
        self.assertEqual(self.balance("630000"), loss_before + (2 * chair.cost).quantize(Decimal("0.01")))
        self.assertBooksBalanced()

    def test_count_matching_system_does_nothing(self):
        chair = self.product("CHAIR-003")
        r = self.ok(self.client.post("/api/stock/adjust/", {"product": chair.id, "counted": str(self.on_hand("CHAIR-003"))}, format="json"))
        self.assertIn("No difference", r["detail"])

    def test_services_cannot_be_counted(self):
        r = self.client.post("/api/stock/adjust/", {"product": self.product("SRV-DEL").id, "counted": "1"}, format="json")
        self.assertEqual(r.status_code, 400)
