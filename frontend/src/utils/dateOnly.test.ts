import { describe, expect, it } from 'vitest'
import { parseDateOnly, relativeToToday, toIsoDate } from './dateOnly'

describe('parseDateOnly', () => {
  it('returns the same local calendar day', () => {
    const d = parseDateOnly('2026-03-01')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(1)
  })

  it('ignores a time component', () => {
    expect(toIsoDate(parseDateOnly('2026-12-31T23:59:59Z'))).toBe('2026-12-31')
  })
})

describe('toIsoDate', () => {
  it('zero-pads month and day', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('relativeToToday', () => {
  const now = new Date(2026, 9, 19, 23, 30)

  it('classifies past, today and future days', () => {
    expect(relativeToToday('2026-10-18', now)).toBe('past')
    expect(relativeToToday('2026-10-19', now)).toBe('today')
    expect(relativeToToday('2026-10-20', now)).toBe('future')
  })
})
