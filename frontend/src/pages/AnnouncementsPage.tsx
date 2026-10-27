import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Megaphone,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Eye,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useUnreadAnnouncements } from '../context/UnreadAnnouncementsContext'
import { announcementService } from '../services/announcementService'
import { teamService } from '../services/teamService'
import { academyService } from '../services/academyService'
import { mapAnnouncementError, formatProgress, relativeTime } from '../utils/announcementHelpers'
import type {
  Announcement,
  AnnouncementCreate,
  ReceiptsResponse,
} from '../types/announcements'
import type { Team, Academy } from '../types'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Pagination from '../components/ui/Pagination'
import { cn } from '../lib/utils'
import { ApiError } from '../services/api'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20
const TITLE_MAX = 120
const BODY_MAX = 2000

// ---------------------------------------------------------------------------
// AnnouncementsPage
// ---------------------------------------------------------------------------

export default function AnnouncementsPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const { refresh: refreshBadge } = useUnreadAnnouncements()

  const isStaff = user?.role === 'COACH' || user?.role === 'ACADEMY_ADMIN'
  const isAdmin = user?.role === 'ACADEMY_ADMIN'
  const isPlayerOrParent = user?.role === 'PLAYER' || user?.role === 'PARENT'

  // Feed state
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrev, setHasPrev] = useState(false)

  // Team filter
  const [teams, setTeams] = useState<Team[]>([])
  const [teamFilter, setTeamFilter] = useState<string>('')

  // Composer
  const [showComposer, setShowComposer] = useState(false)

  // Load teams for filter
  useEffect(() => {
    teamService.list().then((res) => setTeams(res.results)).catch(() => {})
  }, [])

  // Load feed
  const loadFeed = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: { page?: number; team?: string } = { page }
      if (teamFilter) params.team = teamFilter
      const res = await announcementService.list(params)
      setAnnouncements(res.results)
      setTotalCount(res.count)
      setHasNext(!!res.next)
      setHasPrev(!!res.previous)
    } catch (err) {
      setError(t('announcements.error.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, teamFilter, t])

  useEffect(() => {
    loadFeed()
  }, [loadFeed])

  // Reset page on filter change
  useEffect(() => {
    setPage(1)
  }, [teamFilter])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // Callbacks that update a single announcement in-place
  const updateAnn = (id: string, patch: Partial<Announcement>) => {
    setAnnouncements((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  const removeAnn = (id: string) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id))
    setTotalCount((c) => c - 1)
  }

  // After creating an announcement
  const handleCreated = () => {
    setShowComposer(false)
    setPage(1)
    loadFeed()
    refreshBadge()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <PageHeader
        title={t('announcements.title')}
        subtitle={t('announcements.subtitle')}
        action={
          isStaff ? (
            <Button onClick={() => setShowComposer((v) => !v)}>
              {showComposer ? t('common.cancel') : t('announcements.newButton')}
            </Button>
          ) : undefined
        }
      />

      {/* Composer */}
      {showComposer && isStaff && (
        <Composer
          onCreated={handleCreated}
          onCancel={() => setShowComposer(false)}
        />
      )}

      {/* Team filter */}
      {teams.length > 1 && (
        <div>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            aria-label={t('announcements.filterTeam')}
            className="rounded-md border border-cf-border bg-cf-surface px-3 py-1.5 text-sm text-cf-surface-foreground"
          >
            <option value="">{t('announcements.allTeams')}</option>
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>{tm.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && <LoadingSpinner />}

      {/* Empty */}
      {!loading && !error && announcements.length === 0 && (
        <EmptyState
          icon={<Megaphone size={32} />}
          title={t('announcements.empty.title')}
          description={t('announcements.empty.description')}
        />
      )}

      {/* Feed */}
      {!loading && announcements.length > 0 && (
        <div className="space-y-3">
          {announcements.map((ann) => (
            <AnnouncementCard
              key={ann.id}
              announcement={ann}
              isStaff={!!isStaff}
              isAdmin={!!isAdmin}
              isPlayerOrParent={!!isPlayerOrParent}
              currentUserId={user?.id ?? ''}
              locale={i18n.language}
              onUpdate={updateAnn}
              onRemove={removeAnn}
              onBadgeRefresh={refreshBadge}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          hasPrev={hasPrev}
          hasNext={hasNext}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
          disabled={loading}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AnnouncementCard
// ---------------------------------------------------------------------------

interface CardProps {
  announcement: Announcement
  isStaff: boolean
  isAdmin: boolean
  isPlayerOrParent: boolean
  currentUserId: string
  locale: string
  onUpdate: (id: string, patch: Partial<Announcement>) => void
  onRemove: (id: string) => void
  onBadgeRefresh: () => void
}

function AnnouncementCard({
  announcement: ann,
  isStaff,
  isAdmin,
  isPlayerOrParent,
  currentUserId,
  locale,
  onUpdate,
  onRemove,
  onBadgeRefresh,
}: CardProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showReceipts, setShowReceipts] = useState(false)
  const [receipts, setReceipts] = useState<ReceiptsResponse | null>(null)
  const [receiptsLoading, setReceiptsLoading] = useState(false)
  const markedReadRef = useRef(false)

  const isAuthor = ann.author === currentUserId
  const canEdit = isAuthor
  const canDelete = isAuthor || isAdmin
  const canPin = isAuthor || isAdmin

  // Mark read on first expand
  useEffect(() => {
    if (expanded && !ann.is_read && !markedReadRef.current) {
      markedReadRef.current = true
      announcementService.markRead(ann.id).then(() => {
        onUpdate(ann.id, { is_read: true })
        onBadgeRefresh()
      }).catch(() => {})
    }
  }, [expanded, ann.is_read, ann.id, onUpdate, onBadgeRefresh])

  // Acknowledge toggle (optimistic)
  const handleAcknowledge = async () => {
    const wasAcknowledged = ann.is_acknowledged
    onUpdate(ann.id, { is_acknowledged: !wasAcknowledged })
    try {
      if (wasAcknowledged) {
        await announcementService.unacknowledge(ann.id)
      } else {
        await announcementService.acknowledge(ann.id)
        if (!ann.is_read) {
          onUpdate(ann.id, { is_read: true })
          onBadgeRefresh()
        }
      }
    } catch {
      // Rollback
      onUpdate(ann.id, { is_acknowledged: wasAcknowledged })
    }
  }

  // Pin toggle
  const handlePin = async () => {
    try {
      if (ann.is_pinned) {
        await announcementService.unpin(ann.id)
        onUpdate(ann.id, { is_pinned: false })
      } else {
        await announcementService.pin(ann.id)
        onUpdate(ann.id, { is_pinned: true })
      }
    } catch {
      // ignore
    }
  }

  // Delete
  const handleDelete = async () => {
    if (!window.confirm(t('announcements.deleteConfirm'))) return
    try {
      await announcementService.remove(ann.id)
      onRemove(ann.id)
      onBadgeRefresh()
    } catch {
      // ignore
    }
  }

  // Load receipts on demand
  const handleShowReceipts = async () => {
    if (showReceipts) {
      setShowReceipts(false)
      return
    }
    setShowReceipts(true)
    if (!receipts) {
      setReceiptsLoading(true)
      try {
        const data = await announcementService.receipts(ann.id)
        setReceipts(data)
      } catch {
        // ignore
      } finally {
        setReceiptsLoading(false)
      }
    }
  }

  return (
    <article
      className={cn(
        'rounded-lg border bg-cf-surface transition',
        !ann.is_read && 'border-l-4 border-l-emerald-500',
        ann.is_read && 'border-cf-border',
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {ann.is_pinned && <Badge variant="amber">{t('announcements.pinned')}</Badge>}
            {ann.team && <Badge variant="sky">{t('announcements.teamLabel')}</Badge>}
            {!ann.team && <Badge variant="violet">{t('announcements.academyWide')}</Badge>}
            {!ann.is_read && <span className="h-2 w-2 rounded-full bg-emerald-500" aria-label={t('announcements.unread')} />}
          </div>
          <h3 className="mt-1 text-sm font-semibold text-cf-surface-foreground">{ann.title}</h3>
          <p className="mt-0.5 text-xs text-cf-muted-foreground">
            {ann.author_name ?? t('announcements.unknownAuthor')}
            {' · '}
            {relativeTime(ann.created_at, locale)}
            {ann.edited_at && ` · ${t('announcements.edited')}`}
          </p>
        </div>
        <span className="mt-1 flex-shrink-0 text-cf-muted-foreground">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t border-cf-border px-4 py-3 space-y-3">
          {editing ? (
            <EditForm
              announcement={ann}
              onSaved={(updated) => {
                onUpdate(ann.id, updated)
                setEditing(false)
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <p className="text-sm text-cf-surface-foreground whitespace-pre-wrap">{ann.body}</p>
          )}

          {/* Actions */}
          {!editing && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {/* Acknowledge (player/parent only) */}
              {isPlayerOrParent && (
                <Button
                  variant={ann.is_acknowledged ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={handleAcknowledge}
                  aria-pressed={ann.is_acknowledged}
                >
                  {ann.is_acknowledged ? (
                    <><Check size={14} aria-hidden="true" className="mr-1" />{t('announcements.seen')}</>
                  ) : (
                    t('announcements.markSeen')
                  )}
                </Button>
              )}

              {/* Staff acknowledgement progress */}
              {isStaff && (
                <Button variant="ghost" size="sm" onClick={handleShowReceipts}>
                  <Eye size={14} aria-hidden="true" className="mr-1" />
                  {t('announcements.viewReceipts')}
                </Button>
              )}

              {/* Pin / Unpin */}
              {canPin && isStaff && (
                <Button variant="ghost" size="sm" onClick={handlePin} aria-label={ann.is_pinned ? t('announcements.unpin') : t('announcements.pin')}>
                  {ann.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}
                </Button>
              )}

              {/* Edit */}
              {canEdit && isStaff && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label={t('announcements.edit')}>
                  <Pencil size={14} />
                </Button>
              )}

              {/* Delete */}
              {canDelete && isStaff && (
                <Button variant="ghost" size="sm" onClick={handleDelete} aria-label={t('announcements.delete')}>
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          )}

          {/* Receipts panel */}
          {showReceipts && isStaff && (
            <ReceiptsPanel receipts={receipts} loading={receiptsLoading} />
          )}
        </div>
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------
// EditForm
// ---------------------------------------------------------------------------

function EditForm({
  announcement,
  onSaved,
  onCancel,
}: {
  announcement: Announcement
  onSaved: (patch: Partial<Announcement>) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(announcement.title)
  const [body, setBody] = useState(announcement.body)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      const updated = await announcementService.update(announcement.id, { title, body })
      onSaved({ title: updated.title, body: updated.body, edited_at: updated.edited_at })
    } catch (error) {
      if (error instanceof ApiError) {
        setErr(mapAnnouncementError(error.status, error.message, t))
      } else {
        setErr(t('common.error.generic'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          className="w-full rounded-md border border-cf-border bg-cf-background px-3 py-1.5 text-sm text-cf-surface-foreground"
          required
        />
        <p className="mt-0.5 text-right text-xs text-cf-muted-foreground">{title.length}/{TITLE_MAX}</p>
      </div>
      <div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-cf-border bg-cf-background px-3 py-1.5 text-sm text-cf-surface-foreground"
          required
        />
        <p className={cn('mt-0.5 text-right text-xs', body.length > BODY_MAX ? 'text-red-500' : 'text-cf-muted-foreground')}>
          {body.length}/{BODY_MAX}
        </p>
      </div>
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || body.length > BODY_MAX}>
          {saving ? t('announcements.saving') : t('common.save')}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

function Composer({
  onCreated,
  onCancel,
}: {
  onCreated: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const { user } = useAuth()

  const isAdmin = user?.role === 'ACADEMY_ADMIN'

  const [academies, setAcademies] = useState<Academy[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [academyId, setAcademyId] = useState('')
  const [teamId, setTeamId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Load academies and teams
  useEffect(() => {
    academyService.list().then((res) => {
      setAcademies(res.results)
      if (res.results.length === 1) setAcademyId(res.results[0].id)
    }).catch(() => {})
    teamService.list().then((res) => setTeams(res.results)).catch(() => {})
  }, [])

  const filteredTeams = academyId
    ? teams.filter((tm) => tm.academy === academyId)
    : teams

  const isAcademyWide = !teamId

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!academyId) return

    // Coach cannot post academy-wide
    if (isAcademyWide && !isAdmin) {
      setErr(t('announcements.error.academy_wide_requires_admin'))
      return
    }

    setSaving(true)
    setErr(null)
    try {
      const data: AnnouncementCreate = {
        academy: academyId,
        title,
        body,
        is_pinned: isPinned,
      }
      if (teamId) data.team = teamId
      await announcementService.create(data)
      onCreated()
    } catch (error) {
      if (error instanceof ApiError) {
        setErr(mapAnnouncementError(error.status, error.message, t))
      } else {
        setErr(t('common.error.generic'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-cf-border bg-cf-surface p-4 space-y-4"
    >
      <h2 className="text-sm font-semibold text-cf-surface-foreground">
        {t('announcements.composerTitle')}
      </h2>

      {/* Academy selector (if multiple) */}
      {academies.length > 1 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-cf-muted-foreground">
            {t('announcements.academy')}
          </label>
          <select
            value={academyId}
            onChange={(e) => { setAcademyId(e.target.value); setTeamId('') }}
            required
            className="w-full rounded-md border border-cf-border bg-cf-background px-3 py-1.5 text-sm text-cf-surface-foreground"
          >
            <option value="">{t('announcements.selectAcademy')}</option>
            {academies.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Team / academy-wide */}
      <div>
        <label className="mb-1 block text-xs font-medium text-cf-muted-foreground">
          {t('announcements.audience')}
        </label>
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="w-full rounded-md border border-cf-border bg-cf-background px-3 py-1.5 text-sm text-cf-surface-foreground"
        >
          {isAdmin && <option value="">{t('announcements.wholeAcademy')}</option>}
          {!isAdmin && filteredTeams.length === 0 && (
            <option value="" disabled>{t('announcements.noTeams')}</option>
          )}
          {filteredTeams.map((tm) => (
            <option key={tm.id} value={tm.id}>{tm.name}</option>
          ))}
        </select>
        {isAcademyWide && !isAdmin && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            {t('announcements.error.academy_wide_requires_admin')}
          </p>
        )}
      </div>

      {/* Title */}
      <div>
        <label className="mb-1 block text-xs font-medium text-cf-muted-foreground">
          {t('announcements.titleField')}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          required
          placeholder={t('announcements.titlePlaceholder')}
          className="w-full rounded-md border border-cf-border bg-cf-background px-3 py-1.5 text-sm text-cf-surface-foreground"
        />
        <p className="mt-0.5 text-right text-xs text-cf-muted-foreground">{title.length}/{TITLE_MAX}</p>
      </div>

      {/* Body */}
      <div>
        <label className="mb-1 block text-xs font-medium text-cf-muted-foreground">
          {t('announcements.bodyField')}
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          required
          placeholder={t('announcements.bodyPlaceholder')}
          className="w-full rounded-md border border-cf-border bg-cf-background px-3 py-1.5 text-sm text-cf-surface-foreground"
        />
        <p className={cn('mt-0.5 text-right text-xs', body.length > BODY_MAX ? 'text-red-500' : 'text-cf-muted-foreground')}>
          {body.length}/{BODY_MAX}
        </p>
      </div>

      {/* Pin checkbox */}
      <label className="flex items-center gap-2 text-sm text-cf-surface-foreground">
        <input
          type="checkbox"
          checked={isPinned}
          onChange={(e) => setIsPinned(e.target.checked)}
          className="rounded"
        />
        {t('announcements.pinOnCreate')}
      </label>

      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving || body.length > BODY_MAX || (!teamId && !isAdmin)}>
          {saving ? t('announcements.creating') : t('announcements.createButton')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// ReceiptsPanel
// ---------------------------------------------------------------------------

function ReceiptsPanel({
  receipts,
  loading,
}: {
  receipts: ReceiptsResponse | null
  loading: boolean
}) {
  const { t } = useTranslation()

  if (loading) return <LoadingSpinner size="inline" />
  if (!receipts) return null

  return (
    <div className="rounded-md border border-cf-border bg-cf-background p-3 space-y-3">
      {/* Players */}
      <div>
        <h4 className="text-xs font-semibold text-cf-muted-foreground uppercase tracking-wider">
          {t('announcements.receipts.players')} — {formatProgress(receipts.players.acknowledged, receipts.players.total)}
        </h4>
        {receipts.players.details.length === 0 ? (
          <p className="mt-1 text-xs text-cf-muted-foreground">{t('announcements.receipts.noAudience')}</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {receipts.players.details.map((u) => (
              <ReceiptRow key={u.id} user={u} />
            ))}
          </ul>
        )}
      </div>

      {/* Parents */}
      <div>
        <h4 className="text-xs font-semibold text-cf-muted-foreground uppercase tracking-wider">
          {t('announcements.receipts.parents')} — {formatProgress(receipts.parents.acknowledged, receipts.parents.total)}
        </h4>
        {receipts.parents.details.length === 0 ? (
          <p className="mt-1 text-xs text-cf-muted-foreground">{t('announcements.receipts.noAudience')}</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {receipts.parents.details.map((u) => (
              <ReceiptRow key={u.id} user={u} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ReceiptRow({ user }: { user: { first_name: string; last_name: string; acknowledged_at: string | null } }) {
  const { t } = useTranslation()
  const seen = !!user.acknowledged_at

  return (
    <li className="flex items-center justify-between text-xs">
      <span className="text-cf-surface-foreground">{user.first_name} {user.last_name}</span>
      {seen ? (
        <Badge variant="emerald">{t('announcements.receipts.seen')}</Badge>
      ) : (
        <Badge variant="default">{t('announcements.receipts.notSeen')}</Badge>
      )}
    </li>
  )
}
