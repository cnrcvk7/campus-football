import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, BarChart2, Users } from 'lucide-react'
import { playerService } from '../services/playerService'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import Button from '../components/ui/Button'
import { cn } from '../lib/utils'
import type { ComparisonCategory, PlayerComparison, SkillCategory } from '../types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<
  SkillCategory,
  { color: string; playerBar: string; teamBar: string; border: string }
> = {
  TECHNICAL: {
    color:     'text-sky-600 dark:text-sky-400',
    playerBar: 'bg-emerald-500',
    teamBar:   'bg-sky-400/60',
    border:    'border-l-sky-500',
  },
  TACTICAL: {
    color:     'text-violet-600 dark:text-violet-400',
    playerBar: 'bg-emerald-500',
    teamBar:   'bg-violet-400/60',
    border:    'border-l-violet-500',
  },
  PHYSICAL: {
    color:     'text-emerald-600 dark:text-emerald-400',
    playerBar: 'bg-emerald-500',
    teamBar:   'bg-emerald-300/60',
    border:    'border-l-emerald-500',
  },
  MENTAL: {
    color:     'text-amber-600 dark:text-amber-400',
    playerBar: 'bg-emerald-500',
    teamBar:   'bg-amber-400/60',
    border:    'border-l-amber-500',
  },
}

// ---------------------------------------------------------------------------
// Layout primitive (mirrors PlayerProfilePage)
// ---------------------------------------------------------------------------

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl p-5 ring-1 bg-cf-surface ring-cf-border', className)}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diff badge
// ---------------------------------------------------------------------------

function DiffBadge({ diff }: { diff: number }) {
  const cls = cn(
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
    diff > 0
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
      : diff < 0
        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
        : 'bg-cf-muted text-cf-muted-foreground',
  )
  const sign = diff > 0 ? '+' : ''
  return <span className={cls}>{sign}{diff}</span>
}

// ---------------------------------------------------------------------------
// Category row
// ---------------------------------------------------------------------------

function CategoryRow({ cat, data }: { cat: SkillCategory; data: ComparisonCategory }) {
  const { t } = useTranslation()
  const meta = CATEGORY_META[cat]

  return (
    <div
      className={cn(
        'rounded-xl p-4 ring-1 bg-cf-surface ring-cf-border border-l-4',
        meta.border,
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-xs font-semibold uppercase tracking-wider', meta.color)}>
          {t('skillCategories.' + cat)}
        </span>
        <DiffBadge diff={data.diff} />
      </div>

      {/* Scores */}
      <div className="mt-3 space-y-2">
        {/* Player bar */}
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs text-cf-muted-foreground">
            {t('playerProfile.comparisonYourScore')}
          </span>
          <div className="h-2 flex-1 rounded-full bg-cf-muted">
            <div
              className={cn('h-2 rounded-full transition-all', meta.playerBar)}
              style={{ width: `${data.player_score}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-sm font-bold text-cf-surface-foreground">
            {data.player_score}
          </span>
        </div>

        {/* Team avg bar */}
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs text-cf-muted-foreground">
            {t('playerProfile.comparisonTeamAvg')}
          </span>
          <div className="h-2 flex-1 rounded-full bg-cf-muted">
            <div
              className={cn('h-2 rounded-full transition-all', meta.teamBar)}
              style={{ width: `${data.team_avg}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-sm font-semibold text-cf-muted-foreground">
            {data.team_avg}
          </span>
        </div>
      </div>

      {/* Peers footnote */}
      <p className="mt-2 text-xs text-cf-muted-foreground">
        {data.peers_with_data} {t('playerProfile.comparisonPeersWithData')}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PlayerComparisonPage() {
  const { playerId } = useParams<{ playerId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PlayerComparison | null>(null)

  useEffect(() => {
    if (!playerId) return
    setLoading(true)
    setError(null)
    playerService
      .getComparison(playerId)
      .then((res) => {
        setData(res)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load comparison data.')
      })
      .finally(() => setLoading(false))
  }, [playerId])

  if (!playerId) {
    return (
      <div className="p-8 text-center text-cf-muted-foreground">
        {t('players.error.noId')}
      </div>
    )
  }

  return (
    <div className="bg-cf-background">
      {/* Page header */}
      <div className="border-b border-cf-border bg-cf-surface">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/players/${playerId}`)}
                className="mb-1 -ml-1"
              >
                ← {t('assessment.backToProfile')}
              </Button>
              <h1 className="text-xl font-semibold text-cf-surface-foreground">
                {t('playerProfile.comparison')}
              </h1>
              {data?.player_name && (
                <p className="mt-0.5 text-sm text-cf-muted-foreground">
                  {data.player_name}
                  {data.team ? (
                    <span>
                      {' '}· {data.team.name}
                      {data.team.age_group ? ` (${data.team.age_group})` : ''}
                    </span>
                  ) : null}
                </p>
              )}
              <p className="mt-0.5 text-xs text-cf-muted-foreground">
                {t('playerProfile.comparisonSubtitle')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {loading && <LoadingSpinner />}

        {!loading && error && (
          <EmptyState
            icon={<AlertTriangle size={28} />}
            title={t('players.error.loadPlayerFailed')}
            description={error}
          />
        )}

        {!loading && !error && data && (
          <>
            {/* No team */}
            {!data.has_team && (
              <EmptyState
                icon={<Users size={28} />}
                title={t('playerProfile.comparisonNoTeam')}
                description={t('playerProfile.comparisonNoTeamHint')}
              />
            )}

            {/* Has team but no assessment */}
            {data.has_team && !data.player_has_assessment && (
              <EmptyState
                icon={<BarChart2 size={28} />}
                title={t('playerProfile.comparisonNoAssessment')}
                description={t('playerProfile.comparisonNoAssessmentHint')}
              />
            )}

            {/* Has team + assessment but no peer data */}
            {data.has_team && data.player_has_assessment && data.categories.length === 0 && (
              <EmptyState
                icon={<Users size={28} />}
                title={t('playerProfile.comparisonNoPeers')}
                description={t('playerProfile.comparisonNoPeersHint')}
              />
            )}

            {/* Happy path */}
            {data.has_team && data.player_has_assessment && data.categories.length > 0 && (
              <>
                {/* Summary row */}
                <Card>
                  <div className="flex flex-wrap items-center gap-6">
                    <div>
                      <p className="text-2xl font-bold text-cf-surface-foreground">
                        {data.peer_count}
                      </p>
                      <p className="text-xs text-cf-muted-foreground">
                        {t('playerProfile.comparisonPeers', { count: data.peer_count })}
                      </p>
                    </div>
                    {data.team && (
                      <div>
                        <p className="text-sm font-semibold text-cf-surface-foreground">
                          {data.team.name}
                        </p>
                        {data.team.age_group && (
                          <p className="text-xs text-cf-muted-foreground">
                            {data.team.age_group}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="ml-auto flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        <span className="text-xs text-cf-muted-foreground">
                          {t('playerProfile.comparisonYourScore')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-full bg-cf-muted-foreground/40" />
                        <span className="text-xs text-cf-muted-foreground">
                          {t('playerProfile.comparisonTeamAvg')}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Category comparison grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {data.categories.map((cat) => (
                    <CategoryRow
                      key={cat.category}
                      cat={cat.category}
                      data={cat}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
