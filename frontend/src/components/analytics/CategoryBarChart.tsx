import { useTranslation } from 'react-i18next'
import type { Assessment, SkillCategory } from '../../types'

interface CategoryBarChartProps {
  assessments: Assessment[]
}

const CATEGORY_COLOR: Record<SkillCategory, string> = {
  TECHNICAL: '#0284c7',
  TACTICAL:  '#7c3aed',
  PHYSICAL:  '#10b981',
  MENTAL:    '#d97706',
}

const CATEGORY_ORDER: SkillCategory[] = ['TECHNICAL', 'TACTICAL', 'PHYSICAL', 'MENTAL']

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CategoryBarChart({ assessments }: CategoryBarChartProps) {
  const { t } = useTranslation()

  if (assessments.length === 0) return null

  // Take the latest assessment
  const sorted = [...assessments].sort(
    (a, b) => new Date(b.assessment_date).getTime() - new Date(a.assessment_date).getTime(),
  )
  const latest = sorted[0]

  // Compute per-category avg for the latest assessment
  const catTotals: Partial<Record<SkillCategory, { sum: number; count: number }>> = {}
  for (const item of latest.items) {
    const cat = item.skill_category
    if (!catTotals[cat]) catTotals[cat] = { sum: 0, count: 0 }
    catTotals[cat]!.sum += item.score
    catTotals[cat]!.count += 1
  }

  const rows = CATEGORY_ORDER
    .filter((cat) => catTotals[cat] !== undefined)
    .map((cat) => {
      const t = catTotals[cat]!
      return { cat, avg: Math.round(t.sum / t.count) }
    })

  if (rows.length === 0) return null

  return (
    <div>
      <p className="mb-3 text-xs text-cf-muted-foreground">
        {t('analytics.latestAssessment', { date: formatShortDate(latest.assessment_date) })}
      </p>
      <div className="space-y-3">
        {rows.map(({ cat, avg }) => (
          <div key={cat} className="flex items-center gap-3">
            <span
              className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide"
              style={{ color: CATEGORY_COLOR[cat] }}
            >
              {t('skillCategories.' + cat)}
            </span>
            <div className="flex-1 rounded-full overflow-hidden bg-cf-muted h-3">
              <div
                className="h-3 rounded-full transition-all"
                style={{ width: `${avg}%`, backgroundColor: CATEGORY_COLOR[cat] }}
              />
            </div>
            <span className="w-10 text-right text-sm font-medium text-cf-surface-foreground">
              {avg.toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
