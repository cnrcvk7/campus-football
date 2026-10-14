import { describe, it, expect, beforeEach } from 'vitest'
import {
  getStoredLanguage,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
} from './storage'

// ---------------------------------------------------------------------------
// Minimal localStorage stub for the Node test environment.
// Vitest runs in Node by default; this avoids a full jsdom setup.
// ---------------------------------------------------------------------------

const store: Record<string, string> = {}

globalThis.localStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value
  },
  removeItem: (key: string) => {
    delete store[key]
  },
  clear: () => {
    Object.keys(store).forEach((k) => delete store[k])
  },
  key: (index: number) => Object.keys(store)[index] ?? null,
  get length() {
    return Object.keys(store).length
  },
} as Storage

// ---------------------------------------------------------------------------

describe('getStoredLanguage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns "en" when nothing is stored', () => {
    expect(getStoredLanguage()).toBe('en')
  })

  it('returns the stored language when it is valid', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'tr')
    expect(getStoredLanguage()).toBe('tr')
  })

  it('returns the stored language for every supported language', () => {
    for (const lng of SUPPORTED_LANGUAGES) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lng)
      expect(getStoredLanguage()).toBe(lng)
    }
  })

  it('returns "en" for an unsupported stored value', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'de')
    expect(getStoredLanguage()).toBe('en')
  })

  it('returns "en" for an empty string stored value', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, '')
    expect(getStoredLanguage()).toBe('en')
  })

  it('returns "en" when localStorage throws (simulated restriction)', () => {
    const original = globalThis.localStorage.getItem
    globalThis.localStorage.getItem = () => {
      throw new Error('SecurityError: access denied')
    }
    expect(getStoredLanguage()).toBe('en')
    globalThis.localStorage.getItem = original
  })
})
