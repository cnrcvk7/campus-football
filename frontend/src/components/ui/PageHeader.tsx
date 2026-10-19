import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface PageHeaderProps {
  title: string
  /** Short contextual line shown beneath the title */
  subtitle?: string
  /** Buttons or other controls placed at the trailing edge */
  action?: ReactNode
  className?: string
}

/**
 * Consistent page title bar used at the top of every content area.
 * Renders title + optional subtitle on the left and an action slot on the right.
 */
export default function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold text-cf-surface-foreground leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-cf-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action != null && (
        <div className="flex flex-shrink-0 items-center gap-2">{action}</div>
      )}
    </div>
  )
}
