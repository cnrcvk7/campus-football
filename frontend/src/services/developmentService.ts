import { api } from './api'
import type { PaginatedResponse, Skill } from '../types'

export const developmentService = {
  listSkills: (): Promise<PaginatedResponse<Skill>> =>
    api.get<PaginatedResponse<Skill>>('/development/skills/?page_size=100'),
}
