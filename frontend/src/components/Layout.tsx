import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeftRight, BarChart3, BookA, BookOpen, Boxes, Factory, FileText, Landmark, LayoutGrid, LogOut, Map as MapIcon, Menu,
  Package, PlayCircle, ReceiptText, RefreshCw, Scale, ScrollText, ShoppingBag, ShoppingCart, Users, X, GraduationCap, Target,
  IdCard, Wallet, Receipt, Truck,
} from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { cx } from '../lib/format'
import { Spinner } from './ui'

const NAV = [
  { section: null, items: [
    { to: '/', label: 'Dashboard', icon: LayoutGrid, color: 'bg-blue' },
    { to: '/academy', label: 'ERP Academy', icon: GraduationCap, color: 'bg-purple' },
    { to: '/scenarios', label: 'Guided Scenarios', icon: PlayCircle, color: 'bg-pink' },
    { to: '/learn', label: 'ERP Map', icon: MapIcon, color: 'bg-teal' },
    { to: '/glossary', label: 'Glossary', icon: BookA, color: 'bg-indigo' },
  ] },
  { section: 'Master Data', items: [
    { to: '/contacts', label: 'Contacts', icon: Users, color: 'bg-teal' },
    { to: '/products', label: 'Products', icon: Package, color: 'bg-orange' },
    { to: '/accounts', label: 'Chart of Accounts', icon: BookOpen, color: 'bg-indigo' },
  ] },
  { section: 'Sales & CRM', items: [
    { to: '/crm', label: 'CRM Pipeline', icon: Target, color: 'bg-teal' },
    { to: '/sales', label: 'Sales Orders', icon: ShoppingBag, color: 'bg-green' },
  ] },
  { section: 'Purchasing', items: [
    { to: '/purchases', label: 'Purchase Orders', icon: ShoppingCart, color: 'bg-orange' },
    { to: '/replenishment', label: 'Replenishment', icon: RefreshCw, color: 'bg-teal' },
  ] },
  { section: 'Inventory', items: [
    { to: '/stock', label: 'Stock', icon: Boxes, color: 'bg-yellow' },
    { to: '/transfers', label: 'Transfers', icon: ArrowLeftRight, color: 'bg-pink' },
  ] },
  { section: 'Manufacturing', items: [
    { to: '/boms', label: 'Bills of Materials', icon: ScrollText, color: 'bg-purple' },
    { to: '/manufacturing', label: 'Manufacturing Orders', icon: Factory, color: 'bg-indigo' },
  ] },
  { section: 'HR & Payroll', items: [
    { to: '/employees', label: 'Employees', icon: IdCard, color: 'bg-indigo' },
    { to: '/payroll', label: 'Payroll', icon: Wallet, color: 'bg-green' },
    { to: '/expenses', label: 'Expense Claims', icon: Receipt, color: 'bg-teal' },
  ] },
  { section: 'Accounting', items: [
    { to: '/invoices', label: 'Customer Invoices', icon: ReceiptText, color: 'bg-blue' },
    { to: '/bills', label: 'Vendor Bills', icon: ReceiptText, color: 'bg-orange' },
    { to: '/assets', label: 'Fixed Assets', icon: Truck, color: 'bg-yellow' },
    { to: '/entries', label: 'Journal Entries', icon: FileText, color: 'bg-surface-3' },
  ] },
  { section: 'Reports', items: [
    { to: '/reports/profit-loss', label: 'Profit & Loss', icon: BarChart3, color: 'bg-green' },
    { to: '/reports/balance-sheet', label: 'Balance Sheet', icon: Scale, color: 'bg-blue' },
    { to: '/reports/aged', label: 'Who Owes Whom', icon: Landmark, color: 'bg-pink' },
  ] },
]

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth()
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pb-6 pt-6">
        <img src="/favicon.svg" alt="" className="size-8" />
        <div>
          <div className="text-[17px] font-semibold tracking-[-0.02em]">NexusERP</div>
          <div className="text-[12px] text-label-3">Nexus Furniture</div>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3">
        {NAV.map((group, i) => (
          <div key={i}>
            {group.section && <div className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-label-3">{group.section}</div>}
            <div className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon, color }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cx('flex items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[14px] transition', isActive ? 'bg-white/10 font-medium text-label' : 'text-label-2 hover:bg-white/5 hover:text-label')
                  }
                >
                  <span className={cx('grid size-[22px] place-items-center rounded-[6px] text-white', color)}>
                    <Icon className="size-[13px]" strokeWidth={2.4} />
                  </span>
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="m-3 flex items-center gap-2.5 rounded-xl bg-white/5 p-2.5">
        <div className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-blue to-purple text-[13px] font-semibold">
          {(user?.first_name || user?.username || '?')[0].toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{user?.first_name ? `${user.first_name} ${user.last_name}` : user?.username}</div>
          <div className="truncate text-[12px] text-label-3">{user?.username}</div>
        </div>
        <button onClick={logout} className="rounded-lg p-1.5 text-label-3 transition hover:bg-white/10 hover:text-label" title="Sign out">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  )
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-dvh">
      <aside className="glass fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-white/[0.06] lg:block">
        <Sidebar />
      </aside>

      <header className="glass sticky top-0 z-30 flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 lg:hidden">
        <button onClick={() => setMobileOpen(true)} className="rounded-lg p-1.5 text-label-2" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <img src="/favicon.svg" alt="" className="size-6" />
        <span className="font-semibold">NexusERP</span>
      </header>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} className="glass absolute inset-y-0 left-0 w-[260px] border-r border-white/10">
              <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-6 rounded-full bg-surface-2 p-1.5 text-label-2" aria-label="Close menu">
                <X className="size-4" />
              </button>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <main className="lg:pl-[248px]">
        <motion.div key={location.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }} className="mx-auto max-w-[1280px] px-4 py-8 sm:px-8 lg:py-10">
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </motion.div>
      </main>
    </div>
  )
}
