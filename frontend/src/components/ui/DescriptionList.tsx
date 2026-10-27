import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

export interface DescriptionItem {
  label: string
  value: ReactNode
  icon?: ReactNode
}

/** Compact label/value rows for record details. Items with an empty value are skipped. */
export default function DescriptionList({ items, className }: { items: DescriptionItem[]; className?: string }) {
  const visible = items.filter((i) => i.value != null && i.value !== '')

  return (
    <dl className={cn('divide-y divide-cf-border', className)}>
      {visible.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="flex items-center gap-1.5 text-xs text-cf-muted-foreground">
            {item.icon}
            {item.label}
          </dt>
          <dd className="text-right text-sm font-medium text-cf-surface-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
