import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mapAnnouncementError, formatProgress, relativeTime } from './announcementHelpers'

describe('mapAnnouncementError', () => {
  // Minimal TFunction mock: returns key if no translation
  const t = ((key: string) => {
    const map: Record<string, string> = {
      'announcements.error.throttled': 'Too many announcements. Please wait.',
      'announcements.error.body_too_long': 'Body is too long.',
      'announcements.error.team_not_in_academy': 'Team does not belong to this academy.',
      'announcements.error.acknowledge_not_allowed': 'Only players and parents can acknowledge.',
      'common.error.generic': 'Something went wrong.',
    }
    return map[key] ?? key
  }) as unknown as import('i18next').TFunction

  it('maps 429 to throttle message', () => {
    expect(mapAnnouncementError(429, '{}', t)).toBe('Too many announcements. Please wait.')
  })

  it('maps known error code', () => {
    expect(mapAnnouncementError(400, JSON.stringify({ code: 'body_too_long' }), t)).toBe('Body is too long.')
  })

  it('maps field errors', () => {
    const body = JSON.stringify({ team: ['This team does not belong.'] })
    expect(mapAnnouncementError(400, body, t)).toBe('This team does not belong.')
  })

  it('maps detail string', () => {
    const body = JSON.stringify({ detail: 'Only the author can edit.' })
    expect(mapAnnouncementError(403, body, t)).toBe('Only the author can edit.')
  })

  it('returns generic for unparseable body', () => {
    expect(mapAnnouncementError(500, 'not json', t)).toBe('Something went wrong.')
  })
})

describe('formatProgress', () => {
  it('formats as "x / y"', () => {
    expect(formatProgress(5, 12)).toBe('5 / 12')
  })
  it('handles zero', () => {
    expect(formatProgress(0, 0)).toBe('0 / 0')
  })
})

describe('relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-24T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns relative time for minutes ago', () => {
    const result = relativeTime('2026-10-24T11:50:00Z', 'en')
    expect(result).toMatch(/10 minutes ago/)
  })

  it('returns relative time for hours ago', () => {
    const result = relativeTime('2026-10-24T09:00:00Z', 'en')
    expect(result).toMatch(/3 hours ago/)
  })

  it('returns relative time for days ago', () => {
    const result = relativeTime('2026-10-22T12:00:00Z', 'en')
    expect(result).toMatch(/2 days ago/)
  })
})
