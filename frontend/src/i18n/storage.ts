/**
 * Language persistence utilities — no i18next dependency so this module
 * can be imported and tested in a plain Node environment without triggering
 * i18next or React initialisation.
 */

export const SUPPORTED_LANGUAGES = ['en', 'tr', 'ru'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const LANGUAGE_STORAGE_KEY = 'cf_language'

/**
 * Read the user's language preference from localStorage.
 * Returns 'en' when:
 *  - Nothing is stored yet.
 *  - The stored value is not in SUPPORTED_LANGUAGES (e.g. a stale/invalid entry).
 *  - localStorage is inaccessible (private-browsing restrictions, SSR).
 */
export function getStoredLanguage(): SupportedLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
      return stored as SupportedLanguage
    }
  } catch {
    // localStorage not available — fall through to default
  }
  return 'en'
}
