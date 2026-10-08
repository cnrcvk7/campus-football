import { useNavigate, useParams } from 'react-router-dom'
import { usePlayerProfile } from '../hooks/usePlayerProfile'
import AppNav from '../components/ui/AppNav'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { POSITIONS } from '../constants/football'
import type {
  Assessment,
  AssessmentItem,
  AcademyMembership,
  AttendanceStatus,
  DevelopmentGoal,
  MatchSummary,
  PhysicalMeasurement,
  Player,
  PlayerHistory,
  PlayerMatchStats,
  SkillCategory,
  TeamMembership,
  TrainingSessionSummary,
} from '../types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<SkillCategory, { label: string; color: string; bar: string; bg: string }> = {
  TECHNICAL: { label: 'Technical',  color: 'text-brand-600',   bar: 'bg-brand-500',   bg: 'bg-brand-50'   },
  TACTICAL:  { label: 'Tactical',   color: 'text-violet-600',  bar: 'bg-violet-500',  bg: 'bg-violet-50'  },
  PHYSICAL:  { label: 'Physical',   color: 'text-emerald-600', bar: 'bg-emerald-500', bg: 'bg-emerald-50' },
  MENTAL:    { label: 'Mental',     color: 'text-amber-600',   bar: 'bg-amber-500',   bg: 'bg-amber-50'   },
}

