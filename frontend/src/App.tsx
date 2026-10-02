import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import { useAuth } from './lib/auth'
import Login from './pages/Login'

const Accounts = lazy(() => import('./pages/Accounts'))
const Aged = lazy(() => import('./pages/Aged'))
const BalanceSheet = lazy(() => import('./pages/BalanceSheet'))
const Boms = lazy(() => import('./pages/Boms'))
const Contacts = lazy(() => import('./pages/Contacts'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Entries = lazy(() => import('./pages/Entries'))
const EntryDetail = lazy(() => import('./pages/EntryDetail'))
const Glossary = lazy(() => import('./pages/Glossary'))
const InvoiceDetail = lazy(() => import('./pages/InvoiceDetail'))
const Invoices = lazy(() => import('./pages/Invoices'))
const Learn = lazy(() => import('./pages/Learn'))
const ManufacturingDetail = lazy(() => import('./pages/ManufacturingDetail'))
const ManufacturingOrders = lazy(() => import('./pages/ManufacturingOrders'))
const Products = lazy(() => import('./pages/Products'))
const ProfitLoss = lazy(() => import('./pages/ProfitLoss'))
const PurchaseOrderDetail = lazy(() => import('./pages/PurchaseOrderDetail'))
const PurchaseOrderEditor = lazy(() => import('./pages/PurchaseOrderEditor'))
const Purchases = lazy(() => import('./pages/Purchases'))
const Replenishment = lazy(() => import('./pages/Replenishment'))
const SaleOrderDetail = lazy(() => import('./pages/SaleOrderDetail'))
const SaleOrderEditor = lazy(() => import('./pages/SaleOrderEditor'))
const Sales = lazy(() => import('./pages/Sales'))
const Stock = lazy(() => import('./pages/Stock'))
const Transfers = lazy(() => import('./pages/Transfers'))

export default function App() {
  const { user, ready } = useAuth()
  if (!ready) return <Spinner className="h-dvh" />
  if (!user) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="learn" element={<Learn />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="products" element={<Products />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="sales" element={<Sales />} />
        <Route path="sales/new" element={<SaleOrderEditor />} />
        <Route path="sales/:id" element={<SaleOrderDetail />} />
        <Route path="sales/:id/edit" element={<SaleOrderEditor />} />
        <Route path="glossary" element={<Glossary />} />
        <Route path="purchases" element={<Purchases />} />
        <Route path="purchases/new" element={<PurchaseOrderEditor />} />
        <Route path="purchases/:id" element={<PurchaseOrderDetail />} />
        <Route path="purchases/:id/edit" element={<PurchaseOrderEditor />} />
        <Route path="replenishment" element={<Replenishment />} />
        <Route path="boms" element={<Boms />} />
        <Route path="manufacturing" element={<ManufacturingOrders />} />
        <Route path="manufacturing/:id" element={<ManufacturingDetail />} />
        <Route path="bills" element={<Invoices kind="vendor" />} />
        <Route path="bills/:id" element={<InvoiceDetail />} />
        <Route path="reports/profit-loss" element={<ProfitLoss />} />
        <Route path="reports/balance-sheet" element={<BalanceSheet />} />
        <Route path="reports/aged" element={<Aged />} />
        <Route path="stock" element={<Stock />} />
        <Route path="transfers" element={<Transfers />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/:id" element={<InvoiceDetail />} />
        <Route path="entries" element={<Entries />} />
        <Route path="entries/:id" element={<EntryDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
