import { accounting, hr, reporting } from './finance'
import { fundamentals, masterData } from './foundations'
import { inventory, manufacturing, purchasing, sales } from './operations'
import { implementation, otherModules } from './projects'
import type { Chapter } from './types'

export type { Chapter, ProcessStep, Quiz } from './types'

export const CHAPTERS: Chapter[] = [
  fundamentals, masterData, sales, purchasing, inventory, manufacturing, accounting, hr, reporting, otherModules, implementation,
]

const KEY = 'nexus.academy.done'

export function loadProgress(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function saveProgress(p: Record<string, boolean>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* progress is a convenience only */
  }
}
