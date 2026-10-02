from django.contrib import admin

from .models import Department, Employee, ExpenseClaim, Payslip, PayrollRun

admin.site.register(Department)
admin.site.register(Employee)
admin.site.register(ExpenseClaim)
admin.site.register(Payslip)
admin.site.register(PayrollRun)
