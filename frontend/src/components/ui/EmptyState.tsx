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
        'flex flex-col items-center justify-center rounded-2xl px-6 py-12 text-center ring-1',
        'bg-cf-muted text-cf-surface-foreground ring-cf-border',
        className,
      )}
    >
      {icon != null && (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cf-surface ring-1 ring-cf-border text-cf-muted-foreground">
          {typeof icon === 'string'
            ? <span className="text-2xl">{icon}</span>
            : icon}
        </div>
      )}
      <p className="mt-4 font-medium text-cf-surface-foreground">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-cf-muted-foreground">{description}</p>
      )}
    </div>
  )
}
