import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-accent-ink text-white hover:brightness-110 dark:text-main',
        dark: 'bg-main text-white hover:brightness-125 dark:bg-surface-2',
        outline: 'bg-surface-2 text-ink hover:brightness-95 dark:hover:brightness-125',
        ghost: 'text-ink hover:bg-surface-2',
        soft: 'bg-accent-soft text-accent-ink hover:brightness-95',
        danger: 'border border-line bg-surface text-up hover:bg-up-soft',
      },
      size: {
        sm: 'h-8 px-2.5 text-[13px]',
        md: 'h-10 px-3.5',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'outline', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  )
}
