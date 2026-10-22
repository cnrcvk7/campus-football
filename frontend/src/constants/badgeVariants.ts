import type { BadgeVariant } from '../components/ui/Badge'
import type { AttendanceStatus, MatchResult } from '../types'

/** Badge colour per skill / exercise category (training and development).
 *  Covers the four values that Exercise.Category exposes: TECHNICAL, TACTICAL, PHYSICAL, MENTAL.
 */
export const CATEGORY_VARIANT: Record<string, BadgeVariant> = {
  TECHNICAL: 'sky',
  TACTICAL: 'violet',
  PHYSICAL: 'emerald',
  MENTAL: 'amber',
}

export const ATTENDANCE_VARIANT: Record<AttendanceStatus, BadgeVariant> = {
  PRESENT: 'emerald',
  LATE: 'amber',
  EXCUSED: 'sky',
  ABSENT: 'red',
}

export const RESULT_VARIANT: Record<MatchResult, BadgeVariant> = {
  WIN: 'emerald',
  DRAW: 'amber',
  LOSS: 'red',
}

/** Translation key for a match result badge (WIN → matches.winBadge). */
export function resultLabelKey(result: MatchResult): string {
  return `matches.${result.toLowerCase()}Badge`
}
