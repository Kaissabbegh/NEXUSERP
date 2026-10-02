from masterdata.testing import DemoTestCase
from scenarios.library import SCENARIOS


class ScenarioTests(DemoTestCase):
    def play(self, key):
        start = self.ok(self.client.post(f"/api/scenarios/{key}/start/"), 201)
        steps = []
        for _ in start["scenario"]["steps"]:
            steps.append(self.ok(self.client.post(f"/api/scenario-runs/{start['run']}/next/")))
        self.assertTrue(steps[-1]["finished"])
        self.assertEqual(self.client.post(f"/api/scenario-runs/{start['run']}/next/").status_code, 400)
        self.assertBooksBalanced()
        return steps

    def test_every_scenario_plays_twice(self):
        self.assertEqual(len(self.ok(self.client.get("/api/scenarios/"))), 5)
        for key in SCENARIOS:
            for _ in range(2):  # replays must work even after earlier runs used up stock
                with self.subTest(key=key):
                    steps = self.play(key)
                    self.assertTrue(all(s["explanation"] for s in steps))

    def test_sell_story_effects(self):
        steps = self.play("sell")
        self.assertEqual(steps[0]["entries"], [], "a quotation posts nothing")
        self.assertEqual([e["journal_code"] for e in steps[2]["entries"]], ["STJ"])
        self.assertEqual([e["journal_code"] for e in steps[3]["entries"]], ["INV"])
        self.assertTrue(any(s["sku"] == "CHAIR-001" for s in steps[2]["stock"]))

    def test_credit_story_is_blocked_then_confirmed(self):
        steps = self.play("credit")
        self.assertEqual(steps[3]["outcome"], "blocked")
        self.assertEqual(steps[5]["outcome"], "ok")
        self.assertIn("confirmed", steps[5]["explanation"])
