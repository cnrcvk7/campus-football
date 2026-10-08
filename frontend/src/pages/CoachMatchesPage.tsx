import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppNav from '../components/ui/AppNav'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { matchService } from '../services/matchService'
import type { Match } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RESULT_BADGE: Record<string, string> = {
  WIN: 'bg-green-100 text-green-700',
  DRAW: 'bg-yellow-100 text-yellow-700',
  LOSS: 'bg-red-100 text-red-700',
}

// ---------------------------------------------------------------------------
// Match card
// ---------------------------------------------------------------------------

function MatchCard({ match }: { match: Match }) {
  const navigate = useNavigate()
  const date = new Date(match.match_date)

  return (
    <button
      onClick={() => navigate(`/coach/matches/${match.id}`)}
      className="group w-full rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-gray-100 transition hover:shadow-md hover:ring-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
    >
      <div className="flex items-start gap-4">
        {/* Date block */}
        <div className="flex-shrink-0 w-14 rounded-xl bg-brand-50 px-1 py-2 text-center">
          <p className="text-xs font-medium text-brand-500 uppercase">
            {date.toLocaleDateString('en-GB', { month: 'short' })}
          </p>
          <p className="text-2xl font-bold leading-none text-brand-700">{date.getDate()}</p>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-900">vs {match.opponent_name}</p>
            {match.result && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${RESULT_BADGE[match.result] ?? 'bg-gray-100 text-gray-600'}`}>
                {match.result}
              </span>
            )}
            {match.score_display && (
              <span className="font-mono text-sm font-bold text-gray-700">{match.score_display}</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-400">
            {match.team_name}
            {match.competition && <> · {match.competition}</>}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${match.home_away === 'HOME' ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-gray-500'}`}>
              {match.home_away}
            </span>
            {match.venue && (
              <span className="text-xs text-gray-400">{match.venue}</span>
            )}
          </div>
        </div>

        <span className="mt-1 flex-shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-brand-400">
          →
        </span>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachMatchesPage() {
  const [matches, setMatches] = useState<Match[]>([])
  const [total, setTotal] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrev, setHasPrev] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    matchService
      .listMatches({ page })
      .then((data) => {
        setMatches(data.results)
        setTotal(data.count)
        setHasNext(data.next !== null)
        setHasPrev(data.previous !== null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load matches.')
        setLoading(false)
      })
  }, [page])

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav label="Matches" />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Matches</h1>
          <p className="mt-1 text-sm text-gray-400">
            All match records — click a card to view player statistics.
          </p>
        </div>

        {loading && matches.length === 0 && <LoadingSpinner />}

        {!loading && error && (
          <EmptyState icon="⚠️" title="Could not load matches" description={error} />
        )}

        {(!loading || matches.length > 0) && !error && (
          <>
            <div className="mb-4 text-sm text-gray-400">
              {loading ? (
                <span className="text-gray-300">Loading…</span>
              ) : (
                <>
                  <span className="font-semibold text-gray-700">{total}</span>{' '}
                  {total === 1 ? 'match' : 'matches'}
                </>
              )}
            </div>

            {matches.length === 0 && !loading ? (
              <EmptyState
                icon="⚽"
                title="No matches recorded yet"
                description="Match records will appear here once created."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {matches.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            )}

            {(hasNext || hasPrev) && (
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!hasPrev || loading}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Previous
                </button>
                <p className="text-sm text-gray-400">
                  Page <span className="font-semibold text-gray-700">{page}</span>
                  {' '}of{' '}
                  <span className="font-semibold text-gray-700">{Math.ceil(total / 20)}</span>
                </p>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasNext || loading}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
