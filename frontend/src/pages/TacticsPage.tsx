/**
 * Tactics board editor — the main /coach/tactics page.
 *
 * - /coach/tactics       → loads most recently updated own board (or new empty)
 * - /coach/tactics/:id   → loads a specific board
 *
 * Unsaved boards work fully before first Save (POST creates, then PATCH).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, MousePointer2, Pen, Type, Eraser,
  Redo2, Save, Undo2, FilePlus2, FolderOpen,
  PanelRightOpen, PanelRightClose, Eye, Trash2, X,
  Circle, Plus,
} from 'lucide-react'

import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import TacticsPitch from '../components/tactics/TacticsPitch'
import BoardToken from '../components/tactics/BoardToken'
import DrawingLayer, { COLOR_MAP, WIDTH_MAP, pointsToPath } from '../components/tactics/DrawingLayer'

import { useAuth } from '../context/AuthContext'
import { useBoardReducer, createEmptyBoardState } from '../hooks/useBoardReducer'
import { screenToCanonical, clampCoord, canonicalToDisplay, FIELD_LEFT, FIELD_TOP, FIELD_W, FIELD_H } from '../utils/pitchCoords'
import { simplifyStroke } from '../utils/strokeSimplify'
import { tacticsService } from '../services/tacticsService'
import { teamService } from '../services/teamService'
import { ApiError } from '../services/api'

import type { TacticBoardRead, BoardToken as BoardTokenType, DrawingColor, StrokeWidth } from '../types/tactics'
import type { Player, Team } from '../types'
import type { BoardState } from '../hooks/useBoardReducer'
import { cn } from '../lib/utils'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Tool = 'select' | 'pen' | 'text' | 'eraser'
const COLORS: DrawingColor[] = ['white', 'yellow', 'red', 'blue', 'black']
const WIDTHS: StrokeWidth[] = ['sm', 'md', 'lg']
const COLOR_CSS: Record<DrawingColor, string> = {
  white: 'bg-white border-gray-300', yellow: 'bg-yellow-400',
  red: 'bg-red-500', blue: 'bg-blue-500', black: 'bg-slate-800 dark:bg-slate-300',
}
const LAST_BOARD_KEY = 'cf_last_board_id'

let _idCounter = 0
function nextId(prefix: string): string { return `${prefix}_${Date.now()}_${++_idCounter}` }

function getLastBoardId(): string | null { try { return localStorage.getItem(LAST_BOARD_KEY) } catch { return null } }
function setLastBoardId(id: string) { try { localStorage.setItem(LAST_BOARD_KEY, id) } catch { /* */ } }

function mapBoardError(err: unknown, t: (k: string) => string): string {
  if (!(err instanceof ApiError)) return t('common.error.generic')
  if (err.status === 409) return t('tactics.error.versionConflict')
  if (err.status === 403) return t('tactics.error.forbidden')
  if (err.status === 404) return t('tactics.error.notFound')
  try {
    const body = JSON.parse(err.message)
    for (const key of Object.keys(body)) {
      const val = body[key]
      const code = typeof val === 'object' ? val?.code : null
      if (code) { const k = `tactics.board.error.${code}`; const tr = t(k); if (tr !== k) return tr }
    }
  } catch { /* */ }
  return t('common.error.generic')
}

function serverToState(board: TacticBoardRead): BoardState {
  return { title: board.title, gameFormat: board.game_format, tokens: board.tokens ?? [], drawing: board.drawing ?? [], version: board.version, isDirty: false }
}

