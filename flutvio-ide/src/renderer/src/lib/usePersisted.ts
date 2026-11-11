/**
 * usePersisted.ts — useState that remembers its value in localStorage (layout sizes, toggles).
 * Storage can be unavailable; the state then simply starts from the default.
 */

import { useEffect, useState } from 'react'

export function usePersisted<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return initial
      const parsed = JSON.parse(raw) as T
      // Merge objects so new keys get their defaults.
      if (initial && typeof initial === 'object' && !Array.isArray(initial)) return { ...initial, ...parsed }
      return parsed
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* ignore */
    }
  }, [key, value])

  return [value, setValue]
}
