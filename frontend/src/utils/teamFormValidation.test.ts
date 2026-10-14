import { describe, it, expect } from 'vitest'
import { validateTeamForm } from './teamFormValidation'

describe('validateTeamForm', () => {
  it('returns no errors for valid name and academy', () => {
    expect(validateTeamForm({ name: 'U15 Boys', academy: 'abc-123' })).toEqual({})
  })

  it('requires a non-empty name', () => {
    const errors = validateTeamForm({ name: '', academy: 'abc-123' })
    expect(errors.name).toBe('teams.validation.nameRequired')
  })

  it('treats a whitespace-only name as empty', () => {
    const errors = validateTeamForm({ name: '   ', academy: 'abc-123' })
    expect(errors.name).toBe('teams.validation.nameRequired')
  })

  it('rejects names longer than 200 characters', () => {
    const errors = validateTeamForm({ name: 'A'.repeat(201), academy: 'abc-123' })
    expect(errors.name).toBe('teams.validation.nameTooLong')
  })

  it('accepts names exactly 200 characters long', () => {
    expect(validateTeamForm({ name: 'A'.repeat(200), academy: 'abc-123' })).toEqual({})
  })

  it('requires an academy to be selected', () => {
    const errors = validateTeamForm({ name: 'U15 Boys', academy: '' })
    expect(errors.academy).toBe('teams.validation.academyRequired')
  })

  it('reports both errors when name and academy are missing', () => {
    const errors = validateTeamForm({ name: '', academy: '' })
    expect(errors.name).toBeDefined()
    expect(errors.academy).toBeDefined()
  })
})
