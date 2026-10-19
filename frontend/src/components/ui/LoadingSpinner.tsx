import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'

interface LoadingSpinnerProps {
  /**
   * 'page' — centred in the content area (default, occupies ~40 vh)
   * 'inline' — small spinner for use inside a container
   */
  size?: 'page' | 'inline'
  className?: string
}

export default function LoadingSpinner({ size = 'page', className }: LoadingSpinnerProps) {
  const { t } = useTranslation()

  if (size === 'inline') {
    return (
      <div className={cn('flex items-center justify-center py-6', className)}>
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-cf-border border-t-emerald-500" />
      </div>
    )
  }

  return (
    <div className={cn('flex min-h-[40vh] items-center justify-center', className)}>
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cf-border border-t-emerald-500" />
        <p className="text-xs text-cf-muted-foreground">{t('common.loading')}</p>
      </div>
    </div>
  )
}
