import { describe, it, expect, afterAll } from 'vitest'
import en from './locales/en.json'
import tr from './locales/tr.json'
import ru from './locales/ru.json'
import ko from './locales/ko.json'
import i18n from './index'
import { getStoredLanguage, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from './storage'
import { toDisplayLocale } from '../utils/localeDateFormatter'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out[path] = value
    else Object.assign(out, flatten(value, path))
  }
  return out
}

// i18next plural suffixes — each language only needs the categories its
// Intl.PluralRules produce (Korean: "other" only; Russian adds few/many).
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

function baseKeys(flat: Record<string, string>): Set<string> {
  return new Set(Object.keys(flat).map((k) => k.replace(PLURAL_SUFFIX, '')))
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort()
}

const LOCALES: Record<string, Record<string, string>> = {
  en: flatten(en as Tree),
  tr: flatten(tr as Tree),
  ru: flatten(ru as Tree),
  ko: flatten(ko as Tree),
}

// ---------------------------------------------------------------------------
// Key and placeholder parity
// ---------------------------------------------------------------------------

describe('locale key parity', () => {
  const enBase = baseKeys(LOCALES.en)

  for (const lng of ['tr', 'ru', 'ko']) {
    it(`${lng} has every English key (plural-aware) and no unknown keys`, () => {
      const base = baseKeys(LOCALES[lng])
      expect([...enBase].filter((k) => !base.has(k))).toEqual([])
      expect([...base].filter((k) => !enBase.has(k))).toEqual([])
    })

    it(`${lng} keeps the same interpolation placeholders as English`, () => {
      const mismatches = Object.entries(LOCALES[lng])
        .filter(([key]) => {
          const enKey = key in LOCALES.en ? key : key.replace(PLURAL_SUFFIX, '_other')
          return enKey in LOCALES.en
        })
        .filter(([key, value]) => {
          const enKey = key in LOCALES.en ? key : key.replace(PLURAL_SUFFIX, '_other')
          return placeholders(value).join() !== placeholders(LOCALES.en[enKey]).join()
        })
        .map(([key]) => key)
      expect(mismatches).toEqual([])
    })
  }

  it('Korean defines the "other" form for every English plural key', () => {
    const enPluralBases = Object.keys(LOCALES.en)
      .filter((k) => PLURAL_SUFFIX.test(k))
      .map((k) => k.replace(PLURAL_SUFFIX, ''))
    const missing = enPluralBases.filter((b) => !(`${b}_other` in LOCALES.ko))
    expect(missing).toEqual([])
  })

  it('Korean has no empty translations', () => {
    expect(Object.entries(LOCALES.ko).filter(([, v]) => v.trim() === '')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Registration, persistence, switching and fallback
// ---------------------------------------------------------------------------

describe('Korean registration', () => {
  afterAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('is a supported, bundled language', () => {
    expect(SUPPORTED_LANGUAGES).toContain('ko')
    expect(i18n.hasResourceBundle('ko', 'translation')).toBe(true)
  })

  it('restores "ko" from storage after a reload', () => {
    const store: Record<string, string> = { [LANGUAGE_STORAGE_KEY]: 'ko' }
    const original = globalThis.localStorage
    globalThis.localStorage = {
      getItem: (key: string) => store[key] ?? null,
    } as Storage
    try {
      expect(getStoredLanguage()).toBe('ko')
    } finally {
      globalThis.localStorage = original
    }
  })

  it('translates, interpolates and pluralises in Korean', async () => {
    await i18n.changeLanguage('ko')
    expect(i18n.t('nav.players')).toBe('선수')
    expect(i18n.t('players.playerCount', { count: 1 })).toBe('선수 1명')
    expect(i18n.t('players.playerCount', { count: 5 })).toBe('선수 5명')
    expect(i18n.t('playerReport.periodFilterActive', { period: '2026년 10월' })).toBe(
      '2026년 10월 데이터 표시 중',
    )
  })

  it('falls back to English for a key missing from Korean', async () => {
    await i18n.changeLanguage('ko')
    i18n.addResource('en', 'translation', 'test.onlyInEnglish', 'English only')
    expect(i18n.t('test.onlyInEnglish')).toBe('English only')
  })

  it('maps Korean to the ko-KR display locale', () => {
    expect(toDisplayLocale('ko')).toBe('ko-KR')
  })
})