const ATTENDANCE_META: Record<AttendanceStatus, { icon: string; color: string }> = {
  PRESENT: { icon: '✓', color: 'text-emerald-600' },
  LATE:    { icon: '⏱', color: 'text-amber-600'   },
  EXCUSED: { icon: '○', color: 'text-brand-500'    },
  ABSENT:  { icon: '✕', color: 'text-red-500'      },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcAge(dob: string): number {
  const diff = Date.now() - new Date(dob).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
}

function computeCategoryScores(
  assessments: Assessment[],
): Partial<Record<SkillCategory, { score: number; count: number }>> {
  if (assessments.length === 0) return {}
  // Timeline returns chronological (earliest first), so last = most recent
  const latest = assessments[assessments.length - 1]
  const acc: Partial<Record<SkillCategory, { sum: number; count: number }>> = {}
  for (const item of latest.items) {
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

function getActiveAcademy(history: PlayerHistory): AcademyMembership | null {
  return history.academy_history.find((m) => m.status === 'active') ?? null
}

function getActiveTeam(history: PlayerHistory): TeamMembership | null {
  return history.team_history.find((m) => m.status === 'active') ?? null
}

function goalProgress(goal: DevelopmentGoal): number | null {
  const current = goal.current_value !== null ? parseFloat(goal.current_value) : null
  const target = goal.target_value !== null ? parseFloat(goal.target_value) : null
  if (current === null || target === null || target === 0) return null
  return Math.min(100, Math.round((current / target) * 100))
}

// ---------------------------------------------------------------------------
// Sub-components
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
// Player Header
// ---------------------------------------------------------------------------

function PlayerHeader({
  player,
  history,
}: {
  player: Player
  history: PlayerHistory | null
}) {
  const navigate = useNavigate()
  const activeAcademy = history ? getActiveAcademy(history) : null
  const activeTeam = history ? getActiveTeam(history) : null
  const age = calcAge(player.date_of_birth)
  const position = player.preferred_position ? POSITIONS[player.preferred_position] : null

  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-brand-900 text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {player.profile_photo_url ? (
              <img
                src={player.profile_photo_url}
                alt={`${player.first_name} ${player.last_name}`}
                className="h-24 w-24 rounded-2xl object-cover ring-4 ring-white/20 sm:h-28 sm:w-28"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-brand-600 text-3xl font-bold ring-4 ring-white/20 sm:h-28 sm:w-28">
                {initials(player.first_name, player.last_name)}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-medium tracking-widest text-brand-400 uppercase">
              {player.football_id}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              {player.first_name} {player.last_name}
            </h1>

            {/* Badges row */}
            <div className="mt-3 flex flex-wrap gap-2">
              {position && (
                <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20">
                  {position}
                </span>
              )}
              {player.jersey_number !== null && (
                <span className="inline-flex items-center rounded-full bg-brand-500/20 px-3 py-1 text-xs font-semibold text-brand-300 ring-1 ring-brand-500/30">
                  #{player.jersey_number}
                </span>
              )}
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20">
                {age} years old
              </span>
            </div>

            {/* Team / Academy */}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-300">
              {activeTeam && (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {activeTeam.team.name}
                  {activeTeam.team.age_group ? ` · ${activeTeam.team.age_group}` : ''}
                </span>
              )}
              {activeAcademy && (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                  {activeAcademy.academy.name}
                </span>
              )}
            </div>

            {/* Edit button */}
            <div className="mt-5">
              <button
                onClick={() => navigate(`/players/${player.id}/edit`)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/20"
              >
                Edit Profile
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Development Overview
// ---------------------------------------------------------------------------

function DevelopmentOverview({ assessments }: { assessments: Assessment[] }) {
  const scores = computeCategoryScores(assessments)
  const categories: SkillCategory[] = ['TECHNICAL', 'TACTICAL', 'PHYSICAL', 'MENTAL']
  const hasData = Object.keys(scores).length > 0

  return (
    <section>
      <SectionTitle>Development Overview</SectionTitle>
      {!hasData ? (
        <EmptyState icon="📊" title="No assessments yet" description="Category scores appear after the first coach assessment." />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {categories.map((cat) => {
            const meta = CATEGORY_META[cat]
            const data = scores[cat]
            if (!data) return null
            return (
              <Card key={cat} className={`relative overflow-hidden border-l-4 border-l-transparent`}>
                <div className={`absolute inset-0 ${meta.bg} opacity-40 rounded-2xl`} />
                <div className="relative">
                  <p className={`text-xs font-semibold uppercase tracking-widest ${meta.color}`}>
                    {meta.label}
                  </p>
                  <p className="mt-1 text-4xl font-bold text-gray-900">{data.score}</p>
                  <p className="text-xs text-gray-400">/ 100</p>
                  <div className="mt-3 h-1.5 rounded-full bg-gray-200">
                    <div
                      className={`h-1.5 rounded-full ${meta.bar} transition-all`}
                      style={{ width: `${data.score}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    Based on {data.count} {data.count === 1 ? 'skill' : 'skills'}
                  </p>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Latest Assessment Detail
// ---------------------------------------------------------------------------

function LatestAssessmentItems({ assessments }: { assessments: Assessment[] }) {
  if (assessments.length === 0) return null
  const latest = assessments[assessments.length - 1]
  if (latest.items.length === 0) return null

  const sorted = [...latest.items].sort((a, b) => b.score - a.score)

  return (
    <section>
      <SectionTitle>Latest Assessment · {fmtDate(latest.assessment_date)}</SectionTitle>
      <Card>
        {latest.overall_comment && (
          <p className="mb-4 text-sm text-gray-600 italic border-l-2 border-brand-400 pl-3">
            "{latest.overall_comment}"
          </p>
        )}
        <div className="space-y-3">
          {sorted.map((item: AssessmentItem) => {
            const meta = CATEGORY_META[item.skill_category]
            return (
              <div key={item.id} className="flex items-center gap-3">
                <span className={`w-20 shrink-0 text-xs font-medium ${meta.color}`}>
                  {item.skill_name}
                </span>
                <div className="flex-1 h-2 rounded-full bg-gray-100">
                  <div
                    className={`h-2 rounded-full ${meta.bar}`}
                    style={{ width: `${item.score}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-sm font-semibold text-gray-700">
                  {item.score}
                </span>
              </div>
            )
          })}
        </div>
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Season Summary
// ---------------------------------------------------------------------------

function SeasonSummary({ summary }: { summary: MatchSummary | null }) {
  if (!summary) return null
  const noMatches = summary.matches_played === 0

  return (
    <section>
      <SectionTitle>Season Summary</SectionTitle>
      <Card>
        {noMatches ? (
          <EmptyState icon="🏆" title="No match data yet" />
        ) : (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            {[
              { label: 'Matches', value: String(summary.matches_played) },
              { label: 'Starts', value: String(summary.starts) },
              { label: 'Minutes', value: String(summary.total_minutes) },
              { label: 'Goals', value: String(summary.goals) },
              { label: 'Assists', value: String(summary.assists) },
              {
                label: 'Avg Rating',
                value: summary.average_rating
                  ? parseFloat(summary.average_rating).toFixed(1)
                  : '—',
              },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="mt-0.5 text-xs text-gray-400">{label}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Training Summary
// ---------------------------------------------------------------------------

function TrainingSummary({ sessions }: { sessions: TrainingSessionSummary[] }) {
  const recent = sessions.slice(0, 6)
  const presentCount = sessions.filter((s) => s.attendance_status === 'PRESENT').length
  const lateCount = sessions.filter((s) => s.attendance_status === 'LATE').length
  const countedAttended = presentCount + lateCount
  const attendanceRate =
    sessions.length > 0 ? Math.round((countedAttended / sessions.length) * 100) : null

  return (
    <section>
      <SectionTitle>Training</SectionTitle>
      <Card>
        {sessions.length === 0 ? (
          <EmptyState icon="🏃" title="No training sessions recorded" />
        ) : (
          <>
            <div className="mb-5 flex items-center gap-6">
              <div>
                <p className="text-3xl font-bold text-gray-900">{sessions.length}</p>
                <p className="text-xs text-gray-400">Sessions</p>
              </div>
              {attendanceRate !== null && (
                <div>
                  <p className="text-3xl font-bold text-emerald-600">{attendanceRate}%</p>
                  <p className="text-xs text-gray-400">Attendance</p>
                </div>
              )}
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Recent sessions
            </p>
            <ul className="space-y-2">
              {recent.map((session) => {
                const meta = session.attendance_status
                  ? ATTENDANCE_META[session.attendance_status]
                  : null
                return (
                  <li key={session.id} className="flex items-start gap-3">
                    <span className={`mt-0.5 w-4 shrink-0 font-semibold ${meta?.color ?? 'text-gray-300'}`}>
                      {meta?.icon ?? '—'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{session.title}</p>
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                        <span className="text-xs text-gray-400">{fmtShortDate(session.training_date)}</span>
                        {session.focus_skills.length > 0 && (
                          <span className="text-xs text-gray-400">
                            · {session.focus_skills.map((s) => s.name).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Development Goals
// ---------------------------------------------------------------------------

function GoalsSection({ goals }: { goals: DevelopmentGoal[] }) {
  const active = goals.filter((g) => g.status === 'ACTIVE')

  return (
    <section>
      <SectionTitle>Current Goals</SectionTitle>
      {active.length === 0 ? (
        <EmptyState icon="🎯" title="No active goals" description="Goals appear here once set by a coach." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {active.map((goal) => {
            const progress = goalProgress(goal)
            return (
              <Card key={goal.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-gray-900">{goal.title}</p>
                  {goal.skill_name && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {goal.skill_name}
                    </span>
                  )}
                </div>
                {goal.description && (
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">{goal.description}</p>
                )}
                {progress !== null ? (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>
                        {goal.current_value} / {goal.target_value}
                      </span>
                      <span className="font-semibold text-brand-600">{progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-brand-500 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                ) : null}
                {goal.target_date && (
                  <p className="mt-3 text-xs text-gray-400">
                    Target: {fmtDate(goal.target_date)}
                  </p>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Match History
// ---------------------------------------------------------------------------

const RESULT_STYLE: Record<string, string> = {
  WIN:  'bg-emerald-50 text-emerald-700 ring-emerald-200',
  DRAW: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
  LOSS: 'bg-red-50 text-red-700 ring-red-200',
}

function MatchHistorySection({ matches }: { matches: PlayerMatchStats[] }) {
  return (
    <section>
      <SectionTitle>Match History</SectionTitle>
      {matches.length === 0 ? (
        <EmptyState icon="⚽" title="No matches recorded" />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['Date', 'Opponent', 'Result', 'H/A', 'Start', 'Min', 'G', 'A', 'Rating'].map(
                    (h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {matches.map((m, i) => (
                  <tr
                    key={m.id}
                    className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {fmtShortDate(m.match_date)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-[10rem] truncate">
                      {m.opponent}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {m.result ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${RESULT_STYLE[m.result]}`}
                        >
                          {m.score_display ?? m.result}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                      {m.home_away}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {m.started ? (
                        <span className="text-emerald-500 font-bold">✓</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{m.minutes_played}'</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">{m.goals}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">{m.assists}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {m.rating ? (
                        <span className="font-semibold text-brand-600">
                          {parseFloat(m.rating).toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Development Timeline
// ---------------------------------------------------------------------------

function DevelopmentTimeline({ assessments }: { assessments: Assessment[] }) {
  if (assessments.length === 0) return null

  return (
    <section>
      <SectionTitle>Assessment History</SectionTitle>
      <Card>
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-100" />
          <ol className="space-y-6">
            {[...assessments].reverse().map((a, idx) => {
              const scores = computeCategoryScores([a])
              const categories: SkillCategory[] = ['TECHNICAL', 'TACTICAL', 'PHYSICAL', 'MENTAL']
              return (
                <li key={a.id} className="relative pl-8">
                  {/* Dot */}
                  <div className={`absolute left-0 top-1 h-4 w-4 rounded-full border-2 border-white shadow ${idx === 0 ? 'bg-brand-500' : 'bg-gray-300'}`} />
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800">
                      {fmtDate(a.assessment_date)}
                    </p>
                    {idx === 0 && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600 ring-1 ring-brand-200">
                        Latest
                      </span>
                    )}
                    {a.coach_name && (
                      <span className="text-xs text-gray-400">by {a.coach_name}</span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {categories.map((cat) => {
                      const data = scores[cat]
                      if (!data) return null
                      const meta = CATEGORY_META[cat]
                      return (
                        <div key={cat} className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${meta.color} w-16 shrink-0`}>
                            {meta.label}
                          </span>
                          <span className="text-sm font-bold text-gray-700">{data.score}</span>
                        </div>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Physical Measurements
// ---------------------------------------------------------------------------

function PhysicalMeasurementsSection({ measurements }: { measurements: PhysicalMeasurement[] }) {
  if (measurements.length === 0) return null
  // Timeline is chronological (earliest first) — most recent is last
  const latest = measurements[measurements.length - 1]
  const previous = measurements.length > 1 ? measurements[measurements.length - 2] : null

  function delta(curr: string | null, prev: string | null): string | null {
    if (!curr || !prev) return null
    const d = parseFloat(curr) - parseFloat(prev)
    if (Math.abs(d) < 0.01) return null
    return d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1)
  }

  const fields: { key: keyof PhysicalMeasurement; label: string; unit: string }[] = [
    { key: 'height_cm', label: 'Height', unit: 'cm' },
    { key: 'weight_kg', label: 'Weight', unit: 'kg' },
    { key: 'body_fat_percentage', label: 'Body Fat', unit: '%' },
    { key: 'sprint_time_seconds', label: '10m Sprint', unit: 's' },
  ]

  const visibleFields = fields.filter((f) => latest[f.key] !== null)
  if (visibleFields.length === 0) return null

  return (
    <section>
      <SectionTitle>Physical Measurements</SectionTitle>
      <Card>
        <p className="mb-4 text-xs text-gray-400">Latest: {fmtDate(latest.measurement_date)}</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {visibleFields.map(({ key, label, unit }) => {
            const currVal = latest[key] as string | null
            const prevVal = previous ? (previous[key] as string | null) : null
            const d = delta(currVal, prevVal)
            return (
              <div key={key} className="rounded-xl bg-gray-50 p-4 text-center">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {currVal ? parseFloat(currVal).toFixed(1) : '—'}
                </p>
                <p className="text-xs text-gray-400">{unit}</p>
                {d && (
                  <p className={`mt-1 text-xs font-semibold ${d.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}`}>
                    {d}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        {latest.notes && (
          <p className="mt-4 text-xs text-gray-400 italic">{latest.notes}</p>
        )}
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Academy / Team History
// ---------------------------------------------------------------------------

function MembershipTimeline({
  academyHistory,
  teamHistory,
}: {
  academyHistory: AcademyMembership[]
  teamHistory: TeamMembership[]
}) {
  return (
    <section>
      <SectionTitle>Academy & Team History</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Academy history */}
        <Card>
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
            Academies
          </p>
          {academyHistory.length === 0 ? (
            <p className="text-sm text-gray-400">No academy history.</p>
          ) : (
            <ol className="space-y-4">
              {academyHistory.map((m: AcademyMembership) => (
                <li key={m.id} className="flex items-start gap-3">
                  <div className="mt-1 flex-shrink-0">
                    <div className={`h-2.5 w-2.5 rounded-full ${m.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{m.academy.name}</p>
                    <p className="text-xs text-gray-400">
                      {fmtDate(m.joined_at)} → {m.left_at ? fmtDate(m.left_at) : 'Present'}
                    </p>
                    {m.academy.city && (
                      <p className="text-xs text-gray-400">{m.academy.city}, {m.academy.country}</p>
                    )}
                  </div>
                  {m.status === 'active' && (
                    <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-emerald-200">
                      Active
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Team history */}
        <Card>
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
            Teams
          </p>
          {teamHistory.length === 0 ? (
            <p className="text-sm text-gray-400">No team history.</p>
          ) : (
            <ol className="space-y-4">
              {teamHistory.map((m: TeamMembership) => (
                <li key={m.id} className="flex items-start gap-3">
                  <div className="mt-1 flex-shrink-0">
                    <div className={`h-2.5 w-2.5 rounded-full ${m.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{m.team.name}</p>
                    {m.team.age_group && (
                      <p className="text-xs text-brand-500">{m.team.age_group}{m.team.season ? ` · ${m.team.season}` : ''}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {fmtDate(m.joined_at)} → {m.left_at ? fmtDate(m.left_at) : 'Present'}
                    </p>
                  </div>
                  {m.status === 'active' && (
                    <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-emerald-200">
                      Active
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PlayerProfilePage() {
  const { playerId } = useParams<{ playerId: string }>()

  if (!playerId) {
    return <div className="p-8 text-center text-gray-400">No player ID provided.</div>
  }

  return <PlayerProfileContent playerId={playerId} />
}

function PlayerProfileContent({ playerId }: { playerId: string }) {
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

  if (loading) return <><AppNav label="Player Profile" /><LoadingSpinner /></>

  if (error || !player) {
    return (
      <>
        <AppNav label="Player Profile" />
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <EmptyState
            icon="⚠️"
            title="Could not load player"
            description={error ?? 'Player not found.'}
          />
        </div>
      </>
    )
  }

  const assessments = timeline?.assessments ?? []
  const goals = timeline?.goals ?? []
  const measurements = timeline?.measurements ?? []
  const matches = matchHistory?.matches ?? []
  const sessions = trainingHistory?.sessions ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label="Player Profile" />
      <PlayerHeader player={player} history={history} />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">
        {/* Development Overview */}
        <DevelopmentOverview assessments={assessments} />

        {/* Season + Training (side by side on desktop) */}
        <div className="grid gap-8 lg:grid-cols-2">
          <SeasonSummary summary={matchSummary} />
          <TrainingSummary sessions={sessions} />
        </div>

        {/* Active Goals */}
        <GoalsSection goals={goals} />

        {/* Match History Table */}
        <MatchHistorySection matches={matches} />

        {/* Latest assessment detail */}
        <LatestAssessmentItems assessments={assessments} />

        {/* Assessment timeline */}
        <DevelopmentTimeline assessments={assessments} />

        {/* Physical Measurements */}
        <PhysicalMeasurementsSection measurements={measurements} />

        {/* Academy / Team History */}
        {history && (
          <MembershipTimeline
            academyHistory={history.academy_history}
            teamHistory={history.team_history}
          />
        )}
      </main>
    </div>
  )
}
