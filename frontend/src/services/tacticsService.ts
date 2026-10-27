import { api } from './api'
import type {
  LineupRead, LineupSummary, LineupWrite,
  TacticBoardRead, TacticBoardWrite, PaginatedBoardResponse,
} from '../types/tactics'

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

  // ── TacticBoard (free-form boards) ──

  listBoards: (params?: { page?: number }): Promise<PaginatedBoardResponse> => {
    const qs = new URLSearchParams()
    if (params?.page && params.page > 1) qs.set('page', String(params.page))
    const q = qs.toString()
    return api.get<PaginatedBoardResponse>(q ? `/tactics/boards/?${q}` : '/tactics/boards/')
  },

  getBoard: (id: string): Promise<TacticBoardRead> =>
    api.get<TacticBoardRead>(`/tactics/boards/${id}/`),

  createBoard: (data: TacticBoardWrite): Promise<TacticBoardRead> =>
    api.post<TacticBoardRead>('/tactics/boards/', data),

  updateBoard: (id: string, data: Partial<TacticBoardWrite>): Promise<TacticBoardRead> =>
    api.patch<TacticBoardRead>(`/tactics/boards/${id}/`, data),

  deleteBoard: (id: string): Promise<void> =>
    api.delete(`/tactics/boards/${id}/`),
}
