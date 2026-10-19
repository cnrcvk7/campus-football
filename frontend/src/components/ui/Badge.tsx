import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset',
  {
    variants: {
      variant: {
        default: 'bg-cf-muted text-cf-muted-foreground ring-cf-border',
        emerald: [
          'bg-emerald-50 text-emerald-700 ring-emerald-200',
          'dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800',
        ],
        sky: [
          'bg-sky-50 text-sky-700 ring-sky-200',
          'dark:bg-sky-950 dark:text-sky-400 dark:ring-sky-800',
        ],
        violet: [
          'bg-violet-50 text-violet-700 ring-violet-200',
          'dark:bg-violet-950 dark:text-violet-400 dark:ring-violet-800',
        ],
        amber: [
          'bg-amber-50 text-amber-700 ring-amber-200',
          'dark:bg-amber-950 dark:text-amber-400 dark:ring-amber-800',
        ],
        red: [
          'bg-red-50 text-red-700 ring-red-200',
          'dark:bg-red-950 dark:text-red-400 dark:ring-red-800',
        ],
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  children: React.ReactNode
  className?: string
}

export default function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)}>
      {children}
    </span>
  )
}