function defaultTitle(t: (k: string) => string): string {
  return `${t('tactics.board.newBoard')} – ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function TacticsPage() {
  const { boardId: routeBoardId } = useParams<{ boardId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user } = useAuth()

  // ── Board identity ──
  const [boardId, setBoardId] = useState<string | null>(routeBoardId ?? null)
  const [board, setBoard] = useState<TacticBoardRead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const { state, dispatch, canUndo, canRedo, undo, redo } = useBoardReducer()

  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState<DrawingColor>('white')
  const [strokeWidth, setStrokeWidth] = useState<StrokeWidth>('md')
  const [panelOpen, setPanelOpen] = useState(true)
  const [showBoardList, setShowBoardList] = useState(false)

  // Pen state — draft stroke rendered live via ref + rAF
  const svgRef = useRef<SVGSVGElement>(null)
  const draftPathRef = useRef<SVGPathElement>(null)
  const penPoints = useRef<[number, number][]>([])
  const [penActive, setPenActive] = useState(false)
  const rafRef = useRef(0)

  // Text input
  const [textInput, setTextInput] = useState<{ cx: number; cy: number; editingId?: string } | null>(null)
  const [textValue, setTextValue] = useState('')
  const textInputRef = useRef<HTMLInputElement>(null)

  // Token label edit
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null)
  const [editingTokenLabel, setEditingTokenLabel] = useState('')
  const tokenLabelRef = useRef<HTMLInputElement>(null)

  // Team & players
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  // Board list
  const [boardList, setBoardList] = useState<TacticBoardRead[]>([])
  const [boardListLoading, setBoardListLoading] = useState(false)

  const isCreator = board ? user?.id === board.created_by : true
  const isNewBoard = !boardId
  const readOnly = !isCreator && !isNewBoard

  // ── Initial load ──

  useEffect(() => {
    let cancelled = false
    async function init() {
      setLoading(true); setError(null)
      if (routeBoardId) {
        try {
          const data = await tacticsService.getBoard(routeBoardId)
          if (cancelled) return
          setBoard(data); setBoardId(data.id); setLastBoardId(data.id)
          dispatch({ type: 'LOAD_SERVER_STATE', state: serverToState(data) })
          if (data.team) { setSelectedTeamId(data.team); teamService.listPlayers(data.team).then(setTeamPlayers).catch(() => {}) }
        } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : t('common.error.generic')) }
        finally { if (!cancelled) setLoading(false) }
        return
      }
      try {
        const lastId = getLastBoardId()
        if (lastId) {
          try {
            const data = await tacticsService.getBoard(lastId)
            if (cancelled) return
            if (data.created_by === user?.id) {
              setBoard(data); setBoardId(data.id)
              dispatch({ type: 'LOAD_SERVER_STATE', state: serverToState(data) })
              if (data.team) { setSelectedTeamId(data.team); teamService.listPlayers(data.team).then(setTeamPlayers).catch(() => {}) }
              setLoading(false); return
            }
          } catch { /* stale */ }
        }
        const list = await tacticsService.listBoards()
        if (cancelled) return
        const own = list.results.find((b) => b.created_by === user?.id)
        if (own) {
          setBoard(own); setBoardId(own.id); setLastBoardId(own.id)
          dispatch({ type: 'LOAD_SERVER_STATE', state: serverToState(own) })
          if (own.team) { setSelectedTeamId(own.team); teamService.listPlayers(own.team).then(setTeamPlayers).catch(() => {}) }
        } else {
          dispatch({ type: 'LOAD_SERVER_STATE', state: { ...createEmptyBoardState(11), title: defaultTitle(t), isDirty: false } })
          setBoardId(null); setBoard(null)
        }
      } catch {
        if (!cancelled) { dispatch({ type: 'LOAD_SERVER_STATE', state: { ...createEmptyBoardState(11), title: defaultTitle(t), isDirty: false } }); setBoardId(null); setBoard(null) }
      } finally { if (!cancelled) setLoading(false) }
    }
    init()
    return () => { cancelled = true }
  }, [routeBoardId, t, dispatch, user?.id])

  // Load academy teams for the panel
  useEffect(() => {
    if (!board?.academy) return
    teamService.list().then((data) => {
      setTeams(data.results.filter((tm) => tm.academy === board.academy))
    }).catch(() => {})
  }, [board?.academy])

  // ── Unsaved guard ──

  useEffect(() => {
    if (!state.isDirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [state.isDirty])

  const confirmUnsaved = useCallback((): boolean => {
    if (!state.isDirty) return true
    return window.confirm(t('tactics.unsavedConfirm'))
  }, [state.isDirty, t])

  // ── Save ──

  const handleSave = useCallback(async () => {
    setSaving(true); setSaveError(null)
    try {
      const payload = {
        title: state.title || defaultTitle(t),
        game_format: state.gameFormat,
        tokens: state.tokens,
        drawing: state.drawing,
        version: state.version,
        ...(selectedTeamId ? { team: selectedTeamId } : {}),
      }
      if (boardId) {
        const result = await tacticsService.updateBoard(boardId, payload)
        setBoard(result); setBoardId(result.id); setLastBoardId(result.id)
        dispatch({ type: 'MARK_SAVED', version: result.version })
      } else {
        const result = await tacticsService.createBoard(payload)
        setBoard(result); setBoardId(result.id); setLastBoardId(result.id)
        dispatch({ type: 'MARK_SAVED', version: result.version })
        navigate(`/coach/tactics/${result.id}`, { replace: true })
      }
    } catch (err) { setSaveError(mapBoardError(err, t)) }
    finally { setSaving(false) }
  }, [boardId, state, selectedTeamId, t, dispatch, navigate])

  // ── New board ──

  const handleNew = useCallback(() => {
    if (!confirmUnsaved()) return
    setBoard(null); setBoardId(null); setTeamPlayers([]); setSelectedTeamId(null); setSaveError(null)
    dispatch({ type: 'LOAD_SERVER_STATE', state: { ...createEmptyBoardState(11), title: defaultTitle(t), isDirty: false } })
    navigate('/coach/tactics', { replace: true })
  }, [confirmUnsaved, dispatch, navigate, t])

  // ── Open existing board ──

  const openBoard = useCallback((b: TacticBoardRead) => {
    if (!confirmUnsaved()) return
    setBoard(b); setBoardId(b.id); setLastBoardId(b.id); setSaveError(null); setTeamPlayers([])
    dispatch({ type: 'LOAD_SERVER_STATE', state: serverToState(b) })
    if (b.team) { setSelectedTeamId(b.team); teamService.listPlayers(b.team).then(setTeamPlayers).catch(() => {}) }
    else setSelectedTeamId(null)
    setShowBoardList(false)
    navigate(`/coach/tactics/${b.id}`, { replace: true })
  }, [confirmUnsaved, dispatch, navigate])

  const loadBoardList = useCallback(() => {
    setShowBoardList(true); setBoardListLoading(true)
    tacticsService.listBoards().then((d) => setBoardList(d.results)).catch(() => {}).finally(() => setBoardListLoading(false))
  }, [])

  const handleDeleteBoard = useCallback(async (id: string) => {
    if (!window.confirm(t('tactics.board.deleteConfirm'))) return
    try { await tacticsService.deleteBoard(id); setBoardList((p) => p.filter((b) => b.id !== id)); if (id === boardId) handleNew() } catch { /* */ }
  }, [boardId, handleNew, t])

  // ── Team change ──

  const handleTeamChange = useCallback((teamId: string) => {
    if (teamId === selectedTeamId) return
    // When changing team, players with player_id from the old team become plain numbered tokens
    const hasPlayerTokens = state.tokens.some((tk) => tk.player_id)
    if (hasPlayerTokens && selectedTeamId) {
      if (!window.confirm(t('tactics.board.teamChangeConfirm'))) return
      // Convert player tokens to numbered
      let homeCount = state.tokens.filter((tk) => tk.kind === 'home' && !tk.player_id).length
      for (const tk of state.tokens) {
        if (tk.player_id) {
          homeCount++
          dispatch({ type: 'UPDATE_TOKEN_LABEL', id: tk.id, label: String(homeCount) })
          // Remove player_id by replacing the token
          dispatch({ type: 'DELETE_TOKEN', id: tk.id })
          dispatch({ type: 'ADD_TOKEN', token: { id: tk.id, kind: 'home', x: tk.x, y: tk.y, label: String(homeCount) } })
        }
      }
    }
    setSelectedTeamId(teamId || null)
    if (teamId) {
      teamService.listPlayers(teamId).then(setTeamPlayers).catch(() => setTeamPlayers([]))
    } else {
      setTeamPlayers([])
    }
  }, [selectedTeamId, state.tokens, dispatch, t])

  // ── Token add ──

  const addToken = useCallback((kind: BoardTokenType['kind'], spawnY = 0.3) => {
    const label = kind === 'ball' ? undefined : String(state.tokens.filter((tk) => tk.kind === kind).length + 1)
    dispatch({ type: 'ADD_TOKEN', token: { id: nextId(kind[0]), kind, x: 0.5, y: spawnY, label } })
  }, [state.tokens, dispatch])

  const addPlayerToken = useCallback((player: Player) => {
    if (state.tokens.find((tk) => tk.player_id === player.id)) return
    dispatch({
      type: 'ADD_TOKEN',
      token: {
        id: nextId('p'), kind: 'home', x: 0.5, y: 0.3,
        label: player.jersey_number != null ? String(player.jersey_number) : (player.first_name[0] + player.last_name[0]),
        player_id: player.id,
      },
    })
  }, [state.tokens, dispatch])

  // ── Live pen drawing ──

  const updateDraftPath = useCallback(() => {
    const el = draftPathRef.current
    if (!el) return
    if (penPoints.current.length < 2) { el.setAttribute('d', ''); return }
    el.setAttribute('d', pointsToPath(penPoints.current))
  }, [])

  const handlePitchPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly) return
    const svg = svgRef.current
    if (!svg) return

    if (tool === 'pen') {
      e.preventDefault()
      svg.setPointerCapture(e.pointerId)
      const result = screenToCanonical(e.clientX, e.clientY, svg)
      if (!result) return
      penPoints.current = [[clampCoord(result.cx), clampCoord(result.cy)]]
      setPenActive(true)
      updateDraftPath()
    }

    if (tool === 'text') {
      // Only create new text if clicking on empty pitch (not on an existing text)
      const target = e.target as Element
      if (target.closest('[data-text-draggable]')) return // let DraggableText handle it
      e.preventDefault()
      const result = screenToCanonical(e.clientX, e.clientY, svg)
      if (!result) return
      setTextInput({ cx: clampCoord(result.cx), cy: clampCoord(result.cy) })
      setTextValue('')
      setTimeout(() => textInputRef.current?.focus(), 0)
    }
  }, [tool, readOnly, updateDraftPath])

  const handlePitchPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!penActive || tool !== 'pen') return
    e.preventDefault()
    const svg = svgRef.current
    if (!svg) return

    // Use coalesced events for smoother input
    const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent]
    for (const pe of events) {
      const result = screenToCanonical(pe.clientX, pe.clientY, svg)
      if (result) penPoints.current.push([clampCoord(result.cx), clampCoord(result.cy)])
    }

    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(updateDraftPath)
  }, [penActive, tool, updateDraftPath])

  const handlePitchPointerUp = useCallback(() => {
    if (!penActive) return
    setPenActive(false)
    cancelAnimationFrame(rafRef.current)
    const pts = simplifyStroke(penPoints.current)
    if (pts.length >= 2) {
      dispatch({ type: 'ADD_STROKE', element: { id: nextId('s'), type: 'freehand', points: pts, color, width: strokeWidth, dashed: false } })
    }
    penPoints.current = []
    // Clear draft path
    draftPathRef.current?.setAttribute('d', '')
  }, [penActive, color, strokeWidth, dispatch])

  // Cancel pen on Escape or pointercancel
  useEffect(() => {
    if (!penActive) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPenActive(false); penPoints.current = []; draftPathRef.current?.setAttribute('d', '')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [penActive])

  // ── Text commit ──

  const commitText = useCallback(() => {
    if (!textInput) return
    const trimmed = textValue.trim().slice(0, 120)
    if (!trimmed) { setTextInput(null); return }
    if (textInput.editingId) {
      dispatch({ type: 'EDIT_TEXT', id: textInput.editingId, text: trimmed })
    } else {
      dispatch({ type: 'ADD_TEXT', element: { id: nextId('t'), type: 'text', at: [textInput.cx, textInput.cy], text: trimmed, color } })
    }
    setTextInput(null); setTextValue('')
    // Keep text tool active — don't switch
  }, [textInput, textValue, color, dispatch])

  // ── Drawing interactions ──

  const handleElementClick = useCallback((id: string) => {
    if (tool === 'eraser') dispatch({ type: 'DELETE_DRAWING', id })
  }, [tool, dispatch])

  const handleTextDrag = useCallback((id: string, cx: number, cy: number) => {
    if (readOnly) return
    // Allow text drag in both Select and Text tool modes
    if (tool !== 'select' && tool !== 'text') return
    dispatch({ type: 'MOVE_TEXT', id, at: [cx, cy] })
  }, [tool, readOnly, dispatch])

  const handleTextDoubleClick = useCallback((id: string) => {
    if (readOnly) return
    if (tool !== 'select' && tool !== 'text') return
    const el = state.drawing.find((d) => d.id === id && d.type === 'text')
    if (!el) return
    const at = el.at as [number, number]
    setTextInput({ cx: at[0], cy: at[1], editingId: id })
    setTextValue(el.text as string)
    setTimeout(() => textInputRef.current?.focus(), 0)
  }, [tool, readOnly, state.drawing])

  const handleTokenDragMove = useCallback((id: string, cx: number, cy: number) => {
    if (tool !== 'select' || readOnly) return
    dispatch({ type: 'MOVE_TOKEN', id, x: cx, y: cy })
  }, [tool, readOnly, dispatch])

  const handleTokenClick = useCallback((id: string) => {
    if (tool === 'eraser' && !readOnly) { dispatch({ type: 'DELETE_TOKEN', id }); return }
    if (tool === 'select' && !readOnly) {
      // Open inline label editor
      const tok = state.tokens.find((tk) => tk.id === id)
      if (tok && tok.kind !== 'ball') {
        setEditingTokenId(id)
        setEditingTokenLabel(tok.label ?? '')
        setTimeout(() => tokenLabelRef.current?.focus(), 0)
      }
    }
  }, [tool, readOnly, dispatch, state.tokens])

  const commitTokenLabel = useCallback(() => {
    if (!editingTokenId) return
    const trimmed = editingTokenLabel.trim().slice(0, 3)
    if (trimmed) dispatch({ type: 'UPDATE_TOKEN_LABEL', id: editingTokenId, label: trimmed })
    setEditingTokenId(null); setEditingTokenLabel('')
  }, [editingTokenId, editingTokenLabel, dispatch])

  // ── Text overlay position ──

  const textOverlayStyle = useMemo(() => {
    if (!textInput || !svgRef.current) return undefined
    const svg = svgRef.current; const ctm = svg.getScreenCTM()
    if (!ctm) return undefined
    const { dx, dy } = canonicalToDisplay(textInput.cx, textInput.cy)
    const svgPt = svg.createSVGPoint()
    svgPt.x = FIELD_LEFT + dx * FIELD_W; svgPt.y = FIELD_TOP + dy * FIELD_H
    const screenPt = svgPt.matrixTransform(ctm)
    return { position: 'fixed' as const, left: screenPt.x, top: screenPt.y, transform: 'translate(-50%, -50%)', zIndex: 50 }
  }, [textInput])

  // Token label edit overlay
  const tokenEditStyle = useMemo(() => {
    if (!editingTokenId || !svgRef.current) return undefined
    const tok = state.tokens.find((tk) => tk.id === editingTokenId)
    if (!tok) return undefined
    const svg = svgRef.current; const ctm = svg.getScreenCTM()
    if (!ctm) return undefined
    const { dx, dy } = canonicalToDisplay(tok.x, tok.y)
    const svgPt = svg.createSVGPoint()
    svgPt.x = FIELD_LEFT + dx * FIELD_W; svgPt.y = FIELD_TOP + dy * FIELD_H
    const screenPt = svgPt.matrixTransform(ctm)
    return { position: 'fixed' as const, left: screenPt.x, top: screenPt.y - 30, transform: 'translate(-50%, -100%)', zIndex: 50 }
  }, [editingTokenId, state.tokens])

  const placedPlayerIds = useMemo(
    () => new Set(state.tokens.filter((tk) => tk.player_id).map((tk) => tk.player_id!)),
    [state.tokens],
  )

  // ── Render ──

  if (loading) return <LoadingSpinner />
  if (error) {
    return <div className="mx-auto max-w-6xl px-4 py-8"><EmptyState icon={<AlertTriangle size={20} />} title={t('tactics.error.loadFailed')} description={error} /></div>
  }

  // Drawing layer interactive when tool is select, text, or eraser (not pen)
  const drawingInteractive = !readOnly && (tool === 'eraser' || tool === 'select' || tool === 'text')

  const drawingLayer = (
    <>
      <DrawingLayer elements={state.drawing} onElementClick={handleElementClick}
        onTextDrag={handleTextDrag} onTextDoubleClick={handleTextDoubleClick}
        interactive={drawingInteractive} svgRef={svgRef} />
      {/* Draft stroke path — rendered live during pen drawing */}
      <path ref={draftPathRef} fill="none"
        stroke={COLOR_MAP[color]} strokeWidth={WIDTH_MAP[strokeWidth]}
        strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
    </>
  )

  const boardTokens = state.tokens.map((tok) => {
    const player = tok.player_id ? teamPlayers.find((p) => p.id === tok.player_id) : undefined
    return (
      <BoardToken key={tok.id} id={tok.id} kind={tok.kind} x={tok.x} y={tok.y} label={tok.label}
        playerName={player?.last_name} selected={editingTokenId === tok.id}
        interactive={!readOnly && (tool === 'select' || tool === 'eraser')}
        onDragMove={handleTokenDragMove} onDragEnd={() => {}} onClick={handleTokenClick} svgRef={svgRef} />
    )
  })

  // ── Players panel ──

  const playersPanel = (
    <div className="flex h-full flex-col overflow-hidden rounded-xl bg-cf-surface ring-1 ring-cf-border">
      <h3 className="border-b border-cf-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-cf-muted-foreground">
        {t('tactics.board.players')}
      </h3>
      <div className="flex-1 overflow-y-auto">
        {/* Add token buttons */}
        {!readOnly && (
          <div className="flex gap-1 border-b border-cf-border px-3 py-2">
            <button onClick={() => addToken('home', 0.3)} className="flex items-center gap-1 rounded bg-cf-muted px-2 py-1 text-xs font-medium text-cf-surface-foreground hover:bg-cf-border"
              title={t('tactics.board.addHome')}>
              <Circle size={10} className="fill-white stroke-gray-400" />{t('tactics.board.addPlayerShort')}
            </button>
            <button onClick={() => addToken('away', 0.7)} className="flex items-center gap-1 rounded bg-cf-muted px-2 py-1 text-xs font-medium text-cf-surface-foreground hover:bg-cf-border"
              title={t('tactics.board.addAway')}>
              <Circle size={10} className="fill-red-500 stroke-red-600" />{t('tactics.board.addOpponentShort')}
            </button>
            <button onClick={() => addToken('ball', 0.5)} className="flex items-center gap-1 rounded bg-cf-muted px-2 py-1 text-xs font-medium text-cf-surface-foreground hover:bg-cf-border"
              disabled={state.tokens.some((tk) => tk.kind === 'ball')} title={t('tactics.board.addBall')}>
              <Circle size={8} className="fill-yellow-400 stroke-yellow-500" />
            </button>
          </div>
        )}

        {/* Team select */}
        {!readOnly && teams.length > 0 && (
          <div className="border-b border-cf-border px-3 py-2">
            <select value={selectedTeamId ?? ''} onChange={(e) => handleTeamChange(e.target.value)}
              className="w-full rounded border border-cf-border bg-transparent px-2 py-1 text-xs text-cf-surface-foreground focus:outline-none focus:ring-1 focus:ring-cf-brand">
              <option value="">{t('tactics.board.noTeam')}</option>
              {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </select>
          </div>
        )}

        {/* Player list */}
        {selectedTeamId && teamPlayers.length > 0 ? (
          <ul className="space-y-0.5 p-2">
            {teamPlayers.map((p) => {
              const placed = placedPlayerIds.has(p.id)
              return (
                <li key={p.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-cf-muted">
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-xs', placed ? 'text-cf-muted-foreground line-through' : 'text-cf-surface-foreground font-medium')}>
                      {p.jersey_number != null && <span className="mr-1 tabular-nums text-cf-muted-foreground">#{p.jersey_number}</span>}
                      {p.first_name} {p.last_name}
                    </p>
                    {p.preferred_position && <p className="text-[10px] text-cf-muted-foreground">{p.preferred_position}</p>}
                  </div>
                  {!readOnly && !placed && (
                    <button onClick={() => addPlayerToken(p)}
                      className="shrink-0 rounded bg-cf-brand p-0.5 text-cf-brand-foreground hover:bg-cf-brand-hover" title={t('tactics.board.addToPitch')}>
                      <Plus size={12} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        ) : selectedTeamId ? (
          <p className="py-4 text-center text-xs text-cf-muted-foreground">{t('common.loading')}</p>
        ) : (
          <p className="px-3 py-4 text-center text-xs text-cf-muted-foreground">{t('tactics.board.noTeamHint')}</p>
        )}
      </div>
    </div>
  )

  // ── Board list panel ──

  const boardListPanel = (
    <div className="absolute inset-y-0 right-0 z-30 flex w-72 flex-col bg-cf-surface shadow-xl ring-1 ring-cf-border lg:right-4">
      <div className="flex items-center justify-between border-b border-cf-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-cf-muted-foreground">{t('tactics.board.myBoards')}</span>
        <button onClick={() => setShowBoardList(false)} className="rounded p-1 text-cf-muted-foreground hover:text-cf-surface-foreground"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {boardListLoading ? <LoadingSpinner /> : boardList.length === 0 ? (
          <p className="py-4 text-center text-xs text-cf-muted-foreground">{t('tactics.board.emptyTitle')}</p>
        ) : (
          <ul className="space-y-1">
            {[...boardList].sort((a, b) => (a.created_by === user?.id ? -1 : 1) - (b.created_by === user?.id ? -1 : 1)).map((b) => {
              const isOwn = b.created_by === user?.id; const isCurrent = b.id === boardId
              return (
                <li key={b.id} className={cn('group flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer transition-colors',
                  isCurrent ? 'bg-cf-brand/10 ring-1 ring-cf-brand/30' : 'hover:bg-cf-muted')} onClick={() => openBoard(b)}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-cf-surface-foreground">{b.title}
                      {!isOwn && <Badge className="ml-1.5"><Eye size={9} className="mr-0.5" />{t('tactics.board.viewOnly')}</Badge>}</p>
                    <p className="text-xs text-cf-muted-foreground">{b.game_format}v{b.game_format}{b.created_by_name && <> · {b.created_by_name}</>}{' · '}{new Date(b.updated_at).toLocaleDateString()}</p>
                  </div>
                  {isOwn && !isCurrent && (
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteBoard(b.id) }}
                      className="shrink-0 rounded p-1 text-cf-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500"><Trash2 size={13} /></button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )

  // ── Toolbar ──

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-cf-surface px-3 py-1.5 ring-1 ring-cf-border">
      {!readOnly && (
        <>
          <button onClick={handleNew} className="rounded p-1.5 text-cf-muted-foreground hover:bg-cf-muted" title={t('tactics.board.newBoard')}><FilePlus2 size={15} /></button>
          <button onClick={loadBoardList} className="rounded p-1.5 text-cf-muted-foreground hover:bg-cf-muted" title={t('tactics.board.myBoards')}><FolderOpen size={15} /></button>
          <div className="hidden h-4 w-px bg-cf-border sm:block" />
        </>
      )}
      {readOnly ? (
        <span className="text-sm font-semibold text-cf-surface-foreground truncate max-w-[200px]">{state.title}</span>
      ) : (
        <input value={state.title} onChange={(e) => dispatch({ type: 'SET_TITLE', title: e.target.value })}
          className="w-40 rounded border-0 bg-transparent px-1 py-0.5 text-sm font-semibold text-cf-surface-foreground focus:outline-none focus:ring-1 focus:ring-cf-brand" maxLength={120} />
      )}
      {isNewBoard && !readOnly && <Badge variant="amber">{t('tactics.board.unsaved')}</Badge>}
      {readOnly && <Badge><Eye size={11} className="mr-1" />{t('tactics.board.viewOnly')}</Badge>}
      <div className="hidden h-4 w-px bg-cf-border sm:block" />
      {!readOnly && (
        <>
          {([['select', MousePointer2], ['pen', Pen], ['text', Type], ['eraser', Eraser]] as const).map(([t2, Icon]) => (
            <button key={t2} onClick={() => setTool(t2 as Tool)}
              className={cn('rounded p-1.5 transition-colors', tool === t2 ? 'bg-cf-brand text-cf-brand-foreground' : 'text-cf-muted-foreground hover:bg-cf-muted')}
              title={t(`tactics.board.tool${t2.charAt(0).toUpperCase() + t2.slice(1)}`)}><Icon size={15} /></button>
          ))}
          <div className="hidden h-4 w-px bg-cf-border sm:block" />
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)}
              className={cn('h-5 w-5 rounded-full border-2 transition-transform', COLOR_CSS[c],
                color === c ? 'scale-125 ring-2 ring-cf-brand ring-offset-1' : 'opacity-60 hover:opacity-100')} aria-label={c} />
          ))}
          <div className="flex gap-0.5">
            {WIDTHS.map((w) => (
              <button key={w} onClick={() => setStrokeWidth(w)}
                className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold',
                  strokeWidth === w ? 'bg-cf-brand text-cf-brand-foreground' : 'text-cf-muted-foreground hover:bg-cf-muted')}>{w.toUpperCase()}</button>
            ))}
          </div>
        </>
      )}
      <div className="flex-1" />
      <Badge>{state.gameFormat}v{state.gameFormat}</Badge>
      {!readOnly && (
        <>
          <button onClick={undo} disabled={!canUndo} className="rounded p-1 text-cf-muted-foreground hover:bg-cf-muted disabled:opacity-30" aria-label={t('tactics.undo')}><Undo2 size={15} /></button>
          <button onClick={redo} disabled={!canRedo} className="rounded p-1 text-cf-muted-foreground hover:bg-cf-muted disabled:opacity-30" aria-label={t('tactics.redo')}><Redo2 size={15} /></button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!state.isDirty || saving}>
            <Save size={13} />{saving ? t('tactics.saving') : t('common.save')}
          </Button>
        </>
      )}
    </div>
  )

  const textOverlay = textInput && textOverlayStyle && (
    <input ref={textInputRef} value={textValue} onChange={(e) => setTextValue(e.target.value.slice(0, 120))}
      onKeyDown={(e) => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') { setTextInput(null); setTextValue('') } }}
      onBlur={commitText} style={textOverlayStyle}
      className="w-40 rounded border border-cf-brand bg-cf-surface px-2 py-1 text-sm text-cf-surface-foreground shadow-lg focus:outline-none"
      placeholder={t('tactics.board.textPlaceholder')} maxLength={120} />
  )

  const tokenLabelOverlay = editingTokenId && tokenEditStyle && (
    <input ref={tokenLabelRef} value={editingTokenLabel} onChange={(e) => setEditingTokenLabel(e.target.value.slice(0, 3))}
      onKeyDown={(e) => { if (e.key === 'Enter') commitTokenLabel(); if (e.key === 'Escape') { setEditingTokenId(null); setEditingTokenLabel('') } }}
      onBlur={commitTokenLabel} style={tokenEditStyle}
      className="w-16 rounded border border-cf-brand bg-cf-surface px-2 py-1 text-center text-sm font-bold text-cf-surface-foreground shadow-lg focus:outline-none"
      maxLength={3} />
  )

  return (
    <>
      {/* Mobile */}
      <div className="flex flex-col gap-3 px-4 py-4 md:hidden">
        <TacticsPitch gameFormat={state.gameFormat} svgRef={svgRef} drawingLayer={drawingLayer}>{boardTokens}</TacticsPitch>
        <p className="text-center text-sm text-cf-muted-foreground">{t('tactics.mobileHint')}</p>
      </div>

      {/* Tablet (md–lg) */}
      <div className="hidden md:flex lg:hidden flex-col" style={{ height: 'calc(100dvh - 3rem)' }}>
        <div className="flex-shrink-0 px-3 pt-2 pb-1">{toolbar}</div>
        {saveError && <div className="mx-3 mb-1 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{saveError}</div>}
        <div className="relative flex-1 min-h-0 px-3 pb-2">
          <div className="h-full w-full">
            <TacticsPitch gameFormat={state.gameFormat} svgRef={svgRef} drawingLayer={drawingLayer}
              onPointerDown={handlePitchPointerDown} onPointerMove={handlePitchPointerMove} onPointerUp={handlePitchPointerUp}>
              {boardTokens}
            </TacticsPitch>
          </div>
          {textOverlay}{tokenLabelOverlay}
          <button onClick={() => setPanelOpen((o) => !o)}
            className="absolute right-5 top-2 z-10 rounded-lg bg-cf-surface/90 p-2 shadow ring-1 ring-cf-border backdrop-blur">
            {panelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
          {panelOpen && <div className="absolute inset-y-0 right-3 z-20 w-56 shadow-xl">{playersPanel}</div>}
          {showBoardList && boardListPanel}
        </div>
      </div>

      {/* Desktop (lg+) */}
      <div className="hidden lg:flex flex-col" style={{ height: 'calc(100dvh - 3rem)' }}>
        <div className="flex-shrink-0 px-4 pt-2 pb-1">{toolbar}</div>
        {saveError && (
          <div className="mx-4 mb-1 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {saveError}{saveError === t('tactics.error.versionConflict') && <button onClick={() => window.location.reload()} className="ml-2 font-medium underline">{t('tactics.reload')}</button>}
          </div>
        )}
        <div className="relative flex flex-1 min-h-0 gap-3 px-4 pb-2">
          <div className="relative flex-1 min-w-0">
            <TacticsPitch gameFormat={state.gameFormat} svgRef={svgRef} drawingLayer={drawingLayer}
              onPointerDown={handlePitchPointerDown} onPointerMove={handlePitchPointerMove} onPointerUp={handlePitchPointerUp}>
              {boardTokens}
            </TacticsPitch>
            {textOverlay}{tokenLabelOverlay}
          </div>
          <div className="w-56 flex-shrink-0">{playersPanel}</div>
          {showBoardList && boardListPanel}
        </div>
      </div>
    </>
  )
}
