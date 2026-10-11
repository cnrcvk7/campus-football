import { api } from './api'
import type { Assessment, PaginatedResponse, Skill } from '../types'

export interface AssessmentItemInput {
  skill: string      // UUID
  score: number      // 0-100
  comment: string
}

export interface AssessmentCreate {
  assessment_date: string
  overall_comment: string
  items: AssessmentItemInput[]
}

export const developmentService = {
  listSkills: (): Promise<PaginatedResponse<Skill>> =>
    api.get<PaginatedResponse<Skill>>('/development/skills/?page_size=100'),

  createAssessment: (playerId: string, data: AssessmentCreate): Promise<Assessment> =>
    api.post<Assessment>(`/players/${playerId}/assessments/`, data),
}
