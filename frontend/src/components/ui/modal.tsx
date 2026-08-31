import * as React from 'react'
import type { LucideIcon } from 'lucide-react'

import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const modalWidths = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  studio: 'h-dvh max-h-dvh w-screen max-w-none rounded-none sm:h-[90dvh] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:rounded-lg',
} as const

type ModalContentProps = React.ComponentPropsWithoutRef<typeof DialogContent> & {
  size?: keyof typeof modalWidths
}

const ModalContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  ModalContentProps
>(({ className, size = 'md', ...props }, ref) => (
  <DialogContent
    ref={ref}
    className={cn(
      'flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[90dvh]',
      modalWidths[size],
      className,
    )}
    {...props}
  />
))
ModalContent.displayName = 'ModalContent'

interface ModalHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: React.ReactNode
  description: React.ReactNode
  icon?: LucideIcon
  leading?: React.ReactNode
  actions?: React.ReactNode
  descriptionVisuallyHidden?: boolean
}

function ModalHeader({
  title,
  description,
  icon: Icon,
  leading,
  actions,
  descriptionVisuallyHidden = false,
  className,
  ...props
}: ModalHeaderProps) {
  return (
    <DialogHeader
      className={cn('shrink-0 border-b px-6 py-4 pr-12 text-left', className)}
      {...props}
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
            {leading}
            {Icon ? <Icon className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" /> : null}
            <span className="truncate">{title}</span>
          </DialogTitle>
          <DialogDescription
            className={cn('mt-1', descriptionVisuallyHidden && 'sr-only')}
          >
            {description}
          </DialogDescription>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </DialogHeader>
  )
}

const ModalBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-5', className)}
    {...props}
  />
))
ModalBody.displayName = 'ModalBody'

function ModalFooter({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogFooter>) {
  return (
    <DialogFooter
      className={cn('shrink-0 border-t px-6 py-4', className)}
      {...props}
    />
  )
}

function ModalSection({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <section className={cn('space-y-4', className)} {...props} />
}

export { ModalBody, ModalContent, ModalFooter, ModalHeader, ModalSection }
