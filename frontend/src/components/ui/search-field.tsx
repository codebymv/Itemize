import * as React from "react"
import { Loader2, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface SearchFieldProps
  extends Omit<React.ComponentProps<typeof Input>, "onChange" | "type" | "value"> {
  value: string
  onValueChange: (value: string) => void
  label: string
  containerClassName?: string
  loading?: boolean
  showClear?: boolean
}

const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  (
    {
      value,
      onValueChange,
      label,
      containerClassName,
      className,
      loading = false,
      showClear = true,
      onKeyDown,
      ...props
    },
    ref,
  ) => (
    <div className={cn("relative min-w-0", containerClassName)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        {...props}
        ref={ref}
        type="search"
        value={value}
        aria-label={label}
        aria-busy={loading || undefined}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault()
            onValueChange("")
          }
          onKeyDown?.(event)
        }}
        className={cn(
          "pl-10 [&::-webkit-search-cancel-button]:appearance-none",
          (loading || (showClear && value)) && "pr-10",
          className,
        )}
      />
      {loading ? (
        <Loader2
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary"
        />
      ) : showClear && value ? (
        <Button
          type="button"
          variant="ghost"
          size="iconCompact"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => onValueChange("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  ),
)
SearchField.displayName = "SearchField"

export { SearchField }
