from decimal import Decimal

from masterdata.testing import DemoTestCase


class ReportTests(DemoTestCase):
    def test_seeded_books_balance(self):
        self.assertBooksBalanced()
        bs = self.ok(self.client.get("/api/reports/balance-sheet/"))
        self.assertTrue(bs["balanced"])
        self.assertEqual(Decimal(str(bs["assets"]["total"])), Decimal(str(bs["liabilities_and_equity"])))

    def test_profit_and_loss_matches_accounts(self):
        pl = self.ok(self.client.get("/api/reports/profit-loss/"))
        revenue = -(self.balance("400000") + self.balance("410000"))
        self.assertEqual(Decimal(str(pl["revenue"]["total"])), revenue)
        net = Decimal(str(pl["gross_profit"])) - Decimal(str(pl["expenses"]["total"]))
        self.assertEqual(Decimal(str(pl["net_profit"])), net)

    def test_aged_payable_shows_overdue_vendor_bill(self):
        aged = self.ok(self.client.get("/api/reports/aged/?kind=payable"))
        steel = next(p for p in aged["partners"] if p["name"] == "SteelForm Industries")
        self.assertGreater(Decimal(str(steel["d1_30"])), 0)
        self.assertEqual(self.client.get("/api/reports/aged/?kind=nope").status_code, 400)


class ManualEntryTests(DemoTestCase):
    def test_rent_entry_posts_and_unbalanced_is_rejected(self):
        rent, bank = self.account("610000"), self.account("101000")
        before = self.balance("610000")
        entry = self.ok(self.client.post("/api/moves/manual/", {"ref": "Rent", "lines": [
            {"account": rent.id, "debit": "1500"}, {"account": bank.id, "credit": "1500"}]}, format="json"), 201)
        self.assertEqual(entry["state"], "posted")
        self.assertEqual(self.balance("610000"), before + 1500)

        r = self.client.post("/api/moves/manual/", {"lines": [
            {"account": rent.id, "debit": "100"}, {"account": bank.id, "credit": "90"}]}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("unbalanced", r.content.decode())
