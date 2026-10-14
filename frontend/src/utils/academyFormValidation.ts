export interface AcademyFormValues {
  name: string
}

export interface AcademyFormErrors {
  name?: string
}

/**
 * Client-side validation for the Create Academy form.
 * Returns an object whose keys are field names and values are error messages.
 * An empty object means the form is valid.
 */
export function validateAcademyForm(values: AcademyFormValues): AcademyFormErrors {
  const errors: AcademyFormErrors = {}
  const name = values.name.trim()
  if (!name) {
    errors.name = 'academies.validation.nameRequired'
  } else if (name.length > 200) {
    errors.name = 'academies.validation.nameTooLong'
  }
  return errors
}
