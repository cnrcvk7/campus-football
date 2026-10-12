// frontend/src/pages/PlayerReportPage.tsx
import { useNavigate, useParams } from 'react-router-dom'
import AppNav from '../components/ui/AppNav'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { usePlayerProfile } from '../hooks/usePlayerProfile'
import { POSITIONS } from '../constants/football'
import type {
  Assessment,
  DevelopmentGoal,
  MatchSummary,
  PhysicalMeasurement,
  Player,
  PlayerHistory,
  PlayerMatchStats,
  SkillCategory,
  TrainingSessionSummary,
} from '../types'

// ---------------------------------------------------------------------------
// Helpers (local copies — not imported from PlayerProfilePage)
// ---------------------------------------------------------------------------

function calcAge(dob: string): number {
  const diff = Date.now() - new Date(dob).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getActiveAcademy(history: PlayerHistory) {
  return history.academy_history.find((m) => m.status === 'active') ?? null
}

function getActiveTeam(history: PlayerHistory) {
  return history.team_history.find((m) => m.status === 'active') ?? null
}

// ---------------------------------------------------------------------------
// Local primitives (match PlayerProfilePage conventions)
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
      {children}
    </h2>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 ${className}`}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category metadata (matches PlayerProfilePage)
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<SkillCategory, { label: string; color: string; bar: string; bg: string }> = {
  TECHNICAL: { label: 'Technical',  color: 'text-brand-600',   bar: 'bg-brand-500',   bg: 'bg-brand-50'   },
  TACTICAL:  { label: 'Tactical',   color: 'text-violet-600',  bar: 'bg-violet-500',  bg: 'bg-violet-50'  },
  PHYSICAL:  { label: 'Physical',   color: 'text-emerald-600', bar: 'bg-emerald-500', bg: 'bg-emerald-50' },
  MENTAL:    { label: 'Mental',     color: 'text-amber-600',   bar: 'bg-amber-500',   bg: 'bg-amber-50'   },
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Computes the average score per skill category from a single assessment's items.
 * Only includes skills that have recorded scores — missing skills are never
 * treated as zero.
 */
function computeCategoryAvg(
  assessment: Assessment,
): Partial<Record<SkillCategory, { score: number; count: number }>> {
  const acc: Partial<Record<SkillCategory, { sum: number; count: number }>> = {}
  for (const item of assessment.items) {
    const cat = item.skill_category
    if (!acc[cat]) acc[cat] = { sum: 0, count: 0 }
    acc[cat]!.sum += item.score
    acc[cat]!.count += 1
  }
  const result: Partial<Record<SkillCategory, { score: number; count: number }>> = {}
  for (const [cat, val] of Object.entries(acc) as [SkillCategory, { sum: number; count: number }][]) {
    result[cat] = { score: Math.round(val.sum / val.count), count: val.count }
  }
  return result
}

/**
 * Builds a per-skill score history from all assessments.
 * assessments must be in chronological order (earliest first), as returned
 * by GET /api/players/{id}/development/timeline/.
 *
 * Never assigns a score of 0 to a skill that was simply not assessed.
 */
interface SkillHistory {
  skillId: string
  skillName: string
  category: SkillCategory
  entries: { date: string; score: number }[]
}

function buildSkillHistory(assessments: Assessment[]): SkillHistory[] {
  const map = new Map<string, SkillHistory>()
  for (const assessment of assessments) {
    for (const item of assessment.items) {
      if (!map.has(item.skill)) {
        map.set(item.skill, {
          skillId: item.skill,
          skillName: item.skill_name,
          category: item.skill_category,
          entries: [],
        })
      }
      map.get(item.skill)!.entries.push({
        date: assessment.assessment_date,
        score: item.score,
      })
    }
  }
  return Array.from(map.values())
}

/**
 * Safe pass accuracy: returns null when passes_attempted is 0 or unavailable.
 */
function passAccuracy(completed: number, attempted: number): number | null {
  if (attempted <= 0) return null
  return Math.round((completed / attempted) * 100)
}

// ---------------------------------------------------------------------------
// A. Report Header
// ---------------------------------------------------------------------------

function ReportHeader({ player, history }: { player: Player; history: PlayerHistory | null }) {
  const navigate = useNavigate()
  const age = calcAge(player.date_of_birth)
  const position = player.preferred_position ? POSITIONS[player.preferred_position] : null
  const activeAcademy = history ? getActiveAcademy(history) : null
  const activeTeam = history ? getActiveTeam(history) : null

  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-brand-900 text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-400">
              Development Report · All Time
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              {player.first_name} {player.last_name}
            </h1>
            <p className="mt-1 font-mono text-sm text-gray-400">{player.football_id}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-gray-300">
              {age > 0 && <span>{age} years old</span>}
              {position && <span>· {position}</span>}
              {activeTeam && <span>· {activeTeam.team.name}</span>}
              {activeAcademy && <span>· {activeAcademy.academy.name}</span>}
            </div>
          </div>
          <button
            onClick={() => navigate(`/players/${player.id}`)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/20 self-start"
          >
            ← Player Profile
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// B. Development by Skill Category
// ---------------------------------------------------------------------------

function CategorySection({ assessments }: { assessments: Assessment[] }) {
  if (assessments.length === 0) {
    return (
      <section>
        <SectionTitle>Development by Category</SectionTitle>
        <EmptyState icon="📊" title="No assessments recorded" description="Category scores appear after the first coach assessment." />
      </section>
    )
  }

  // assessments is chronological (earliest first) from the timeline endpoint
  const latest = assessments[assessments.length - 1]
  const first = assessments[0]
  const latestScores = computeCategoryAvg(latest)
  // A delta is only meaningful when there are ≥2 different assessments
  const firstScores = assessments.length >= 2 ? computeCategoryAvg(first) : null
  const categories: SkillCategory[] = ['TECHNICAL', 'TACTICAL', 'PHYSICAL', 'MENTAL']

  return (
    <section>
      <SectionTitle>Development by Category</SectionTitle>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {categories.map((cat) => {
          const meta = CATEGORY_META[cat]
          const data = latestScores[cat]
          if (!data) return (
            <Card key={cat} className="opacity-50">
              <p className={`text-xs font-semibold uppercase tracking-widest ${meta.color}`}>{meta.label}</p>
              <p className="mt-2 text-sm text-gray-400">No data</p>
            </Card>
          )
          const prevData = firstScores?.[cat]
          const delta = prevData ? data.score - prevData.score : null

          return (
            <Card key={cat} className="relative overflow-hidden">
              <div className={`absolute inset-0 ${meta.bg} opacity-40 rounded-2xl`} />
              <div className="relative">
                <p className={`text-xs font-semibold uppercase tracking-widest ${meta.color}`}>{meta.label}</p>
                <p className="mt-1 text-4xl font-bold text-gray-900">{data.score}</p>
                <p className="text-xs text-gray-400">/ 100 · {data.count} skill{data.count !== 1 ? 's' : ''}</p>
                <div className="mt-3 h-1.5 rounded-full bg-gray-200">
                  <div className={`h-1.5 rounded-full ${meta.bar}`} style={{ width: `${data.score}%` }} />
                </div>
                {delta !== null && (
                  <p className={`mt-2 text-xs font-semibold ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {delta > 0 ? `+${delta}` : delta} vs first assessment
                  </p>
                )}
              </div>
            </Card>
          )
        })}
      </div>
      {assessments.length < 2 && (
        <p className="mt-3 text-xs text-gray-400">Score changes will appear after a second assessment is recorded.</p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// C. Individual Skill Progression
// ---------------------------------------------------------------------------

function SkillProgressionSection({ assessments }: { assessments: Assessment[] }) {
  if (assessments.length === 0) {
    return (
      <section>
        <SectionTitle>Skill Progression</SectionTitle>
        <EmptyState icon="📈" title="No skill data recorded" description="Skill scores appear after the first assessment." />
      </section>
    )
  }

  const skillHistories = buildSkillHistory(assessments)
  if (skillHistories.length === 0) {
    return (
      <section>
        <SectionTitle>Skill Progression</SectionTitle>
        <EmptyState icon="📈" title="No skills assessed yet" />
      </section>
    )
  }

  // Sort by latest score descending for strengths/improvement display
  const withLatest = skillHistories.map((sh) => ({
    ...sh,
    latestScore: sh.entries[sh.entries.length - 1].score,
    delta: sh.entries.length >= 2
      ? sh.entries[sh.entries.length - 1].score - sh.entries[0].score
      : null,
  }))

  const sorted = [...withLatest].sort((a, b) => {
    if (b.latestScore !== a.latestScore) return b.latestScore - a.latestScore
    return a.skillName.localeCompare(b.skillName) // deterministic tie-breaking
  })

  const strengths = sorted.slice(0, 3)
  const needsWork = [...sorted].reverse().slice(0, 3)

  return (
    <section>
      <SectionTitle>Skill Progression</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        {/* All skills */}
        <Card>
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">All Assessed Skills</p>
          <div className="space-y-3">
            {sorted.map((sh) => {
              const meta = CATEGORY_META[sh.category]
              return (
                <div key={sh.skillId} className="flex items-center gap-3">
                  <span className={`w-28 shrink-0 text-xs font-medium ${meta.color} truncate`}>{sh.skillName}</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100">
                    <div className={`h-2 rounded-full ${meta.bar}`} style={{ width: `${sh.latestScore}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-semibold text-gray-700">{sh.latestScore}</span>
                  {sh.delta !== null && (
                    <span className={`w-10 shrink-0 text-right text-xs font-medium ${sh.delta > 0 ? 'text-emerald-600' : sh.delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {sh.delta > 0 ? `+${sh.delta}` : sh.delta}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Scores are averages of assessment items. &#916; shown only when &#8805;2 comparable assessments exist for the same skill.
          </p>
        </Card>

        {/* Strengths & needs work */}
        <div className="space-y-4">
          <Card>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-600">Top Strengths</p>
            <p className="mb-3 text-xs text-gray-400">Highest scored assessed skills only — unassessed skills are not included.</p>
            <div className="space-y-2">
              {strengths.map((sh) => (
                <div key={sh.skillId} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{sh.skillName}</span>
                  <span className="text-sm font-bold text-emerald-600">{sh.latestScore}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-amber-600">Improvement Areas</p>
            <p className="mb-3 text-xs text-gray-400">Lowest scored assessed skills — not a measure of overall ability.</p>
            <div className="space-y-2">
              {needsWork.map((sh) => (
                <div key={sh.skillId} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{sh.skillName}</span>
                  <span className="text-sm font-bold text-amber-600">{sh.latestScore}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// D. Physical Measurement History
// ---------------------------------------------------------------------------

interface PhysField {
  key: keyof PhysicalMeasurement
  label: string
  unit: string
  lowerIsBetter: boolean
}

const PHYS_FIELDS: PhysField[] = [
  { key: 'height_cm',              label: 'Height',    unit: 'cm', lowerIsBetter: false },
  { key: 'weight_kg',              label: 'Weight',    unit: 'kg', lowerIsBetter: false },
  { key: 'body_fat_percentage',    label: 'Body Fat',  unit: '%',  lowerIsBetter: false },
  { key: 'sprint_time_seconds',    label: '10m Sprint', unit: 's', lowerIsBetter: true  },
]

function PhysicalSection({ measurements }: { measurements: PhysicalMeasurement[] }) {
  if (measurements.length === 0) {
    return (
      <section>
        <SectionTitle>Physical Measurements</SectionTitle>
        <EmptyState icon="📏" title="No measurements recorded" description="Physical measurements appear here once recorded." />
      </section>
    )
  }

  // measurements is chronological (earliest first) from the timeline endpoint
  const latest = measurements[measurements.length - 1]
  const first = measurements[0]

  return (
    <section>
      <SectionTitle>Physical Measurements</SectionTitle>
      <Card>
        {/* Latest snapshot */}
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
          Latest · {fmtDate(latest.measurement_date)}
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
          {PHYS_FIELDS.map(({ key, label, unit, lowerIsBetter }) => {
            const currVal = latest[key] as string | null
            if (currVal === null) return null
            const firstVal = measurements.length >= 2 ? (first[key] as string | null) : null
            // Only show delta when both values are non-null and differ
            let delta: number | null = null
            if (firstVal !== null) {
              const d = parseFloat(currVal) - parseFloat(firstVal)
              if (Math.abs(d) >= 0.01) delta = d
            }
            return (
              <div key={key} className="rounded-xl bg-gray-50 p-4 text-center">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{parseFloat(currVal).toFixed(1)}</p>
                <p className="text-xs text-gray-400">{unit}</p>
                {delta !== null && (
                  <p className="mt-1 text-xs font-semibold text-gray-500">
                    {delta > 0 ? '+' : ''}{delta.toFixed(1)} since first
                    {lowerIsBetter && delta < 0 && <span className="text-emerald-600"> &darr;</span>}
                    {!lowerIsBetter && delta > 0 && <span className="text-emerald-600"> &uarr;</span>}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {/* Full history table if ≥2 records */}
        {measurements.length >= 2 && (
          <>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">History</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-2 text-left text-xs font-semibold text-gray-400">Date</th>
                    {PHYS_FIELDS.map(({ key, label }) => (
                      <th key={key} className="pb-2 px-3 text-right text-xs font-semibold text-gray-400">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...measurements].reverse().map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 text-xs text-gray-500 whitespace-nowrap">{fmtDate(m.measurement_date)}</td>
                      {PHYS_FIELDS.map(({ key, unit }) => {
                        const val = m[key] as string | null
                        return (
                          <td key={key} className="py-2 px-3 text-right text-sm text-gray-700 whitespace-nowrap">
                            {val ? `${parseFloat(val).toFixed(1)} ${unit}` : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="mt-3 text-xs text-gray-400">
          Numerical changes are shown for context only. &#916; is shown only when &#8805;2 records exist for that metric. Height/weight changes are not automatically positive or negative.
        </p>
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// E. Match Performance
// ---------------------------------------------------------------------------

function MatchSection({
  summary,
  matches,
}: {
  summary: MatchSummary | null
  matches: PlayerMatchStats[]
}) {
  if (!summary || summary.matches_played === 0) {
    return (
      <section>
        <SectionTitle>Match Performance</SectionTitle>
        <EmptyState icon="⚽" title="No matches recorded" />
      </section>
    )
  }

  // Pass accuracy: aggregate from individual match records to have total attempts
  const totalAttempted = matches.reduce((acc, m) => acc + m.passes_attempted, 0)
  const totalCompleted = matches.reduce((acc, m) => acc + m.passes_completed, 0)
  const accuracy = passAccuracy(totalCompleted, totalAttempted)

  const stats: { label: string; value: string }[] = [
    { label: 'Matches',      value: String(summary.matches_played) },
    { label: 'Starts',       value: String(summary.starts) },
    { label: 'Minutes',      value: String(summary.total_minutes) },
    { label: 'Goals',        value: String(summary.goals) },
    { label: 'Assists',      value: String(summary.assists) },
    { label: 'Shots',        value: String(summary.total_shots) },
    { label: 'Pass Acc.',    value: accuracy !== null ? `${accuracy}%` : '—' },
    { label: 'Avg Rating',   value: summary.average_rating ? parseFloat(summary.average_rating).toFixed(1) : '—' },
    { label: 'Yellow',       value: String(summary.yellow_cards) },
    { label: 'Red',          value: String(summary.red_cards) },
  ]

  return (
    <section>
      <SectionTitle>Match Performance</SectionTitle>
      <Card>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 mb-6">
          {stats.map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="mt-0.5 text-xs text-gray-400">{label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Pass accuracy = completed ÷ attempted across all matches with recorded stats. "—" means no attempts recorded.
          Average rating is only shown when the coach has entered a rating.
        </p>
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// F. Training Attendance
// ---------------------------------------------------------------------------

function TrainingSection({ sessions }: { sessions: TrainingSessionSummary[] }) {
  if (sessions.length === 0) {
    return (
      <section>
        <SectionTitle>Training Attendance</SectionTitle>
        <EmptyState icon="🏃" title="No training sessions recorded" description="Only sessions with an attendance record are shown." />
      </section>
    )
  }

  // Attendance rate uses sessions with an attendance record as the denominator.
  // Sessions without a record cannot be classified as absences and are not counted.
  const withRecord = sessions.filter((s) => s.attendance_status !== null)
  const presentCount = withRecord.filter((s) => s.attendance_status === 'PRESENT').length
  const lateCount = withRecord.filter((s) => s.attendance_status === 'LATE').length
  const absentCount = withRecord.filter((s) => s.attendance_status === 'ABSENT').length
  const excusedCount = withRecord.filter((s) => s.attendance_status === 'EXCUSED').length
  // Rate = (PRESENT + LATE) / all sessions with a record
  const attendanceRate = withRecord.length > 0
    ? Math.round(((presentCount + lateCount) / withRecord.length) * 100)
    : null

  const breakdown: { label: string; count: number; color: string }[] = [
    { label: 'Present',  count: presentCount,  color: 'text-emerald-600' },
    { label: 'Late',     count: lateCount,      color: 'text-amber-600'   },
    { label: 'Excused',  count: excusedCount,   color: 'text-brand-500'   },
    { label: 'Absent',   count: absentCount,    color: 'text-red-500'     },
  ]

  return (
    <section>
      <SectionTitle>Training Attendance</SectionTitle>
      <Card>
        <div className="flex flex-wrap items-end gap-8 mb-4">
          <div>
            <p className="text-4xl font-bold text-gray-900">{sessions.length}</p>
            <p className="text-xs text-gray-400">Sessions with attendance record</p>
          </div>
          {attendanceRate !== null && (
            <div>
              <p className="text-4xl font-bold text-emerald-600">{attendanceRate}%</p>
              <p className="text-xs text-gray-400">Attendance rate (present + late)</p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-6">
          {breakdown.map(({ label, count, color }) => (
            <div key={label} className="text-center">
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
              <p className="text-xs text-gray-400">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-gray-400">
          Only sessions with an attendance record are included. Sessions not linked to this player via an attendance record are not counted as absences.
        </p>
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// G. Development Goals
// ---------------------------------------------------------------------------

const GOAL_STATUS_BADGE: Record<DevelopmentGoal['status'], string> = {
  ACTIVE:    'bg-brand-50 text-brand-600 ring-brand-200',
  COMPLETED: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
  CANCELLED: 'bg-gray-100 text-gray-400 ring-gray-200',
}

function GoalCard({ goal }: { goal: DevelopmentGoal }) {
  const current = goal.current_value !== null ? parseFloat(goal.current_value) : null
  const target = goal.target_value !== null ? parseFloat(goal.target_value) : null
  const progress = current !== null && target !== null && target > 0
    ? Math.min(100, Math.round((current / target) * 100))
    : null

  return (
    <div className="rounded-xl border border-gray-100 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-gray-900 truncate">{goal.title}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${GOAL_STATUS_BADGE[goal.status]}`}>
          {goal.status.charAt(0) + goal.status.slice(1).toLowerCase()}
        </span>
      </div>
      {goal.skill_name && (
        <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
          {goal.skill_name}
        </span>
      )}
      {goal.description && (
        <p className="mt-2 text-sm text-gray-500 line-clamp-2">{goal.description}</p>
      )}
      {progress !== null && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{goal.current_value} / {goal.target_value}</span>
            <span className="font-semibold text-brand-600">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100">
            <div className="h-2 rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
        <span>Started: {fmtDate(goal.start_date)}</span>
        {goal.target_date && <span>Target: {fmtDate(goal.target_date)}</span>}
        {goal.completed_at && <span>Completed: {fmtDate(goal.completed_at)}</span>}
      </div>
    </div>
  )
}

function GoalsSection({ goals }: { goals: DevelopmentGoal[] }) {
  if (goals.length === 0) {
    return (
      <section>
        <SectionTitle>Development Goals</SectionTitle>
        <EmptyState icon="🎯" title="No goals set" description="Goals appear here once set by a coach." />
      </section>
    )
  }

  const active    = goals.filter((g) => g.status === 'ACTIVE')
  const completed = goals.filter((g) => g.status === 'COMPLETED')
  const cancelled = goals.filter((g) => g.status === 'CANCELLED')

  return (
    <section>
      <SectionTitle>Development Goals</SectionTitle>
      <Card>
        <div className="flex gap-4 mb-6 text-sm">
          <span className="text-brand-600 font-medium">{active.length} Active</span>
          <span className="text-emerald-600 font-medium">{completed.length} Completed</span>
          {cancelled.length > 0 && <span className="text-gray-400">{cancelled.length} Cancelled</span>}
        </div>
        {active.length > 0 && (
          <div className="mb-6">
            <p className="mb-3 text-xs font-semibold text-brand-600 uppercase tracking-widest">Active</p>
            <div className="space-y-3">{active.map((g) => <GoalCard key={g.id} goal={g} />)}</div>
          </div>
        )}
        {completed.length > 0 && (
          <div className="mb-6">
            <p className="mb-3 text-xs font-semibold text-emerald-600 uppercase tracking-widest">Completed</p>
            <div className="space-y-3">{completed.map((g) => <GoalCard key={g.id} goal={g} />)}</div>
          </div>
        )}
        {cancelled.length > 0 && (
          <div>
            <p className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">Cancelled</p>
            <div className="space-y-3">{cancelled.map((g) => <GoalCard key={g.id} goal={g} />)}</div>
          </div>
        )}
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// H. Recorded Coach Feedback
// ---------------------------------------------------------------------------

interface FeedbackEntry {
  id: string
  source: 'Assessment' | 'Match'
  date: string
  author: string
  comment: string
}

function buildFeedback(
  assessments: Assessment[],
  matches: PlayerMatchStats[],
): FeedbackEntry[] {
  const entries: FeedbackEntry[] = []

  for (const a of assessments) {
    if (a.overall_comment.trim().length > 0) {
      entries.push({
        id: `a-${a.id}`,
        source: 'Assessment',
        date: a.assessment_date,
        author: a.coach_name ?? 'Coach',
        comment: a.overall_comment.trim(),
      })
    }
  }

  for (const m of matches) {
    if (m.coach_comment.trim().length > 0) {
      entries.push({
        id: `m-${m.id}`,
        source: 'Match',
        date: m.match_date,
        author: 'Coach',
        comment: m.coach_comment.trim(),
      })
    }
  }

  // Sort chronologically newest first
  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return entries
}

function FeedbackSection({
  assessments,
  matches,
}: {
  assessments: Assessment[]
  matches: PlayerMatchStats[]
}) {
  const entries = buildFeedback(assessments, matches)

  if (entries.length === 0) {
    return (
      <section>
        <SectionTitle>Recorded Feedback</SectionTitle>
        <EmptyState icon="💬" title="No feedback recorded" description="Coach comments from assessments and matches appear here." />
      </section>
    )
  }

  return (
    <section>
      <SectionTitle>Recorded Feedback</SectionTitle>
      <Card>
        <p className="mb-4 text-xs text-gray-400">
          These are verbatim recorded comments by coaches. They are not AI-generated conclusions.
        </p>
        <div className="space-y-4">
          {entries.map((e) => (
            <div key={e.id} className="border-l-2 border-brand-200 pl-4">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-brand-600 uppercase tracking-wide">{e.source}</span>
                <span className="text-xs text-gray-400">{fmtDate(e.date)}</span>
                {e.author && <span className="text-xs text-gray-400">· {e.author}</span>}
              </div>
              <p className="text-sm text-gray-700 italic">"{e.comment}"</p>
            </div>
          ))}
        </div>
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PlayerReportPage() {
  const { playerId } = useParams<{ playerId: string }>()
  if (!playerId) {
    return <div className="p-8 text-center text-gray-400">No player ID provided.</div>
  }
  return <PlayerReportContent playerId={playerId} />
}

function PlayerReportContent({ playerId }: { playerId: string }) {
  const {
    loading,
    error,
    player,
    history,
    timeline,
    matchHistory,
    matchSummary,
    trainingHistory,
  } = usePlayerProfile(playerId)

  if (loading) {
    return (
      <>
        <AppNav label="Development Report" />
        <LoadingSpinner />
      </>
    )
  }

  if (error || !player) {
    // Distinguish 403 from other errors
    const is403 = error?.includes('403') || error?.includes('Forbidden') || error?.includes('permission') || error?.includes('authorized')
    return (
      <>
        <AppNav label="Development Report" />
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <EmptyState
            icon={is403 ? '🔒' : '⚠️'}
            title={is403 ? 'Access denied' : 'Could not load report'}
            description={
              is403
                ? 'You are not authorized to view this player\'s report.'
                : (error ?? 'Player not found.')
            }
          />
        </div>
      </>
    )
  }

  const assessments = timeline?.assessments ?? []
  const goals       = timeline?.goals ?? []
  const measurements = timeline?.measurements ?? []
  const matches     = matchHistory?.matches ?? []
  const sessions    = trainingHistory?.sessions ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label="Development Report" />
      <ReportHeader player={player} history={history} />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">
        <CategorySection assessments={assessments} />
        <SkillProgressionSection assessments={assessments} />
        <PhysicalSection measurements={measurements} />
        <MatchSection summary={matchSummary} matches={matches} />
        <TrainingSection sessions={sessions} />
        <GoalsSection goals={goals} />
        <FeedbackSection assessments={assessments} matches={matches} />
      </main>
    </div>
  )
}
