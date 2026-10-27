import type { TFunction } from 'i18next'

/**
 * Map backend error responses to translated user-facing messages.
 * Handles both structured {detail: string, code: string} and flat {field: [messages]} shapes.
 */
export function mapAnnouncementError(
  status: number,
  body: string,
  t: TFunction,
): string {
  if (status === 429) {
    return t('announcements.error.throttled')
  }

  try {
    const parsed = JSON.parse(body)

    // DRF code-based errors
    const code = parsed?.code ?? parsed?.detail?.code
    if (code) {
      const key = `announcements.error.${code}`
      const translated = t(key)
      if (translated !== key) return translated
    }

    // Flat field errors: {"team": ["msg"], "body": ["msg"]}
    if (typeof parsed === 'object' && !parsed.detail) {
      const messages: string[] = []
      for (const val of Object.values(parsed)) {
        if (Array.isArray(val)) messages.push(...val.map(String))
        else if (typeof val === 'string') messages.push(val)
      }
      if (messages.length > 0) return messages.join(' ')
    }

    // Generic detail string
    if (typeof parsed?.detail === 'string') return parsed.detail
  } catch {
    // not JSON
  }

  return t('common.error.generic')
}

/**
 * Format acknowledgement progress: "5 / 12"
 */
export function formatProgress(acknowledged: number, total: number): string {
  return `${acknowledged} / ${total}`
}

/**
 * Get a relative time string using Intl.RelativeTimeFormat.
 */
export function relativeTime(dateStr: string, locale: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = then - now
  const absDiff = Math.abs(diffMs)

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (absDiff < 60_000) return rtf.format(0, 'second') // "now" / "just now"
  if (absDiff < 3_600_000) return rtf.format(Math.round(diffMs / 60_000), 'minute')
  if (absDiff < 86_400_000) return rtf.format(Math.round(diffMs / 3_600_000), 'hour')
  if (absDiff < 2_592_000_000) return rtf.format(Math.round(diffMs / 86_400_000), 'day')
  return rtf.format(Math.round(diffMs / 2_592_000_000), 'month')
}
