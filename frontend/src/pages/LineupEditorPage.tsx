import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeft,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react'

import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import TacticsPitch from '../components/tactics/TacticsPitch'
import PlayerToken from '../components/tactics/PlayerToken'
import SquadList from '../components/tactics/SquadList'
import Bench from '../components/tactics/Bench'
import { DragProvider } from '../components/tactics/DragOverlay'
import { FORMATIONS_BY_FORMAT, GAME_FORMATS } from '../constants/formations'

import { useLineupReducer, createEmptyState } from '../hooks/useLineupReducer'
import { clampCoord } from '../utils/pitchCoords'
import { FORMATION_TEMPLATES } from '../constants/formations'
import { matchService } from '../services/matchService'
import { teamService } from '../services/teamService'
import { tacticsService } from '../services/tacticsService'
import { ApiError } from '../services/api'

import type { Match, Player } from '../types'
import type {
  GameFormat,
  LineupRead,
  SquadPlayer,
  SlotWrite,
  DrawingElement,
} from '../types/tactics'
import type { LineupState } from '../hooks/useLineupReducer'

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapTacticsError(status: number, body: string, t: (k: string) => string): string {
  if (status === 409) return t('tactics.error.versionConflict')
  if (status === 403) return t('tactics.error.forbidden')
  if (status === 404) return t('tactics.error.notFound')
  try {
    const parsed = JSON.parse(body)
    const code = parsed?.code ?? parsed?.slots?.code ?? parsed?.formation?.code ?? null
    if (code) {
      const key = `tactics.error.${code}`
      const translated = t(key)
      if (translated !== key) return translated
    }
  } catch { /* not JSON */ }
  return t('common.error.generic')
}

// ---------------------------------------------------------------------------
// Server ↔ editor state converters
// ---------------------------------------------------------------------------

function serverToState(lineup: LineupRead): LineupState {
  return {
    gameFormat: lineup.game_format,
    formation: lineup.formation,
    starters: lineup.slots
      .filter((s) => s.role === 'STARTER')
      .map((s) => ({
        playerId: s.player_id,
        x: parseFloat(s.x ?? '0.5'),
        y: parseFloat(s.y ?? '0.5'),
        positionCode: s.position_code,
      })),
    bench: lineup.slots
      .filter((s) => s.role === 'SUBSTITUTE')
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ playerId: s.player_id, order: s.order })),
    drawing: lineup.drawing ?? [],
    version: lineup.version,
    status: lineup.status,
    isDirty: false,
  }
}

