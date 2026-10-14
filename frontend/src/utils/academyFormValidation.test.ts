import { describe, it, expect } from 'vitest'
import { validateAcademyForm } from './academyFormValidation'

describe('validateAcademyForm', () => {
  it('returns no errors for a valid name', () => {
    expect(validateAcademyForm({ name: 'Manchester United Academy' })).toEqual({})
  })

  it('requires a non-empty name', () => {
    const errors = validateAcademyForm({ name: '' })
    expect(errors.name).toBe('academies.validation.nameRequired')
  })

  it('treats a whitespace-only name as empty', () => {
    const errors = validateAcademyForm({ name: '   ' })
    expect(errors.name).toBe('academies.validation.nameRequired')
  })

  it('rejects names longer than 200 characters', () => {
    const errors = validateAcademyForm({ name: 'A'.repeat(201) })
    expect(errors.name).toBe('academies.validation.nameTooLong')
  })

  it('accepts names exactly 200 characters long', () => {
    expect(validateAcademyForm({ name: 'A'.repeat(200) })).toEqual({})
  })
})
