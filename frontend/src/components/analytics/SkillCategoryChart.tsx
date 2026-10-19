import { useTranslation } from 'react-i18next'
import { BarChart2 } from 'lucide-react'
import EmptyState from '../ui/EmptyState'
import type { Assessment, SkillCategory } from '../../types'

interface SkillCategoryChartProps {
  assessments: Assessment[]
}

const CATEGORY_COLOR: Record<SkillCategory, string> = {
  TECHNICAL: '#0284c7',
  TACTICAL:  '#7c3aed',
  PHYSICAL:  '#10b981',
  MENTAL:    '#d97706',
}

const CATEGORIES: SkillCategory[] = ['TECHNICAL', 'TACTICAL', 'PHYSICAL', 'MENTAL']

// Chart layout constants (SVG coordinate space)
const MARGIN = { top: 15, right: 20, bottom: 45, left: 45 }
const VIEW_W = 600
const VIEW_H = 220
const CHART_X1 = MARGIN.left               // 45
const CHART_X2 = VIEW_W - MARGIN.right     // 580
const CHART_Y1 = MARGIN.top                // 15
const CHART_Y2 = VIEW_H - MARGIN.bottom    // 175
const CHART_W  = CHART_X2 - CHART_X1       // 535
const CHART_H  = CHART_Y2 - CHART_Y1       // 160

function scoreToY(score: number): number {
  // score 100 → CHART_Y1 (top), score 0 → CHART_Y2 (bottom)
  return CHART_Y2 - (score / 100) * CHART_H
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function SkillCategoryChart({ assessments }: SkillCategoryChartProps) {
  const { t } = useTranslation()

  if (assessments.length < 2) {
    return (
      <EmptyState
        icon={<BarChart2 size={28} />}
        title={t('analytics.insufficientData')}
        description={t('analytics.insufficientDataDesc')}
      />
    )
  }

  // Sort ascending by date
  const sorted = [...assessments].sort(
    (a, b) => new Date(a.assessment_date).getTime() - new Date(b.assessment_date).getTime(),
  )

  // Build per-category series
  const series: Partial<Record<SkillCategory, { date: string; avg: number }[]>> = {}

  for (const assessment of sorted) {
    const catTotals: Partial<Record<SkillCategory, { sum: number; count: number }>> = {}
    for (const item of assessment.items) {
      const cat = item.skill_category
      if (!catTotals[cat]) catTotals[cat] = { sum: 0, count: 0 }
      catTotals[cat]!.sum += item.score
      catTotals[cat]!.count += 1
    }
    for (const cat of CATEGORIES) {
      const totals = catTotals[cat]
      if (!totals) continue
      const avg = totals.sum / totals.count
      if (!series[cat]) series[cat] = []
      series[cat]!.push({ date: assessment.assessment_date, avg })
    }
  }

  // Only render categories that have at least 1 data point
  const activeCats = CATEGORIES.filter((cat) => (series[cat]?.length ?? 0) > 0)
  if (activeCats.length === 0) {
    return (
      <EmptyState
        icon={<BarChart2 size={28} />}
        title={t('analytics.insufficientData')}
        description={t('analytics.insufficientDataDesc')}
      />
    )
  }

  // X positions — evenly spaced across chart width based on the sorted dates
  const dates = sorted.map((a) => a.assessment_date)
  const n = dates.length
  function dateToX(date: string): number {
    const idx = dates.indexOf(date)
    if (n === 1) return CHART_X1 + CHART_W / 2
    return CHART_X1 + (idx / (n - 1)) * CHART_W
  }

  const gridLines = [0, 25, 50, 75, 100]

  return (
    <div className="w-full" style={{ height: '220px' }}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        aria-label={t('analytics.skillProgression')}
        role="img"
      >
        <title>{t('analytics.skillProgression')}</title>

        {/* Y-axis gridlines and labels */}
        {gridLines.map((val) => {
          const y = scoreToY(val)
          return (
            <g key={val}>
              <line
                x1={CHART_X1}
                y1={y}
                x2={CHART_X2}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
              <text
                x={CHART_X1 - 6}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fill="#94a3b8"
              >
                {val}
              </text>
            </g>
          )
        })}

        {/* X-axis labels */}
        {dates.map((date) => {
          const x = dateToX(date)
          return (
            <text
              key={date}
              x={x}
              y={CHART_Y2 + 16}
              textAnchor="middle"
              fontSize={10}
              fill="#94a3b8"
            >
              {formatShortDate(date)}
            </text>
          )
        })}

        {/* Data series per category */}
        {activeCats.map((cat) => {
          const points = series[cat]!
          const color = CATEGORY_COLOR[cat]
          const polylinePoints = points
            .map((p) => `${dateToX(p.date)},${scoreToY(p.avg)}`)
            .join(' ')

          return (
            <g key={cat}>
              <polyline
                points={polylinePoints}
                stroke={color}
                strokeWidth={2}
                fill="none"
                strokeLinejoin="round"
              />
              {points.map((p) => (
                <circle
                  key={p.date}
                  cx={dateToX(p.date)}
                  cy={scoreToY(p.avg)}
                  r={4}
                  fill={color}
                  stroke="white"
                  strokeWidth={1.5}
                >
                  <title>{`${cat}: ${Math.round(p.avg)} on ${formatShortDate(p.date)}`}</title>
                </circle>
              ))}
            </g>
          )
        })}

        {/* Legend — centered below chart */}
        {activeCats.map((cat, i) => {
          const totalWidth = activeCats.length * 110
          const startX = (VIEW_W - totalWidth) / 2 + i * 110
          return (
            <g key={cat} transform={`translate(${startX}, 200)`}>
              <rect width={10} height={10} fill={CATEGORY_COLOR[cat]} rx={2} />
              <text x={14} y={9} fontSize={10} fill="#64748b">
                {cat.charAt(0) + cat.slice(1).toLowerCase()}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
