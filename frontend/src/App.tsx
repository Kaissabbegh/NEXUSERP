import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import { useAuth } from './lib/auth'
import Accounts from './pages/Accounts'
import Contacts from './pages/Contacts'
import Dashboard from './pages/Dashboard'
import EntryDetail from './pages/EntryDetail'
import Entries from './pages/Entries'
import InvoiceDetail from './pages/InvoiceDetail'
import Invoices from './pages/Invoices'
import Learn from './pages/Learn'
import Login from './pages/Login'
import Products from './pages/Products'
import SaleOrderDetail from './pages/SaleOrderDetail'
import SaleOrderEditor from './pages/SaleOrderEditor'
import Sales from './pages/Sales'
import Stock from './pages/Stock'
import Transfers from './pages/Transfers'

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
