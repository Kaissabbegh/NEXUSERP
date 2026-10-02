from django.contrib import admin

from .models import Location, Picking, StockMove, Warehouse

admin.site.register(Location)
admin.site.register(Picking)
admin.site.register(StockMove)
admin.site.register(Warehouse)
