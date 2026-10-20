import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges Tailwind class names, resolving conflicts so the last
 * definition wins (e.g. `cn('text-red-500', 'text-blue-500')` → `'text-blue-500'`).
 *
 * Use this wherever class names are conditionally combined or where a
 * component accepts a `className` prop that should override defaults.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
