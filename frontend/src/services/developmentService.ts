import { api } from './api'
import type { Assessment, DevelopmentGoal, PhysicalMeasurement, PaginatedResponse, Skill } from '../types'

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

export interface GoalCreate {
  title: string
  description: string
  skill: string | null
  start_date: string
  target_date: string | null
  target_value: string | null
  current_value: string | null
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
}

export type GoalUpdate = Partial<GoalCreate>

export interface MeasurementCreate {
  measurement_date: string
  height_cm: string | null
  weight_kg: string | null
  body_fat_percentage: string | null
  sprint_time_seconds: string | null
  notes: string
}

export const developmentService = {
  listSkills: (): Promise<PaginatedResponse<Skill>> =>
    api.get<PaginatedResponse<Skill>>('/development/skills/?page_size=100'),

  createAssessment: (playerId: string, data: AssessmentCreate): Promise<Assessment> =>
    api.post<Assessment>(`/players/${playerId}/assessments/`, data),

  listGoals: (playerId: string): Promise<PaginatedResponse<DevelopmentGoal>> =>
    api.get<PaginatedResponse<DevelopmentGoal>>(`/players/${playerId}/goals/?page_size=100`),

  getGoal: (playerId: string, goalId: string): Promise<DevelopmentGoal> =>
    api.get<DevelopmentGoal>(`/players/${playerId}/goals/${goalId}/`),

  createGoal: (playerId: string, data: GoalCreate): Promise<DevelopmentGoal> =>
    api.post<DevelopmentGoal>(`/players/${playerId}/goals/`, data),

  updateGoal: (playerId: string, goalId: string, data: GoalUpdate): Promise<DevelopmentGoal> =>
    api.patch<DevelopmentGoal>(`/players/${playerId}/goals/${goalId}/`, data),

  createMeasurement: (playerId: string, data: MeasurementCreate): Promise<PhysicalMeasurement> =>
    api.post<PhysicalMeasurement>(`/players/${playerId}/measurements/`, data),
}
