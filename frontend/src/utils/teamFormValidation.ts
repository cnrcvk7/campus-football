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
    errors.name = 'Team name is required.'
  } else if (name.length > 200) {
    errors.name = 'Team name must be 200 characters or fewer.'
  }
  if (!values.academy) {
    errors.academy = 'Please select an academy.'
  }
  return errors
}
