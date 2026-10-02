export interface ProcessStep {
  label: string
  doc?: string // document created or used
  who: string
  effect: string // what changes (stock, accounting, status)
}

export interface Quiz {
  q: string
  options: string[]
  answer: number
  why: string
}

export interface Chapter {
  slug: string
  number: number
  title: string
  department: string
  icon: string
  color: 'blue' | 'green' | 'orange' | 'purple' | 'pink' | 'teal' | 'yellow' | 'indigo' | 'red'
  minutes: number
  summary: string
  goals: string[]
  intro: string[]
  roles?: { name: string; does: string }[]
  process?: { title: string; steps: ProcessStep[] }[]
  concepts: { term: string; meaning: string }[]
  accounting?: { event: string; debit: string; credit: string; why: string }[]
  integrations?: { module: string; how: string }[]
  kpis?: { name: string; formula: string; why: string }[]
  bestPractices: string[]
  mistakes: string[]
  consultant?: { questions: string[]; data: string[]; configure: string[] }
  tryIt?: { label: string; to: string }[]
  scenarios?: string[]
  quiz: Quiz[]
}
