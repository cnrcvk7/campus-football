import { useEffect, useState } from 'react'
import { playerService } from '../services/playerService'
import type {
  DevelopmentTimeline,
  MatchHistory,
  MatchSummary,
  Player,
  PlayerHistory,
  TrainingHistory,
} from '../types'

interface PlayerProfileState {
  loading: boolean
  error: string | null
  player: Player | null
  history: PlayerHistory | null
  timeline: DevelopmentTimeline | null
  matchHistory: MatchHistory | null
  matchSummary: MatchSummary | null
  trainingHistory: TrainingHistory | null
}

const INITIAL_STATE: PlayerProfileState = {
  loading: true,
  error: null,
  player: null,
  history: null,
  timeline: null,
  matchHistory: null,
  matchSummary: null,
  trainingHistory: null,
}

export function usePlayerProfile(playerId: string): PlayerProfileState {
  const [state, setState] = useState<PlayerProfileState>(INITIAL_STATE)

  useEffect(() => {
    setState(INITIAL_STATE)

    Promise.all([
      playerService.get(playerId),
      playerService.getHistory(playerId),
      playerService.getDevelopmentTimeline(playerId),
      playerService.getMatchHistory(playerId),
      playerService.getMatchSummary(playerId),
      playerService.getTrainingHistory(playerId),
    ])
      .then(([player, history, timeline, matchHistory, matchSummary, trainingHistory]) => {
        setState({
          loading: false,
          error: null,
          player,
          history,
          timeline,
          matchHistory,
          matchSummary,
          trainingHistory,
        })
      })
      .catch((err: unknown) => {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load player data.',
        }))
      })
  }, [playerId])

  return state
}