function stateToPayload(state: LineupState) {
  const slots: SlotWrite[] = [
    ...state.starters.map((s, i) => ({
      player: s.playerId,
      role: 'STARTER' as const,
      x: s.x.toFixed(4),
      y: s.y.toFixed(4),
      position_code: s.positionCode,
      order: i,
    })),
    ...state.bench.map((b) => ({
      player: b.playerId,
      role: 'SUBSTITUTE' as const,
      order: b.order,
    })),
  ]
  return {
    game_format: state.gameFormat,
    formation: state.formation,
    slots,
    drawing: state.drawing as DrawingElement[],
    version: state.version,
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LineupEditorPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [match, setMatch] = useState<Match | null>(null)
  const [squad, setSquad] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isNewLineup, setIsNewLineup] = useState(false)

  const { state, dispatch, canUndo, canRedo, undo, redo } = useLineupReducer()
  const [serverState, setServerState] = useState<LineupState | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [panelTab, setPanelTab] = useState<'squad' | 'bench'>('squad')
  const [panelOpen, setPanelOpen] = useState(false) // tablet drawer

  const svgRef = useRef<SVGSVGElement>(null)
  const benchRef = useRef<HTMLDivElement>(null)

  // Player lookup
  const playerMap = useMemo(() => {
    const map = new Map<string, SquadPlayer>()
    for (const p of squad) {
      map.set(p.id, {
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        preferred_position: p.preferred_position ?? '',
        jersey_number: p.jersey_number,
      })
    }
    return map
  }, [squad])

  const placedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const s of state.starters) ids.add(s.playerId)
    for (const b of state.bench) ids.add(b.playerId)
    return ids
  }, [state.starters, state.bench])

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!matchId) return
    setLoading(true)
    setError(null)
    let cancelled = false

    async function load() {
      try {
        const matchData = await matchService.getMatch(matchId!)
        if (cancelled) return
        setMatch(matchData)

        const [squadData, lineupResult] = await Promise.allSettled([
          teamService.listPlayers(matchData.team),
          tacticsService.getLineup(matchId!),
        ])
        if (cancelled) return

        if (squadData.status === 'fulfilled') setSquad(squadData.value)

        if (lineupResult.status === 'fulfilled') {
          const s = serverToState(lineupResult.value)
          setServerState(s)
          dispatch({ type: 'LOAD_SERVER_STATE', state: s })
          setIsNewLineup(false)
        } else {
          const err = lineupResult.reason
          if (err instanceof ApiError && err.status === 404) setIsNewLineup(true)
          else throw err
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('common.error.generic'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [matchId, t, dispatch])

  // ── Unsaved-changes guard ──────────────────────────────────────────────────

  useEffect(() => {
    if (!state.isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [state.isDirty])

  const guardedNavigate = useCallback((to: string) => {
    if (state.isDirty && !window.confirm(t('tactics.unsavedConfirm'))) return
    navigate(to)
  }, [state.isDirty, navigate, t])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!matchId) return
    setSaving(true)
    setSaveError(null)
    try {
      const result = await tacticsService.saveLineup(matchId, stateToPayload(state))
      setServerState(serverToState(result))
      dispatch({ type: 'MARK_SAVED', version: result.version })
      setIsNewLineup(false)
    } catch (err) {
      setSaveError(err instanceof ApiError ? mapTacticsError(err.status, err.message, t) : t('common.error.generic'))
    } finally {
      setSaving(false)
    }
  }, [matchId, state, t, dispatch])

  const handleReset = useCallback(() => {
    if (serverState) dispatch({ type: 'RESET', serverState })
    else dispatch({ type: 'LOAD_SERVER_STATE', state: createEmptyState() })
    setSaveError(null)
  }, [serverState, dispatch])

  const handleFormatChange = useCallback(
    (format: GameFormat) => dispatch({ type: 'SET_FORMAT', format }), [dispatch])

  const handleFormationChange = useCallback(
    (formation: string) => dispatch({ type: 'APPLY_FORMATION', formation }), [dispatch])

  const handlePlaceOnPitch = useCallback((playerId: string) => {
    const template = FORMATION_TEMPLATES[state.formation]
    if (!template) return
    const usedSlots = new Set(state.starters.map((s) => `${s.x.toFixed(2)},${s.y.toFixed(2)}`))
    const freeSlot = template.find((t) => !usedSlots.has(`${t.x.toFixed(2)},${t.y.toFixed(2)}`))
    dispatch({
      type: 'PLACE_PLAYER',
      playerId,
      x: freeSlot?.x ?? 0.5,
      y: freeSlot?.y ?? 0.5,
      positionCode: freeSlot?.positionCode ?? '',
    })
  }, [state.formation, state.starters, dispatch])

  const handlePlaceOnBench = useCallback(
    (playerId: string) => dispatch({ type: 'PLACE_ON_BENCH', playerId }), [dispatch])

  const handleDragMove = useCallback(
    (playerId: string, cx: number, cy: number) => {
      dispatch({ type: 'MOVE_PLAYER', playerId, x: clampCoord(cx), y: clampCoord(cy) })
    }, [dispatch])

  const handleKeyMove = useCallback(
    (playerId: string, dx: number, dy: number) => {
      const s = state.starters.find((s) => s.playerId === playerId)
      if (!s) return
      dispatch({ type: 'MOVE_PLAYER', playerId, x: clampCoord(s.x + dx), y: clampCoord(s.y + dy) })
    }, [state.starters, dispatch])

  const handleRemoveFromPitch = useCallback(
    (playerId: string) => dispatch({ type: 'SEND_TO_BENCH', playerId }), [dispatch])

  const handleBenchReorder = useCallback(
    (playerId: string, direction: 'up' | 'down') =>
      dispatch({ type: 'REORDER_BENCH', playerId, direction }), [dispatch])

  const handleBenchMoveToPitch = useCallback(
    (playerId: string) => handlePlaceOnPitch(playerId), [handlePlaceOnPitch])

  const handleBenchRemove = useCallback(
    (playerId: string) => dispatch({ type: 'REMOVE_FROM_LINEUP', playerId }), [dispatch])

  // ── Drop handlers ──────────────────────────────────────────────────────────

  const handleDropOnPitch = useCallback(
    (playerId: string, cx: number, cy: number, sourceType: 'squad' | 'bench' | 'pitch') => {
      const isAlreadyStarter = state.starters.some((s) => s.playerId === playerId)
      if (!isAlreadyStarter && state.starters.length >= state.gameFormat) {
        setSaveError(t('tactics.error.too_many_starters'))
        return
      }
      const template = FORMATION_TEMPLATES[state.formation]
      const closestSlot = template?.reduce((best, slot) => {
        const dist = Math.hypot(slot.x - clampCoord(cx), slot.y - clampCoord(cy))
        return dist < best.dist ? { slot, dist } : best
      }, { slot: template[0], dist: Infinity })
      const posCode = closestSlot?.slot.positionCode ?? ''

      if (sourceType === 'pitch') {
        dispatch({ type: 'MOVE_PLAYER', playerId, x: clampCoord(cx), y: clampCoord(cy) })
      } else {
        dispatch({ type: 'PLACE_PLAYER', playerId, x: clampCoord(cx), y: clampCoord(cy), positionCode: posCode })
      }
      setSaveError(null)
    }, [state.starters, state.gameFormat, state.formation, dispatch, t])

  const handleDropOnBench = useCallback(
    (playerId: string, sourceType: 'squad' | 'bench' | 'pitch') => {
      if (sourceType === 'pitch') dispatch({ type: 'SEND_TO_BENCH', playerId })
      else if (sourceType === 'squad') dispatch({ type: 'PLACE_ON_BENCH', playerId })
    }, [dispatch])

  const handleDragCancel = useCallback(() => {}, [])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <LoadingSpinner />

  if (error || !match) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          icon={<AlertTriangle size={20} />}
          title={t('tactics.error.loadFailed')}
          description={error ?? t('tactics.error.notFound')}
        />
      </div>
    )
  }

  // ── Pitch tokens (shared across breakpoints) ──────────────────────────────

  const tokens = state.starters.map((s) => {
    const p = playerMap.get(s.playerId)
    if (!p) return null
    return (
      <PlayerToken
        key={s.playerId}
        player={p}
        x={s.x}
        y={s.y}
        positionCode={s.positionCode}
        selected={selectedPlayer === s.playerId}
        onDragMove={handleDragMove}
        onDragEnd={() => {}}
        onSelect={setSelectedPlayer}
        onKeyMove={handleKeyMove}
        onRemove={handleRemoveFromPitch}
        svgRef={svgRef}
      />
    )
  })

  const readOnlyTokens = state.starters.map((s) => {
    const p = playerMap.get(s.playerId)
    if (!p) return null
    return <PlayerToken key={s.playerId} player={p} x={s.x} y={s.y} positionCode={s.positionCode} svgRef={svgRef} />
  })

  // ── Compact toolbar (shared) ──────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-cf-surface px-3 py-1.5 ring-1 ring-cf-border">
      {/* Back + title */}
      <button
        onClick={() => guardedNavigate(`/coach/matches/${match.id}`)}
        className="inline-flex items-center gap-1 text-sm text-cf-muted-foreground hover:text-cf-surface-foreground"
      >
        <ArrowLeft size={14} />
        <span className="hidden sm:inline">{t('tactics.backToMatch')}</span>
      </button>

      <div className="hidden h-4 w-px bg-cf-border sm:block" />

      {/* Format buttons */}
      <div className="flex gap-0.5">
        {GAME_FORMATS.map((f) => (
          <button
            key={f}
            onClick={() => handleFormatChange(f)}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              state.gameFormat === f
                ? 'bg-cf-brand text-cf-brand-foreground'
                : 'text-cf-muted-foreground hover:bg-cf-muted'
            }`}
          >
            {f}v{f}
          </button>
        ))}
      </div>

      {/* Formation select */}
      <select
        value={state.formation}
        onChange={(e) => handleFormationChange(e.target.value)}
        className="rounded border border-cf-border bg-transparent px-2 py-1 text-xs text-cf-surface-foreground focus:outline-none focus:ring-1 focus:ring-cf-brand"
      >
        {FORMATIONS_BY_FORMAT[state.gameFormat].map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>

      {/* Starter count */}
      <span className="text-xs tabular-nums text-cf-muted-foreground">
        {t('tactics.starterCount', { count: state.starters.length, max: state.gameFormat })}
      </span>

      <div className="flex-1" />

      {/* Status */}
      <Badge variant={state.status === 'PUBLISHED' ? 'emerald' : 'default'}>
        {state.status === 'PUBLISHED' ? t('tactics.statusPublished') : t('tactics.statusDraft')}
      </Badge>
      {isNewLineup && <Badge>{t('tactics.new')}</Badge>}

      {/* Undo / redo / reset */}
      <button onClick={undo} disabled={!canUndo} className="rounded p-1 text-cf-muted-foreground hover:bg-cf-muted disabled:opacity-30" aria-label={t('tactics.undo')}>
        <Undo2 size={15} />
      </button>
      <button onClick={redo} disabled={!canRedo} className="rounded p-1 text-cf-muted-foreground hover:bg-cf-muted disabled:opacity-30" aria-label={t('tactics.redo')}>
        <Redo2 size={15} />
      </button>
      <button onClick={handleReset} disabled={!state.isDirty} className="rounded p-1 text-cf-muted-foreground hover:bg-cf-muted disabled:opacity-30" aria-label={t('tactics.reset')}>
        <RotateCcw size={15} />
      </button>

      {/* Save */}
      <Button variant="primary" size="sm" onClick={handleSave} disabled={!state.isDirty || saving}>
        <Save size={13} />
        {saving ? t('tactics.saving') : t('common.save')}
      </Button>
    </div>
  )

  // ── Right panel content ───────────────────────────────────────────────────

  const panelContent = (
    <div className="flex h-full flex-col overflow-hidden rounded-xl bg-cf-surface ring-1 ring-cf-border">
      {/* Tabs */}
      <div className="flex border-b border-cf-border">
        {(['squad', 'bench'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setPanelTab(tab)}
            className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
              panelTab === tab
                ? 'border-b-2 border-cf-brand text-cf-surface-foreground'
                : 'text-cf-muted-foreground hover:text-cf-surface-foreground'
            }`}
          >
            {tab === 'squad'
              ? `${t('tactics.squad')} (${squad.length - placedIds.size})`
              : `${t('tactics.substitutes')} (${state.bench.length})`}
          </button>
        ))}
      </div>
      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {panelTab === 'squad' ? (
          <SquadList
            players={[...playerMap.values()]}
            placedIds={placedIds}
            onPlaceOnPitch={handlePlaceOnPitch}
            onPlaceOnBench={handlePlaceOnBench}
          />
        ) : (
          <Bench
            ref={benchRef}
            slots={state.bench}
            playerMap={playerMap}
            onReorder={handleBenchReorder}
            onMoveToPitch={handleBenchMoveToPitch}
            onRemove={handleBenchRemove}
          />
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* ═══ Mobile: horizontal read-only pitch ═══ */}
      <div className="flex flex-col gap-3 px-4 py-4 md:hidden">
        <div className="w-full">
          <TacticsPitch gameFormat={state.gameFormat} svgRef={svgRef}>
            {readOnlyTokens}
          </TacticsPitch>
        </div>
        <p className="text-center text-sm text-cf-muted-foreground">
          {t('tactics.mobileHint')}
        </p>
      </div>

      {/* ═══ Tablet (md–lg): full-screen pitch + drawer panel ═══ */}
      <div className="hidden md:flex lg:hidden flex-col" style={{ height: 'calc(100dvh - 3rem)' }}>
        <div className="flex-shrink-0 px-3 pt-2 pb-1">{toolbar}</div>
        {saveError && (
          <div className="mx-3 mb-1 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {saveError}
          </div>
        )}
        <DragProvider pitchRef={svgRef} benchRef={benchRef} onDropOnPitch={handleDropOnPitch} onDropOnBench={handleDropOnBench} onCancel={handleDragCancel}>
          <div className="relative flex-1 min-h-0 px-3 pb-2">
            {/* Pitch fills the area */}
            <div className="h-full w-full">
              <TacticsPitch gameFormat={state.gameFormat} svgRef={svgRef}>
                {tokens}
              </TacticsPitch>
            </div>
            {/* Drawer toggle */}
            <button
              onClick={() => setPanelOpen((o) => !o)}
              className="absolute right-5 top-2 z-10 rounded-lg bg-cf-surface/90 p-2 shadow ring-1 ring-cf-border backdrop-blur"
              aria-label={panelOpen ? 'Close panel' : 'Open panel'}
            >
              {panelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </button>
            {/* Drawer overlay */}
            {panelOpen && (
              <div className="absolute inset-y-0 right-3 z-20 w-64 shadow-xl">
                {panelContent}
              </div>
            )}
          </div>
        </DragProvider>
      </div>

      {/* ═══ Desktop (lg+): toolbar + pitch + right panel ═══ */}
      <div className="hidden lg:flex flex-col" style={{ height: 'calc(100dvh - 3rem)' }}>
        <div className="flex-shrink-0 px-4 pt-2 pb-1">{toolbar}</div>
        {saveError && (
          <div className="mx-4 mb-1 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {saveError}
            {saveError === t('tactics.error.versionConflict') && (
              <button onClick={() => window.location.reload()} className="ml-2 font-medium underline">
                {t('tactics.reload')}
              </button>
            )}
          </div>
        )}
        <DragProvider pitchRef={svgRef} benchRef={benchRef} onDropOnPitch={handleDropOnPitch} onDropOnBench={handleDropOnBench} onCancel={handleDragCancel}>
          <div className="flex flex-1 min-h-0 gap-3 px-4 pb-2">
            {/* Pitch */}
            <div className="flex-1 min-w-0">
              <TacticsPitch gameFormat={state.gameFormat} svgRef={svgRef}>
                {tokens}
              </TacticsPitch>
            </div>
            {/* Right panel */}
            <div className="w-60 flex-shrink-0">
              {panelContent}
            </div>
          </div>
        </DragProvider>
      </div>
    </>
  )
}
