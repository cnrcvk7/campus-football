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
        'rounded-2xl p-6 shadow-sm ring-1',
        'bg-cf-surface text-cf-surface-foreground ring-cf-border',
        className,
      )}
    >
      <p className="text-sm font-medium text-cf-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold text-cf-surface-foreground">{value}</p>
      {description && (
        <p className="mt-1 text-sm text-cf-muted-foreground">{description}</p>
      )}
    </div>
  )
}
