import {
  Briefcase, Building2, CalendarCheck, Calculator, ClipboardList, Factory, Handshake, HardHat, Headset, Receipt, ShieldAlert,
  ShoppingBag, ShoppingCart, Target, Truck, Undo2, UserCog, UserRound, Users, Wrench, type LucideIcon,
} from 'lucide-react'

export const SCENARIO_ICONS: Record<string, LucideIcon> = {
  ShoppingBag, ShoppingCart, Factory, ShieldAlert, CalendarCheck, Target, Undo2, Users, Receipt, Truck,
}

export const SCENARIO_COLORS: Record<string, { bg: string; text: string; ring: string; solid: string }> = {
  green: { bg: 'bg-green/15', text: 'text-green', ring: 'ring-green/40', solid: 'bg-green' },
  orange: { bg: 'bg-orange/15', text: 'text-orange', ring: 'ring-orange/40', solid: 'bg-orange' },
  purple: { bg: 'bg-purple/15', text: 'text-purple', ring: 'ring-purple/40', solid: 'bg-purple' },
  pink: { bg: 'bg-pink/15', text: 'text-pink', ring: 'ring-pink/40', solid: 'bg-pink' },
  blue: { bg: 'bg-blue/15', text: 'text-blue', ring: 'ring-blue/40', solid: 'bg-blue' },
  teal: { bg: 'bg-teal/15', text: 'text-teal', ring: 'ring-teal/40', solid: 'bg-teal' },
  yellow: { bg: 'bg-yellow/15', text: 'text-yellow', ring: 'ring-yellow/40', solid: 'bg-yellow' },
  indigo: { bg: 'bg-indigo/15', text: 'text-indigo', ring: 'ring-indigo/40', solid: 'bg-indigo' },
}

/** Who does the step in a real company. */
export const ACTOR_ICONS: Record<string, LucideIcon> = {
  Salesperson: UserRound,
  'Sales manager': Briefcase,
  Warehouse: Truck,
  Accountant: Calculator,
  Purchaser: ClipboardList,
  Planner: Wrench,
  Workshop: HardHat,
  Manager: Building2,
  'Customer service': Headset,
  'HR officer': UserCog,
  Employee: Handshake,
}
