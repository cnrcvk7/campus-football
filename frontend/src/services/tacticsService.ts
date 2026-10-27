import { api } from './api'
import type { LineupRead, LineupSummary, LineupWrite } from '../types/tactics'

export const tacticsService = {
  getLineup: (matchId: string): Promise<LineupRead> =>
    api.get<LineupRead>(`/matches/${matchId}/lineup/`),

  saveLineup: (matchId: string, data: LineupWrite): Promise<LineupRead> =>
    api.put<LineupRead>(`/matches/${matchId}/lineup/`, data),

  deleteLineup: (matchId: string): Promise<void> =>
    api.delete(`/matches/${matchId}/lineup/`),

  publish: (matchId: string): Promise<{ status: string; published_at: string }> =>
    api.post(`/matches/${matchId}/lineup/publish/`, {}),

  unpublish: (matchId: string): Promise<{ status: string; published_at: null }> =>
    api.post(`/matches/${matchId}/lineup/unpublish/`, {}),

  getLineupSummaries: (matchIds?: string[]): Promise<LineupSummary[]> => {
    const params = new URLSearchParams()
    if (matchIds?.length) params.set('match_ids', matchIds.join(','))
    const qs = params.toString()
    return api.get<LineupSummary[]>(qs ? `/lineups/summary/?${qs}` : '/lineups/summary/')
  },
}
