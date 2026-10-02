from django.contrib import admin

from .models import Partner, PaymentTerm, Product, ProductCategory, Tax, UnitOfMeasure, Sequence

admin.site.register(Partner)
admin.site.register(PaymentTerm)
admin.site.register(Product)
admin.site.register(ProductCategory)
admin.site.register(Tax)
admin.site.register(UnitOfMeasure)
admin.site.register(Sequence)
