/**
 * i18next initialisation — imported once as a side-effect in main.tsx.
 *
 * Language selection order:
 *   1. Value stored in localStorage under LANGUAGE_STORAGE_KEY (if valid).
 *   2. Hard-coded fallback: 'en'.
 *
 * Changing the language at runtime:
 *   Call i18n.changeLanguage(lng) and persist via
 *   localStorage.setItem(LANGUAGE_STORAGE_KEY, lng).
 *   The LanguageSelector component in AppNav handles both steps together.
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import tr from './locales/tr.json'
import ru from './locales/ru.json'
import ko from './locales/ko.json'
import { getStoredLanguage } from './storage'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    tr: { translation: tr },
    ru: { translation: ru },
    ko: { translation: ko },
  },
  lng: getStoredLanguage(),
  fallbackLng: 'en',
  interpolation: {
    // React already escapes values — disabling here prevents double-escaping.
    escapeValue: false,
  },
})

// Keep <html lang> in sync so the browser picks matching fonts (e.g. Hangul)
// and line-breaking rules, and screen readers use the right voice.
function syncDocumentLanguage(lng: string) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng
  }
}
syncDocumentLanguage(i18n.language)
i18n.on('languageChanged', syncDocumentLanguage)

export default i18n
