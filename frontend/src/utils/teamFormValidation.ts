export interface TeamFormValues {
  name: string
  academy: string
}

export interface TeamFormErrors {
  name?: string
  academy?: string
}

/**
 * Client-side validation for the Create Team form.
 * Returns an object whose keys are field names and values are error messages.
 * An empty object means the form is valid.
 */
export function validateTeamForm(values: TeamFormValues): TeamFormErrors {
  const errors: TeamFormErrors = {}
  const name = values.name.trim()
  if (!name) {
    errors.name = 'teams.validation.nameRequired'
  } else if (name.length > 200) {
    errors.name = 'teams.validation.nameTooLong'
  }
  if (!values.academy) {
    errors.academy = 'teams.validation.academyRequired'
  }
  return errors
}
