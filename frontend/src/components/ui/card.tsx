import * as React from "react"

import { cn } from "@/lib/utils"

export type CardSurface = "frame" | "inset"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: CardSurface
  interactive?: boolean
}

export type CardContentSurface = "plain" | "inset"

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: CardContentSurface
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, surface = "frame", interactive = false, ...props }, ref) => (
  <div
    ref={ref}
    data-card-surface={surface}
    data-interactive={interactive || undefined}
    className={cn(
      "min-w-0 rounded-lg border bg-card text-card-foreground shadow-sm",
      surface === "inset" && "bg-[hsl(var(--background-alt))]",
      interactive && "interaction-card cursor-pointer",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(({ className, surface = "plain", ...props }, ref) => (
  <div
    ref={ref}
    data-card-content-surface={surface}
    className={cn(
      surface === "inset"
        ? "mx-4 mb-4 min-w-0 rounded-lg border bg-[hsl(var(--background-alt))] p-4 sm:mx-6 sm:mb-6 sm:p-5"
        : "p-6 pt-0",
      className
    )}
    {...props}
  />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
