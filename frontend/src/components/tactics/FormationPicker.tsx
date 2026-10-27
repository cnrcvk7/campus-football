/**
 * Game format selector + formation dropdown.
 */

import { useTranslation } from 'react-i18next'
import { FORMATIONS_BY_FORMAT, GAME_FORMATS } from '../../constants/formations'
import type { GameFormat } from '../../types/tactics'

interface FormationPickerProps {
  gameFormat: GameFormat
  formation: string
  onFormatChange: (format: GameFormat) => void
  onFormationChange: (formation: string) => void
}

export default function FormationPicker({
  gameFormat,
  formation,
  onFormatChange,
  onFormationChange,
}: FormationPickerProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-3">
      {/* Game format */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-cf-muted-foreground">
          {t('tactics.gameFormat')}
        </label>
        <div className="flex gap-1">
          {GAME_FORMATS.map((f) => (
            <button
              key={f}
              onClick={() => onFormatChange(f)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                gameFormat === f
                  ? 'bg-cf-brand text-cf-brand-foreground'
                  : 'bg-cf-muted text-cf-muted-foreground ring-1 ring-cf-border hover:bg-cf-border'
              }`}
            >
              {f}v{f}
            </button>
          ))}
        </div>
      </div>

      {/* Formation */}
      <div>
        <label
          htmlFor="formation-select"
          className="mb-1 block text-xs font-semibold uppercase tracking-wide text-cf-muted-foreground"
        >
          {t('tactics.formation')}
        </label>
        <select
          id="formation-select"
          value={formation}
          onChange={(e) => onFormationChange(e.target.value)}
          className="w-full rounded border border-cf-border bg-cf-surface px-3 py-1.5 text-sm text-cf-surface-foreground focus:outline-none focus:ring-2 focus:ring-cf-brand"
        >
          {FORMATIONS_BY_FORMAT[gameFormat].map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
