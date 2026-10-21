import { useTranslation } from 'react-i18next'
import Button from './Button'
import { cn } from '../../lib/utils'

interface PaginationProps {
  page: number
  totalPages: number
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  disabled?: boolean
  className?: string
}

/** Previous / "Page X of Y" / Next bar for server-paginated lists. */
export default function Pagination({
  page,
  totalPages,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  disabled = false,
  className,
}: PaginationProps) {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('pagination.page')}
      className={cn('flex items-center justify-between gap-3', className)}
    >
      <Button variant="secondary" onClick={onPrev} disabled={!hasPrev || disabled}>
        {t('pagination.previous')}
      </Button>
      <p className="text-sm text-cf-muted-foreground">
        {t('pagination.page')}{' '}
        <span className="font-semibold text-cf-surface-foreground">{page}</span>
        {' '}{t('pagination.of')}{' '}
        <span className="font-semibold text-cf-surface-foreground">{totalPages}</span>
      </p>
      <Button variant="secondary" onClick={onNext} disabled={!hasNext || disabled}>
        {t('pagination.next')}
      </Button>
    </nav>
  )
}
