from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounting import views as accounting
from accounts import views as accounts
from inventory import views as inventory
from masterdata import views as masterdata
from mrp import views as mrp
from purchase import views as purchase
from sales import views as sales
from scenarios import views as scenarios

router = DefaultRouter()
router.register("partners", masterdata.PartnerViewSet, basename="partner")
router.register("products", masterdata.ProductViewSet, basename="product")
router.register("product-categories", masterdata.ProductCategoryViewSet)
router.register("taxes", masterdata.TaxViewSet)
router.register("payment-terms", masterdata.PaymentTermViewSet)
router.register("uoms", masterdata.UnitOfMeasureViewSet)
router.register("accounts", accounting.AccountViewSet)
router.register("journals", accounting.JournalViewSet)
router.register("moves", accounting.MoveViewSet, basename="move")
router.register("payments", accounting.PaymentViewSet)
router.register("warehouses", inventory.WarehouseViewSet)
router.register("locations", inventory.LocationViewSet)
router.register("pickings", inventory.PickingViewSet, basename="picking")
router.register("sale-orders", sales.SaleOrderViewSet, basename="sale-order")
router.register("purchase-orders", purchase.PurchaseOrderViewSet, basename="purchase-order")
router.register("boms", mrp.BillOfMaterialsViewSet)
router.register("manufacturing-orders", mrp.ManufacturingOrderViewSet, basename="manufacturing-order")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/token/", TokenObtainPairView.as_view()),
    path("api/auth/refresh/", TokenRefreshView.as_view()),
    path("api/auth/me/", accounts.me),
    path("api/dashboard/", accounts.dashboard),
    path("api/stock/", inventory.stock_overview),
    path("api/stock/<int:product_id>/moves/", inventory.product_moves),
    path("api/stock/adjust/", inventory.adjust_stock),
    path("api/replenishment/", purchase.replenishment),
    path("api/reports/profit-loss/", accounting.profit_and_loss),
    path("api/reports/balance-sheet/", accounting.balance_sheet),
    path("api/reports/aged/", accounting.aged_balance),
    path("api/scenarios/", scenarios.scenario_list),
    path("api/scenarios/<str:key>/start/", scenarios.start),
    path("api/scenario-runs/<int:run_id>/next/", scenarios.next_step),
    path("api/", include(router.urls)),
]
