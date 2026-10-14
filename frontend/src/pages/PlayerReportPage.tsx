// frontend/src/pages/PlayerReportPage.tsx
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AppNav from '../components/ui/AppNav'
import { toDisplayLocale } from '../utils/localeDateFormatter'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { usePlayerProfile } from '../hooks/usePlayerProfile'
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

function fmtDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
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

const CATEGORY_META: Record<SkillCategory, { color: string; bar: string; bg: string }> = {
  TECHNICAL: { color: 'text-brand-600',   bar: 'bg-brand-500',   bg: 'bg-brand-50'   },
  TACTICAL:  { color: 'text-violet-600',  bar: 'bg-violet-500',  bg: 'bg-violet-50'  },
  PHYSICAL:  { color: 'text-emerald-600', bar: 'bg-emerald-500', bg: 'bg-emerald-50' },
  MENTAL:    { color: 'text-amber-600',   bar: 'bg-amber-500',   bg: 'bg-amber-50'   },
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

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

function passAccuracy(completed: number, attempted: number): number | null {
  if (attempted <= 0) return null
  return Math.round((completed / attempted) * 100)
}

// ---------------------------------------------------------------------------
// A. Report Header
// ---------------------------------------------------------------------------

function ReportHeader({ player, history }: { player: Player; history: PlayerHistory | null }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const age = calcAge(player.date_of_birth)
  const position = player.preferred_position ? t('positions.' + player.preferred_position) : null
  const activeAcademy = history ? getActiveAcademy(history) : null
  const activeTeam = history ? getActiveTeam(history) : null

  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-brand-900 text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-400">
              {t('playerReport.title')}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              {player.first_name} {player.last_name}
            </h1>
            <p className="mt-1 font-mono text-sm text-gray-400">{player.football_id}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-gray-300">
              {age > 0 && <span>{t('players.yearsOld', { count: age })}</span>}
              {position && <span>· {position}</span>}
              {activeTeam && <span>· {activeTeam.team.name}</span>}
              {activeAcademy && <span>· {activeAcademy.academy.name}</span>}
            </div>
          </div>
          <button
            onClick={() => navigate(`/players/${player.id}`)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/20 self-start"
          >
            {t('playerProfile.navLabel')} ←
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
  const { t } = useTranslation()
  if (assessments.length === 0) {
    return (
      <section>
        <SectionTitle>{t('playerReport.sectionDevelopment')}</SectionTitle>
        <EmptyState icon="📊" title={t('playerReport.empty.noAssessments')} description={t('playerReport.empty.noAssessmentsHint')} />
      </section>
    )
  }

  const latest = assessments[assessments.length - 1]
  const first = assessments[0]
  const latestScores = computeCategoryAvg(latest)
  const firstScores = assessments.length >= 2 ? computeCategoryAvg(first) : null
  const categories: SkillCategory[] = ['TECHNICAL', 'TACTICAL', 'PHYSICAL', 'MENTAL']

  return (
    <section>
      <SectionTitle>{t('playerReport.sectionDevelopment')}</SectionTitle>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {categories.map((cat) => {
          const meta = CATEGORY_META[cat]
          const data = latestScores[cat]
          if (!data) return (
            <Card key={cat} className="opacity-50">
              <p className={`text-xs font-semibold uppercase tracking-widest ${meta.color}`}>{t('skillCategories.' + cat)}</p>
              <p className="mt-2 text-sm text-gray-400">{t('common.empty.noData')}</p>
            </Card>
          )
          const prevData = firstScores?.[cat]
          const delta = prevData ? data.score - prevData.score : null

          return (
            <Card key={cat} className="relative overflow-hidden">
              <div className={`absolute inset-0 ${meta.bg} opacity-40 rounded-2xl`} />
              <div className="relative">
                <p className={`text-xs font-semibold uppercase tracking-widest ${meta.color}`}>{t('skillCategories.' + cat)}</p>
                <p className="mt-1 text-4xl font-bold text-gray-900">{data.score}</p>
                <p className="text-xs text-gray-400">/ 100 · {t('playerProfile.basedOn', { count: data.count })}</p>
                <div className="mt-3 h-1.5 rounded-full bg-gray-200">
                  <div className={`h-1.5 rounded-full ${meta.bar}`} style={{ width: `${data.score}%` }} />
                </div>
                {delta !== null && (
                  <p className={`mt-2 text-xs font-semibold ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {delta > 0 ? `+${delta}` : delta} {t('playerReport.vsFirstAssessment')}
                  </p>
                )}
              </div>
            </Card>
          )
        })}
      </div>
      {assessments.length < 2 && (
        <p className="mt-3 text-xs text-gray-400">{t('playerReport.noSecondAssessment')}</p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// C. Individual Skill Progression
// ---------------------------------------------------------------------------

function SkillProgressionSection({ assessments }: { assessments: Assessment[] }) {
  const { t } = useTranslation()
  if (assessments.length === 0) {
    return (
      <section>
        <SectionTitle>{t('playerReport.sectionSkillProgression')}</SectionTitle>
        <EmptyState icon="📈" title={t('playerReport.empty.noSkillData')} description={t('playerReport.empty.noSkillDataHint')} />
      </section>
    )
  }

  const skillHistories = buildSkillHistory(assessments)
  if (skillHistories.length === 0) {
    return (
      <section>
        <SectionTitle>{t('playerReport.sectionSkillProgression')}</SectionTitle>
        <EmptyState icon="📈" title={t('playerReport.empty.noSkillsAssessed')} />
      </section>
    )
  }

  const withLatest = skillHistories.map((sh) => ({
    ...sh,
    latestScore: sh.entries[sh.entries.length - 1].score,
    delta: sh.entries.length >= 2
      ? sh.entries[sh.entries.length - 1].score - sh.entries[0].score
      : null,
  }))

  const sorted = [...withLatest].sort((a, b) => {
    if (b.latestScore !== a.latestScore) return b.latestScore - a.latestScore
    return a.skillName.localeCompare(b.skillName)
  })

  const strengths = sorted.slice(0, 3)
  const needsWork = [...sorted].reverse().slice(0, 3)

  return (
    <section>
      <SectionTitle>{t('playerReport.sectionSkillProgression')}</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        {/* All skills */}
        <Card>
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">{t('playerReport.sectionAllSkills')}</p>
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
            {t('playerReport.scoreNote')}
          </p>
        </Card>

        {/* Strengths & needs work */}
        <div className="space-y-4">
          <Card>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-600">{t('playerReport.sectionStrengths')}</p>
            <p className="mb-3 text-xs text-gray-400">{t('playerReport.strengthsNote')}</p>
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
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-amber-600">{t('playerReport.sectionImprovements')}</p>
            <p className="mb-3 text-xs text-gray-400">{t('playerReport.improvementsNote')}</p>
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
  labelKey: string
  unit: string
  lowerIsBetter: boolean
}

const PHYS_FIELDS_DEF: PhysField[] = [
  { key: 'height_cm',              labelKey: 'playerReport.height',    unit: 'cm', lowerIsBetter: false },
  { key: 'weight_kg',              labelKey: 'playerReport.weight',    unit: 'kg', lowerIsBetter: false },
  { key: 'body_fat_percentage',    labelKey: 'playerReport.bodyFat',   unit: '%',  lowerIsBetter: false },
  { key: 'sprint_time_seconds',    labelKey: 'playerReport.sprint10m', unit: 's',  lowerIsBetter: true  },
]

function PhysicalSection({ measurements }: { measurements: PhysicalMeasurement[] }) {
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)
  if (measurements.length === 0) {
    return (
      <section>
        <SectionTitle>{t('playerReport.sectionMeasurements')}</SectionTitle>
        <EmptyState icon="📏" title={t('playerReport.empty.noMeasurements')} description={t('playerReport.empty.noMeasurementsHint')} />
      </section>
    )
  }

  const latest = measurements[measurements.length - 1]
  const first = measurements[0]

  return (
    <section>
      <SectionTitle>{t('playerReport.sectionMeasurements')}</SectionTitle>
      <Card>
        {/* Latest snapshot */}
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
          {t('playerReport.latestPrefix')} {fmtDate(latest.measurement_date, displayLocale)}
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
          {PHYS_FIELDS_DEF.map(({ key, labelKey, unit, lowerIsBetter }) => {
            const currVal = latest[key] as string | null
            if (currVal === null) return null
            const firstVal = measurements.length >= 2 ? (first[key] as string | null) : null
            let delta: number | null = null
            if (firstVal !== null) {
              const d = parseFloat(currVal) - parseFloat(firstVal)
              if (Math.abs(d) >= 0.01) delta = d
            }
            return (
              <div key={key} className="rounded-xl bg-gray-50 p-4 text-center">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{t(labelKey)}</p>
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">{t('playerReport.measurementHistory')}</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-2 text-left text-xs font-semibold text-gray-400">{t('playerReport.tableDate')}</th>
                    {PHYS_FIELDS_DEF.map(({ key, labelKey }) => (
                      <th key={key} className="pb-2 px-3 text-right text-xs font-semibold text-gray-400">{t(labelKey)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...measurements].reverse().map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 text-xs text-gray-500 whitespace-nowrap">{fmtDate(m.measurement_date, displayLocale)}</td>
                      {PHYS_FIELDS_DEF.map(({ key, unit }) => {
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
          {t('playerReport.measurementNote')}
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
  const { t } = useTranslation()
  if (!summary || summary.matches_played === 0) {
    return (
      <section>
        <SectionTitle>{t('playerReport.sectionMatchPerformance')}</SectionTitle>
        <EmptyState icon="⚽" title={t('playerReport.empty.noMatches')} />
      </section>
    )
  }

  const totalAttempted = matches.reduce((acc, m) => acc + m.passes_attempted, 0)
  const totalCompleted = matches.reduce((acc, m) => acc + m.passes_completed, 0)
  const accuracy = passAccuracy(totalCompleted, totalAttempted)

  const stats: { label: string; value: string }[] = [
    { label: t('playerReport.matches'),    value: String(summary.matches_played) },
    { label: t('playerReport.starts'),     value: String(summary.starts) },
    { label: t('playerReport.minutes'),    value: String(summary.total_minutes) },
    { label: t('playerReport.goals'),      value: String(summary.goals) },
    { label: t('playerReport.assists'),    value: String(summary.assists) },
    { label: t('playerReport.shots'),      value: String(summary.total_shots) },
    { label: t('playerReport.passAcc'),    value: accuracy !== null ? `${accuracy}%` : '—' },
    { label: t('playerReport.avgRating'),  value: summary.average_rating ? parseFloat(summary.average_rating).toFixed(1) : '—' },
    { label: t('playerReport.yellow'),     value: String(summary.yellow_cards) },
    { label: t('playerReport.red'),        value: String(summary.red_cards) },
  ]

  return (
    <section>
      <SectionTitle>{t('playerReport.sectionMatchPerformance')}</SectionTitle>
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
          {t('playerReport.passNote')}
        </p>
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// F. Training Attendance
// ---------------------------------------------------------------------------

function TrainingSection({ sessions }: { sessions: TrainingSessionSummary[] }) {
  const { t } = useTranslation()
  if (sessions.length === 0) {
    return (
      <section>
        <SectionTitle>{t('playerReport.sectionTraining')}</SectionTitle>
        <EmptyState icon="🏃" title={t('playerReport.empty.noTraining')} description={t('playerReport.trainingNote')} />
      </section>
    )
  }

  const withRecord = sessions.filter((s) => s.attendance_status !== null)
  const presentCount = withRecord.filter((s) => s.attendance_status === 'PRESENT').length
  const lateCount = withRecord.filter((s) => s.attendance_status === 'LATE').length
  const absentCount = withRecord.filter((s) => s.attendance_status === 'ABSENT').length
  const excusedCount = withRecord.filter((s) => s.attendance_status === 'EXCUSED').length
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
      <SectionTitle>{t('playerReport.sectionTraining')}</SectionTitle>
      <Card>
        <div className="flex flex-wrap items-end gap-8 mb-4">
          <div>
            <p className="text-4xl font-bold text-gray-900">{sessions.length}</p>
            <p className="text-xs text-gray-400">{t('playerReport.sessionsWithRecord')}</p>
          </div>
          {attendanceRate !== null && (
            <div>
              <p className="text-4xl font-bold text-emerald-600">{attendanceRate}%</p>
              <p className="text-xs text-gray-400">{t('playerReport.attendanceRate')}</p>
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
          {t('playerReport.attendanceNote')}
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
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)
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
        <span>{t('playerReport.started')} {fmtDate(goal.start_date, displayLocale)}</span>
        {goal.target_date && <span>{t('playerProfile.target')} {fmtDate(goal.target_date, displayLocale)}</span>}
        {goal.completed_at && <span>{t('playerReport.completedOn')} {fmtDate(goal.completed_at, displayLocale)}</span>}
      </div>
    </div>
  )
}

function GoalsSection({ goals }: { goals: DevelopmentGoal[] }) {
  const { t } = useTranslation()
  if (goals.length === 0) {
    return (
      <section>
        <SectionTitle>{t('playerReport.sectionGoals')}</SectionTitle>
        <EmptyState icon="🎯" title={t('playerReport.empty.noGoals')} description={t('playerReport.empty.noGoalsHint')} />
      </section>
    )
  }

  const active    = goals.filter((g) => g.status === 'ACTIVE')
  const completed = goals.filter((g) => g.status === 'COMPLETED')
  const cancelled = goals.filter((g) => g.status === 'CANCELLED')

  return (
    <section>
      <SectionTitle>{t('playerReport.sectionGoals')}</SectionTitle>
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
  source: string
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
  const { t, i18n } = useTranslation()
  const displayLocale = toDisplayLocale(i18n.language)
  const entries = buildFeedback(assessments, matches)

  if (entries.length === 0) {
    return (
      <section>
        <SectionTitle>{t('playerReport.sectionFeedback')}</SectionTitle>
        <EmptyState icon="💬" title={t('playerReport.empty.noFeedback')} description={t('playerReport.empty.noFeedbackHint')} />
      </section>
    )
  }

  return (
    <section>
      <SectionTitle>{t('playerReport.sectionFeedback')}</SectionTitle>
      <Card>
        <p className="mb-4 text-xs text-gray-400">
          {t('playerReport.feedbackNote')}
        </p>
        <div className="space-y-4">
          {entries.map((e) => (
            <div key={e.id} className="border-l-2 border-brand-200 pl-4">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-brand-600 uppercase tracking-wide">{e.source}</span>
                <span className="text-xs text-gray-400">{fmtDate(e.date, displayLocale)}</span>
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
  const { t } = useTranslation()
  if (!playerId) {
    return <div className="p-8 text-center text-gray-400">{t('players.error.noId')}</div>
  }
  return <PlayerReportContent playerId={playerId} />
}

function PlayerReportContent({ playerId }: { playerId: string }) {
  const { t } = useTranslation()
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
        <AppNav label={t('playerReport.navLabel')} />
        <LoadingSpinner />
      </>
    )
  }

  if (error || !player) {
    const is403 = error?.includes('403') || error?.includes('Forbidden') || error?.includes('permission') || error?.includes('authorized')
    return (
      <>
        <AppNav label={t('playerReport.navLabel')} />
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <EmptyState
            icon={is403 ? '🔒' : '⚠️'}
            title={is403 ? t('playerReport.accessDeniedTitle') : t('players.error.loadPlayerFailed')}
            description={
              is403
                ? t('playerReport.accessDeniedDesc')
                : (error ?? t('players.error.notFound'))
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
      <AppNav label={t('playerReport.navLabel')} />
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
