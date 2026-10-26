// Announcement types matching the backend serializers exactly.

export interface Announcement {
  id: string
  academy: string
  team: string | null
  related_match: string | null
  related_session: string | null
  author: string | null
  author_name: string | null
  title: string
  body: string
  is_pinned: boolean
  edited_at: string | null
  created_at: string
  is_read: boolean
  is_acknowledged: boolean
}

export interface AnnouncementCreate {
  academy: string
  team?: string | null
  related_match?: string | null
  related_session?: string | null
  title: string
  body: string
  is_pinned?: boolean
}

export interface AnnouncementUpdate {
  title?: string
  body?: string
}

export interface ReceiptUser {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
  acknowledged_at: string | null
  read_at: string | null
}

export interface ReceiptGroup {
  total: number
  acknowledged: number
  details: ReceiptUser[]
}

export interface ReceiptsResponse {
  players: ReceiptGroup
  parents: ReceiptGroup
}

export interface UnreadCountResponse {
  unread_count: number
}
