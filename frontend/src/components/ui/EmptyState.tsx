import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  className?: string
}

export default function EmptyState({ icon, title, description, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl px-6 py-8 text-center ring-1',
        'bg-cf-muted text-cf-surface-foreground ring-cf-border',
        className,
      )}
    >
      {icon != null && (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cf-surface ring-1 ring-cf-border text-cf-muted-foreground">
          {typeof icon === 'string'
            ? <span className="text-lg">{icon}</span>
            : icon}
        </div>
      )}
      <p className={cn('text-sm font-medium text-cf-surface-foreground', icon != null && 'mt-3')}>
        {title}
      </p>
      {description && (
        <p className="mt-1 text-xs text-cf-muted-foreground max-w-xs">{description}</p>
      )}
    </div>
  )
}
