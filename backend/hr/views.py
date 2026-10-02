from django.utils.dateparse import parse_date
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from . import services
from .models import Department, Employee, ExpenseClaim, Payslip, PayrollRun


class DepartmentSerializer(serializers.ModelSerializer):
    employee_count = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = ["id", "name", "employee_count"]

    def get_employee_count(self, obj) -> int:
        return obj.employees.filter(active=True).count()


class EmployeeSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)
    preview = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = ["id", "name", "job_title", "department", "department_name", "email", "hire_date", "wage", "active", "preview"]

    def get_preview(self, obj):
        """What one month of pay looks like for this employee."""
        return services.compute_payslip(obj.wage)


class PayslipSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    job_title = serializers.CharField(source="employee.job_title", read_only=True)

    class Meta:
        model = Payslip
        fields = ["id", "employee", "employee_name", "job_title", "gross", "employee_social", "income_tax", "net", "employer_social"]


class PayrollRunSerializer(serializers.ModelSerializer):
    state_display = serializers.CharField(source="get_state_display", read_only=True)
    payslips = PayslipSerializer(many=True, read_only=True)
    totals = serializers.SerializerMethodField()

    class Meta:
        model = PayrollRun
        fields = ["id", "name", "period", "state", "state_display", "move", "payment_move", "authorities_move", "payslips",
                  "totals", "created_at"]

    def get_totals(self, obj):
        return obj.totals()


class ExpenseClaimSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True)
    state_display = serializers.CharField(source="get_state_display", read_only=True)

    class Meta:
        model = ExpenseClaim
        fields = ["id", "employee", "employee_name", "description", "account", "account_name", "amount", "date", "state",
                  "state_display", "move", "payment_move", "created_at"]
        read_only_fields = ["state", "move", "payment_move"]

    def validate_account(self, account):
        if not account.code.startswith("6"):
            raise serializers.ValidationError("Choose an expense account (6xxxxx).")
        return account


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.select_related("department")
    serializer_class = EmployeeSerializer


class PayrollRunViewSet(mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    queryset = PayrollRun.objects.prefetch_related("payslips__employee")
    serializer_class = PayrollRunSerializer

    def create(self, request, *args, **kwargs):
        period = parse_date(request.data.get("period") or "")
        if not period:
            raise ValidationError("Choose the month to pay (YYYY-MM-01).")
        return Response(PayrollRunSerializer(services.create_run(period)).data, status=201)

    def _act(self, fn):
        fn(self.get_object())
        return Response(PayrollRunSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"], url_path="post")
    def post_run(self, request, pk=None):
        return self._act(services.post_run)

    @action(detail=True, methods=["post"], url_path="pay-salaries")
    def pay_salaries(self, request, pk=None):
        return self._act(services.pay_salaries)

    @action(detail=True, methods=["post"], url_path="pay-authorities")
    def pay_authorities(self, request, pk=None):
        return self._act(services.pay_authorities)


class ExpenseClaimViewSet(mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    queryset = ExpenseClaim.objects.select_related("employee", "account")
    serializer_class = ExpenseClaimSerializer

    def _act(self, fn):
        fn(self.get_object())
        return Response(ExpenseClaimSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._act(services.approve_expense)

    @action(detail=True, methods=["post"])
    def refuse(self, request, pk=None):
        return self._act(services.refuse_expense)

    @action(detail=True, methods=["post"])
    def reimburse(self, request, pk=None):
        return self._act(services.reimburse_expense)
