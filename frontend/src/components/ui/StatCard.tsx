import { cn } from '../../lib/utils'

interface StatCardProps {
  label: string
  value: string
  description?: string
  className?: string
}

export default function StatCard({ label, value, description, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl p-4 ring-1',
        'bg-cf-surface text-cf-surface-foreground ring-cf-border',
        className,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-cf-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold text-cf-surface-foreground leading-none">
        {value}
      </p>
      {description && (
        <p className="mt-1 text-xs text-cf-muted-foreground">{description}</p>
      )}
    </div>
  )
}
