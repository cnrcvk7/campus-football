import { useTranslation } from 'react-i18next'
import { toDisplayLocale } from '../../utils/localeDateFormatter'

interface MonthSelectorProps {
  year: number
  month: number // 1-12
  onChange: (year: number, month: number) => void
  maxYear?: number
  maxMonth?: number
}

export default function MonthSelector({
  year,
  month,
  onChange,
  maxYear,
  maxMonth,
}: MonthSelectorProps) {
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)

  const now = new Date()
  const effectiveMaxYear = maxYear ?? now.getFullYear()
  const effectiveMaxMonth = maxMonth ?? (now.getMonth() + 1)

  const isAtMax =
    year > effectiveMaxYear ||
    (year === effectiveMaxYear && month >= effectiveMaxMonth)

  function goPrev() {
    if (month === 1) {
      onChange(year - 1, 12)
    } else {
      onChange(year, month - 1)
    }
  }

  function goNext() {
    if (isAtMax) return
    if (month === 12) {
      onChange(year + 1, 1)
    } else {
      onChange(year, month + 1)
    }
  }

  const label = new Date(year, month - 1).toLocaleString(displayLocale, {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-1.5 ring-1 ring-gray-200 shadow-sm">
      <button
        type="button"
        onClick={goPrev}
        aria-label={t('playerReport.prevMonth')}
        className="flex h-6 w-6 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
      >
        ‹
      </button>
      <span className="min-w-[9rem] text-center text-sm font-medium text-gray-800">
        {label}
      </span>
      <button
        type="button"
        onClick={goNext}
        disabled={isAtMax}
        aria-label={t('playerReport.nextMonth')}
        className="flex h-6 w-6 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ›
      </button>
    </div>
  )
}
