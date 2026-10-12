/**
 * Map an HTTP status code from a failed login attempt to a user-facing message.
 *
 * @param status - The HTTP status from ApiError, or null for non-HTTP errors.
 */
export function loginErrorMessage(status: number | null): string {
  if (status === 429) {
    return 'Too many login attempts. Please wait a minute and try again.'
  }
  if (status === 401) {
    return 'Invalid email or password.'
  }
  return 'Something went wrong. Please try again.'
}
