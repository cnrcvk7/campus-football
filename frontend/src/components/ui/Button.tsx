import { cva, type VariantProps } from 'class-variance-authority'
import { type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-1.5 font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
    'disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-cf-brand text-cf-brand-foreground hover:bg-cf-brand-hover',
        secondary:
          'bg-cf-surface text-cf-surface-foreground ring-1 ring-cf-border hover:bg-cf-muted',
        ghost:
          'text-cf-muted-foreground hover:bg-cf-muted hover:text-cf-surface-foreground',
        danger:
          'bg-red-500 text-white hover:bg-red-600',
        link:
          'text-cf-muted-foreground underline-offset-4 hover:text-cf-surface-foreground hover:underline',
      },
      size: {
        sm: 'h-7 rounded px-2.5 text-xs',
        md: 'h-8 rounded-md px-3 text-sm',
        lg: 'h-9 rounded-md px-4 text-sm',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export default function Button({ variant, size, className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
