import { describe, it, expect } from 'vitest'
import { createInstance } from 'i18next'

import en from './locales/en.json'
import tr from './locales/tr.json'
import ru from './locales/ru.json'
import { toDisplayLocale } from '../utils/localeDateFormatter'

// ---------------------------------------------------------------------------
// Report header labels ("Report generated:" / "Print Report") previously
// stayed in English for every UI language. These tests render the real
// locale files through a standalone i18next instance.
// ---------------------------------------------------------------------------

async function makeT(lng: string) {
  const instance = createInstance()
  await instance.init({
    resources: {
      en: { translation: en },
      tr: { translation: tr },
      ru: { translation: ru },
    },
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
  return instance.t
}

const SAMPLE_DATE = new Date(2026, 9, 30)

function formatToday(lng: string): string {
  return SAMPLE_DATE.toLocaleDateString(toDisplayLocale(lng), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

describe('playerReport header labels', () => {
  it('renders English labels with the formatted date', async () => {
    const t = await makeT('en')
    const date = formatToday('en')
    expect(t('playerReport.generatedOn', { date })).toBe(`Report generated: ${date}`)
    expect(t('playerReport.printReport')).toBe('Print Report')
  })

  it('renders Turkish labels with the formatted date', async () => {
    const t = await makeT('tr')
    const date = formatToday('tr')
    expect(t('playerReport.generatedOn', { date })).toBe(`Rapor oluşturulma tarihi: ${date}`)
    expect(t('playerReport.printReport')).toBe('Raporu Yazdır')
  })

  it('renders Russian labels with the formatted date', async () => {
    const t = await makeT('ru')
    const date = formatToday('ru')
    expect(t('playerReport.generatedOn', { date })).toBe(`Отчёт сформирован: ${date}`)
    expect(t('playerReport.printReport')).toBe('Распечатать отчёт')
  })

  it.each(['tr', 'ru'])('does not fall back to English for %s', async (lng) => {
    const tEn = await makeT('en')
    const t = await makeT(lng)
    expect(t('playerReport.generatedOn', { date: 'X' })).not.toBe(
      tEn('playerReport.generatedOn', { date: 'X' }),
    )
    expect(t('playerReport.printReport')).not.toBe(tEn('playerReport.printReport'))
  })
})

// ---------------------------------------------------------------------------
// Goal status, attendance breakdown and feedback labels (previously
// hardcoded English in PlayerReportPage).
// ---------------------------------------------------------------------------

const SECTION_LABEL_KEYS = [
  'playerReport.goalStatus.active',
  'playerReport.goalStatus.completed',
  'playerReport.goalStatus.cancelled',
  'playerReport.attendanceBreakdown.present',
  'playerReport.attendanceBreakdown.late',
  'playerReport.attendanceBreakdown.excused',
  'playerReport.attendanceBreakdown.absent',
  'playerReport.feedbackSource.assessment',
  'playerReport.feedbackSource.match',
  'playerReport.feedbackDefaultAuthor',
]

const EXPECTED: Record<string, Record<string, string>> = {
  en: {
    'playerReport.goalStatus.active': 'Active',
    'playerReport.goalStatus.completed': 'Completed',
    'playerReport.goalStatus.cancelled': 'Cancelled',
    'playerReport.attendanceBreakdown.present': 'Present',
    'playerReport.attendanceBreakdown.late': 'Late',
    'playerReport.attendanceBreakdown.excused': 'Excused',
    'playerReport.attendanceBreakdown.absent': 'Absent',
    'playerReport.feedbackSource.assessment': 'Assessment',
    'playerReport.feedbackSource.match': 'Match',
    'playerReport.feedbackDefaultAuthor': 'Coach',
  },
  tr: {
    'playerReport.goalStatus.active': 'Aktif',
    'playerReport.goalStatus.completed': 'Tamamlanan',
    'playerReport.goalStatus.cancelled': 'İptal Edilen',
    'playerReport.attendanceBreakdown.present': 'Katıldı',
    'playerReport.attendanceBreakdown.late': 'Geç',
    'playerReport.attendanceBreakdown.excused': 'Mazeretli',
    'playerReport.attendanceBreakdown.absent': 'Katılmadı',
    'playerReport.feedbackSource.assessment': 'Değerlendirme',
    'playerReport.feedbackSource.match': 'Maç',
    'playerReport.feedbackDefaultAuthor': 'Antrenör',
  },
  ru: {
    'playerReport.goalStatus.active': 'Активные',
    'playerReport.goalStatus.completed': 'Выполненные',
    'playerReport.goalStatus.cancelled': 'Отменённые',
    'playerReport.attendanceBreakdown.present': 'Присутствие',
    'playerReport.attendanceBreakdown.late': 'Опоздания',
    'playerReport.attendanceBreakdown.excused': 'По уважительной причине',
    'playerReport.attendanceBreakdown.absent': 'Пропуски',
    'playerReport.feedbackSource.assessment': 'Оценка',
    'playerReport.feedbackSource.match': 'Матч',
    'playerReport.feedbackDefaultAuthor': 'Тренер',
  },
}

describe('playerReport section labels', () => {
  it.each(['en', 'tr', 'ru'])('renders every section label in %s', async (lng) => {
    const t = await makeT(lng)
    for (const key of SECTION_LABEL_KEYS) {
      expect(t(key), key).toBe(EXPECTED[lng][key])
    }
  })

  it.each(['tr', 'ru'])('does not fall back to English section labels for %s', async (lng) => {
    const tEn = await makeT('en')
    const t = await makeT(lng)
    for (const key of SECTION_LABEL_KEYS) {
      expect(t(key), key).not.toBe(tEn(key))
    }
  })

  it.each([
    ['en', ['3 Active', '1 Completed', '2 Cancelled']],
    ['tr', ['3 Aktif', '1 Tamamlanan', '2 İptal Edilen']],
    ['ru', ['Активные: 3', 'Выполненные: 1', 'Отменённые: 2']],
  ])('interpolates goal counts in %s', async (lng, expected) => {
    const t = await makeT(lng)
    expect([
      t('playerReport.goalCount.active', { count: 3 }),
      t('playerReport.goalCount.completed', { count: 1 }),
      t('playerReport.goalCount.cancelled', { count: 2 }),
    ]).toEqual(expected)
  })
})

// ---------------------------------------------------------------------------
// Measurement unit labels (Physical Measurements section).
// ---------------------------------------------------------------------------

describe('playerReport measurement units', () => {
  it.each([
    ['en', { cm: 'cm', kg: 'kg', percent: '%', seconds: 's' }],
    ['tr', { cm: 'cm', kg: 'kg', percent: '%', seconds: 's' }],
    // Cyrillic: U+0441 U+043C, U+043A U+0433, U+0441
    ['ru', { cm: 'см', kg: 'кг', percent: '%', seconds: 'с' }],
  ])('uses the correct unit labels in %s', async (lng, expected) => {
    const t = await makeT(lng)
    expect({
      cm: t('playerReport.units.cm'),
      kg: t('playerReport.units.kg'),
      percent: t('playerReport.units.percent'),
      seconds: t('playerReport.units.seconds'),
    }).toEqual(expected)
  })

  it.each([
    ['en', 'since first'],
    ['tr', 'ilk ölçümden bu yana'],
    ['ru', 'с первого измерения'],
  ])('renders the "since first" delta label in %s', async (lng, expected) => {
    const t = await makeT(lng)
    expect(t('playerReport.sinceFirst')).toBe(expected)
  })

  it('uses Cyrillic, not Latin look-alikes, for Russian units', async () => {
    const t = await makeT('ru')
    for (const key of ['cm', 'kg', 'seconds']) {
      expect(t(`playerReport.units.${key}`), key).toMatch(/^[Ѐ-ӿ]+$/)
    }
  })
})
