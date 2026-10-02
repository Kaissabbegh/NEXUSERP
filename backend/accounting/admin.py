from django.contrib import admin

from .models import Account, Journal, Move, MoveLine, Payment

admin.site.register(Account)
admin.site.register(Journal)
admin.site.register(Move)
admin.site.register(MoveLine)
admin.site.register(Payment)
