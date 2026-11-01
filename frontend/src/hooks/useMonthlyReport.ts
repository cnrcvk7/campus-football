import { useEffect, useState } from 'react'
import { api } from '../services/api'
import type {
  DevelopmentTimeline,
  MatchHistory,
  MonthlyReportSummary,
  TrainingHistory,
} from '../types'

interface MonthlyReportState {
  loading: boolean
  error: string | null
  monthlyTimeline: DevelopmentTimeline | null
  monthlyMatches: MatchHistory | null
  monthlyTraining: TrainingHistory | null
  monthlySummary: MonthlyReportSummary | null
}

const INITIAL_STATE: MonthlyReportState = {
  loading: true,
  error: null,
  monthlyTimeline: null,
  monthlyMatches: null,
  monthlyTraining: null,
  monthlySummary: null,
}

export function useMonthlyReport(
  playerId: string,
  year: number,
  month: number,
): MonthlyReportState {
  const [state, setState] = useState<MonthlyReportState>(INITIAL_STATE)

  useEffect(() => {
    // Ignore responses for a month the user has already navigated away from.
    let cancelled = false
    setState(INITIAL_STATE)

    const qs = `year=${year}&month=${month}`

    Promise.all([
      api.get<DevelopmentTimeline>(`/players/${playerId}/development/timeline/?${qs}`),
      api.get<MatchHistory>(`/players/${playerId}/matches/?${qs}`),
      api.get<TrainingHistory>(`/players/${playerId}/training/history/?${qs}`),
      api.get<MonthlyReportSummary>(`/players/${playerId}/report/monthly/?${qs}`),
    ])
      .then(([monthlyTimeline, monthlyMatches, monthlyTraining, monthlySummary]) => {
        if (cancelled) return
        setState({
          loading: false,
          error: null,
          monthlyTimeline,
          monthlyMatches,
          monthlyTraining,
          monthlySummary,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          ...INITIAL_STATE,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load monthly report data.',
        })
      })

    return () => {
      cancelled = true
    }
  }, [playerId, year, month])

  return state
}
