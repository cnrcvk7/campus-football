const LOCALE_MAP: Record<string, string> = {
  en: 'en-GB',
  tr: 'tr-TR',
  ru: 'ru-RU',
  ko: 'ko-KR',
}

export function toDisplayLocale(language: string): string {
  return LOCALE_MAP[language] ?? 'en-GB'
}
