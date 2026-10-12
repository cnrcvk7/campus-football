import { describe, it, expect } from 'vitest'
import { resolveDestination } from './resolveDestination'
import type { AuthUser } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'u1',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    is_active: true,
    player_profile: null,
    role: 'COACH',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// from !== '/' — always honour the prior route regardless of role
// ---------------------------------------------------------------------------

describe('resolveDestination — ProtectedRoute redirect preserved', () => {
  it('returns from-path for PLAYER when from is a specific page', () => {
    const user = makeUser({ role: 'PLAYER' })
    expect(resolveDestination(user, '/players/abc-123')).toBe('/players/abc-123')
  })

  it('returns from-path for PARENT when from is a specific page', () => {
    const user = makeUser({ role: 'PARENT' })
    expect(resolveDestination(user, '/players')).toBe('/players')
  })

  it('returns from-path for COACH when from is a specific page', () => {
    const user = makeUser({ role: 'COACH' })
    expect(resolveDestination(user, '/coach/sessions')).toBe('/coach/sessions')
  })

  it('returns from-path for ACADEMY_ADMIN when from is a specific page', () => {
    const user = makeUser({ role: 'ACADEMY_ADMIN' })
    expect(resolveDestination(user, '/coach/matches')).toBe('/coach/matches')
  })
})

// ---------------------------------------------------------------------------
// from === '/' — role-based default destinations
// ---------------------------------------------------------------------------

describe('resolveDestination — PLAYER role', () => {
  it('navigates to own profile when player_profile is set', () => {
    const user = makeUser({
      role: 'PLAYER',
      player_profile: {
        player_id: 'pid-42',
        football_id: 'CF-00000042',
        first_name: 'Ali',
        last_name: 'Yilmaz',
      },
    })
    expect(resolveDestination(user, '/')).toBe('/players/pid-42')
  })

  it('navigates to /players when player_profile is null', () => {
    const user = makeUser({ role: 'PLAYER', player_profile: null })
    expect(resolveDestination(user, '/')).toBe('/players')
  })
})

describe('resolveDestination — PARENT role', () => {
  it('navigates to /players', () => {
    const user = makeUser({ role: 'PARENT' })
    expect(resolveDestination(user, '/')).toBe('/players')
  })
})

describe('resolveDestination — COACH role', () => {
  it('navigates to / (dashboard)', () => {
    const user = makeUser({ role: 'COACH' })
    expect(resolveDestination(user, '/')).toBe('/')
  })
})

describe('resolveDestination — ACADEMY_ADMIN role', () => {
  it('navigates to / (dashboard)', () => {
    const user = makeUser({ role: 'ACADEMY_ADMIN' })
    expect(resolveDestination(user, '/')).toBe('/')
  })
})
