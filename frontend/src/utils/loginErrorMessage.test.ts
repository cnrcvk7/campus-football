import { describe, it, expect } from 'vitest'
import { loginErrorMessage } from './loginErrorMessage'

describe('loginErrorMessage', () => {
  it('returns rate-limit message for HTTP 429', () => {
    expect(loginErrorMessage(429)).toBe(
      'Too many login attempts. Please wait a minute and try again.',
    )
  })

  it('returns credential message for HTTP 401', () => {
    expect(loginErrorMessage(401)).toBe('Invalid email or password.')
  })

  it('returns generic message for HTTP 500', () => {
    expect(loginErrorMessage(500)).toBe('Something went wrong. Please try again.')
  })

  it('returns generic message for HTTP 503', () => {
    expect(loginErrorMessage(503)).toBe('Something went wrong. Please try again.')
  })

  it('returns generic message for null (non-HTTP error, e.g. network failure)', () => {
    expect(loginErrorMessage(null)).toBe('Something went wrong. Please try again.')
  })
})
