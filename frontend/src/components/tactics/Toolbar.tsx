/**
 * Editor toolbar: undo, redo, reset, save button, starter count, status badge.
 */

import { useTranslation } from 'react-i18next'
import { Undo2, Redo2, RotateCcw, Save } from 'lucide-react'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import type { GameFormat, LineupStatus } from '../../types/tactics'

interface ToolbarProps {
  gameFormat: GameFormat
  starterCount: number
  status: LineupStatus
  isDirty: boolean
  saving: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  onSave: () => void
}

export default function Toolbar({
  gameFormat,
  starterCount,
  status,
  isDirty,
  saving,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReset,
  onSave,
}: ToolbarProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Status badge */}
      <Badge variant={status === 'PUBLISHED' ? 'emerald' : 'default'}>
        {status === 'PUBLISHED' ? t('tactics.statusPublished') : t('tactics.statusDraft')}
      </Badge>

      {/* Starter count */}
      <span className="text-sm tabular-nums text-cf-muted-foreground">
        {t('tactics.starterCount', { count: starterCount, max: gameFormat })}
      </span>

      <div className="flex-1" />

      {/* Undo / Redo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className="rounded p-1.5 text-cf-muted-foreground hover:bg-cf-muted hover:text-cf-surface-foreground disabled:opacity-30"
        aria-label={t('tactics.undo')}
        title={t('tactics.undo')}
      >
        <Undo2 size={16} />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        className="rounded p-1.5 text-cf-muted-foreground hover:bg-cf-muted hover:text-cf-surface-foreground disabled:opacity-30"
        aria-label={t('tactics.redo')}
        title={t('tactics.redo')}
      >
        <Redo2 size={16} />
      </button>

      {/* Reset */}
      <button
        onClick={onReset}
        disabled={!isDirty}
        className="rounded p-1.5 text-cf-muted-foreground hover:bg-cf-muted hover:text-cf-surface-foreground disabled:opacity-30"
        aria-label={t('tactics.reset')}
        title={t('tactics.reset')}
      >
        <RotateCcw size={16} />
      </button>

      {/* Save */}
      <Button
        variant="primary"
        size="sm"
        onClick={onSave}
        disabled={!isDirty || saving}
      >
        <Save size={14} />
        {saving ? t('tactics.saving') : t('common.save')}
      </Button>
    </div>
  )
}
