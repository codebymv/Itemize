import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "interaction-button--primary bg-primary text-primary-foreground",
        destructive:
          "interaction-button--destructive bg-destructive text-destructive-foreground",
        destructiveGhost:
          "interaction-button--destructive-ghost text-destructive",
        outline:
          "interaction-button--neutral border border-input bg-background",
        secondary:
          "interaction-button--neutral bg-secondary text-secondary-foreground",
        ghost: "interaction-button--neutral",
        link: "interaction-button--link text-primary underline-offset-4",
        toggle:
          "interaction-button--neutral border border-transparent bg-transparent aria-pressed:border-primary/50 aria-pressed:bg-primary/10 aria-pressed:text-primary data-[state=on]:border-primary/50 data-[state=on]:bg-primary/10 data-[state=on]:text-primary",
      },
      size: {
        default: "h-11 px-4 py-2",
        compact: "h-8 rounded-md px-2 text-xs",
        toolbar: "h-9 rounded-md px-3",
        sm: "h-10 rounded-md px-3",
        lg: "h-12 rounded-md px-8",
        icon: "h-11 w-11",
        iconCompact: "h-8 w-8",
        iconToolbar: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
