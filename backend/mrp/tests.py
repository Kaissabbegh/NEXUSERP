from decimal import Decimal

from masterdata.testing import DemoTestCase
from mrp.models import BillOfMaterials


class ManufacturingTests(DemoTestCase):
    def test_produce_moves_value_from_components_to_finished_good(self):
        bom = BillOfMaterials.objects.get(product__sku="DESK-001")
        inventory_before = self.balance("110100")
        desks, panels = self.on_hand("DESK-001"), self.on_hand("COMP-001")

        mo = self.ok(self.client.post("/api/manufacturing-orders/", {"bom": bom.id, "quantity": "2"}, format="json"), 201)
        self.ok(self.client.post(f"/api/manufacturing-orders/{mo['id']}/confirm/"))
        mo = self.ok(self.client.post(f"/api/manufacturing-orders/{mo['id']}/produce/"))

        self.assertEqual(mo["state"], "done")
        self.assertEqual(self.on_hand("DESK-001"), desks + 2)
        self.assertEqual(self.on_hand("COMP-001"), panels - 2)
        component_cost = sum(Decimal(c["cost"]) * Decimal(c["quantity"]) for c in mo["components"]) / 2
        self.assertEqual(Decimal(mo["unit_cost"]), component_cost.quantize(Decimal("0.01")))
        # Same valuation account on both sides: total inventory value is unchanged.
        self.assertEqual(self.balance("110100"), inventory_before)
        self.assertEqual(len(mo["entries"]), 1)
        self.assertBooksBalanced()

    def test_missing_components_block_production(self):
        bom = BillOfMaterials.objects.get(product__sku="DESK-002")
        mo = self.ok(self.client.post("/api/manufacturing-orders/", {"bom": bom.id, "quantity": "50"}, format="json"), 201)
        self.ok(self.client.post(f"/api/manufacturing-orders/{mo['id']}/confirm/"))
        r = self.client.post(f"/api/manufacturing-orders/{mo['id']}/produce/")
        self.assertEqual(r.status_code, 400)
        self.assertIn("Missing components", r.content.decode())
