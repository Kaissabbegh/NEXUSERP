from datetime import date
from decimal import Decimal

from hr.models import Employee
from hr.services import compute_payslip
from masterdata.testing import DemoTestCase


class PayrollTests(DemoTestCase):
    def test_gross_to_net(self):
        slip = compute_payslip(Decimal("2000"))
        self.assertEqual(slip["employee_social"], Decimal("180.00"))  # 9%
        self.assertEqual(slip["income_tax"], Decimal("182.00"))       # 10% of 1,820
        self.assertEqual(slip["net"], Decimal("1638.00"))
        self.assertEqual(slip["employer_social"], Decimal("420.00"))  # 21%

    def test_payroll_cycle_clears_every_debt(self):
        run = self.ok(self.client.post("/api/payroll-runs/", {"period": "2026-01-01"}, format="json"), 201)
        self.assertEqual(len(run["payslips"]), Employee.objects.filter(active=True, hire_date__lte=date(2026, 1, 28)).count())
        before = {c: self.balance(c) for c in ("254000", "255000", "256000")}
        self.assertEqual(self.client.post(f"/api/payroll-runs/{run['id']}/pay-salaries/").status_code, 400, "must post first")
        for step in ("post", "pay-salaries", "pay-authorities"):
            run = self.ok(self.client.post(f"/api/payroll-runs/{run['id']}/{step}/"))
        self.assertEqual(run["state"], "done")
        self.assertEqual({c: self.balance(c) for c in before}, before)
        self.assertBooksBalanced()

    def test_expense_claim_flow(self):
        employee = Employee.objects.first()
        travel = self.account("640000")
        claim = self.ok(self.client.post("/api/expenses/", {"employee": employee.id, "description": "Taxi", "account": travel.id,
                                                            "amount": "40"}, format="json"), 201)
        before = self.balance("640000")
        self.ok(self.client.post(f"/api/expenses/{claim['id']}/approve/"))
        self.assertEqual(self.balance("640000"), before + 40)
        claim = self.ok(self.client.post(f"/api/expenses/{claim['id']}/reimburse/"))
        self.assertEqual(claim["state"], "paid")
        bad = self.client.post("/api/expenses/", {"employee": employee.id, "description": "x", "account": self.account("101000").id,
                                                  "amount": "1"}, format="json")
        self.assertEqual(bad.status_code, 400, "only expense accounts are allowed")
