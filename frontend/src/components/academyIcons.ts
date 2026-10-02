import {
  BarChart3, BookOpen, Boxes, Database, Factory, LayoutGrid, Rocket, ShoppingBag, ShoppingCart, Users, type LucideIcon,
} from 'lucide-react'

export const CHAPTER_ICONS: Record<string, LucideIcon> = {
  Database, ShoppingBag, ShoppingCart, Boxes, Factory, BookOpen, Users, BarChart3, LayoutGrid, Rocket,
}

export const CHAPTER_COLORS: Record<string, { bg: string; text: string; solid: string; border: string }> = {
  blue: { bg: 'bg-blue/15', text: 'text-blue', solid: 'bg-blue', border: 'border-blue/30' },
  green: { bg: 'bg-green/15', text: 'text-green', solid: 'bg-green', border: 'border-green/30' },
  orange: { bg: 'bg-orange/15', text: 'text-orange', solid: 'bg-orange', border: 'border-orange/30' },
  purple: { bg: 'bg-purple/15', text: 'text-purple', solid: 'bg-purple', border: 'border-purple/30' },
  pink: { bg: 'bg-pink/15', text: 'text-pink', solid: 'bg-pink', border: 'border-pink/30' },
  teal: { bg: 'bg-teal/15', text: 'text-teal', solid: 'bg-teal', border: 'border-teal/30' },
  yellow: { bg: 'bg-yellow/15', text: 'text-yellow', solid: 'bg-yellow', border: 'border-yellow/30' },
  indigo: { bg: 'bg-indigo/15', text: 'text-indigo', solid: 'bg-indigo', border: 'border-indigo/30' },
  red: { bg: 'bg-red/15', text: 'text-red', solid: 'bg-red', border: 'border-red/30' },
}
