import { api } from './api'
import type { PaginatedResponse, TrainingAttendance, TrainingSession } from '../types'

export interface TrainingSessionCreate {
  academy: string
  team?: string | null
  title: string
  description?: string
  training_date: string
  start_time?: string | null
  duration_minutes?: number | null
  location?: string
  focus_skills?: string[]
}

export const trainingService = {
  listSessions: (params?: { coach?: 'me'; page?: number }): Promise<PaginatedResponse<TrainingSession>> => {
    const qs = new URLSearchParams()
    if (params?.coach) qs.set('coach', params.coach)
    if (params?.page && params.page > 1) qs.set('page', String(params.page))
    const query = qs.toString()
    return api.get<PaginatedResponse<TrainingSession>>(
      query ? `/training/sessions/?${query}` : '/training/sessions/'
    )
  },

  getSession: (id: string): Promise<TrainingSession> =>
    api.get<TrainingSession>(`/training/sessions/${id}/`),

  createSession: (data: TrainingSessionCreate): Promise<TrainingSession> =>
    api.post<TrainingSession>('/training/sessions/', data),

  listAttendance: (sessionId: string): Promise<TrainingAttendance[]> =>
    api.get<TrainingAttendance[]>(`/training/sessions/${sessionId}/attendance/`),
}
