/**
 * Helpers for API "date-only" fields (`YYYY-MM-DD`), e.g. `training_date`
 * and `match_date`.
 *
 * `new Date('2026-10-19')` is parsed as UTC midnight, which renders as the
 * previous day in negative-offset timezones. These helpers always treat a
 * date-only string as a calendar day in the viewer's local timezone.
 */

/** Parses `YYYY-MM-DD` (or a longer ISO string) as a local calendar day. */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.substring(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Formats a Date as `YYYY-MM-DD` using its local calendar day. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type DayRelation = 'past' | 'today' | 'future'

/** Classifies a date-only value relative to `now` (defaults to the current time). */
export function relativeToToday(value: string, now: Date = new Date()): DayRelation {
  const day = value.substring(0, 10)
  const today = toIsoDate(now)
  if (day < today) return 'past'
  if (day > today) return 'future'
  return 'today'
}
