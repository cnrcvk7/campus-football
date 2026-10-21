import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface PanelProps {
  title: string
  /** Optional count shown next to the title */
  count?: number
  /** Controls placed at the trailing edge of the header */
  action?: ReactNode
  children: ReactNode
  className?: string
  /** Class names for the body wrapper (default adds padding) */
  bodyClassName?: string
}

/**
 * Bordered content section with a compact header bar — used to group
 * related information on detail pages.
 */
export default function Panel({ title, count, action, children, className, bodyClassName }: PanelProps) {
  return (
    <section className={cn('overflow-hidden rounded-xl bg-cf-surface ring-1 ring-cf-border', className)}>
      <div className="flex min-h-[2.75rem] items-center justify-between gap-3 border-b border-cf-border px-4 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-cf-surface-foreground">
          {title}
          {count != null && (
            <span className="rounded bg-cf-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-cf-muted-foreground ring-1 ring-inset ring-cf-border">
              {count}
            </span>
          )}
        </h2>
        {action != null && <div className="flex flex-shrink-0 items-center gap-2">{action}</div>}
      </div>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}
