import * as React from "react"

const COARSE_POINTER_QUERY = "(pointer: coarse)"

/**
 * True when the primary input is a finger. Use this, not the viewport width,
 * to choose between touch and pointer modalities (a bottom sheet versus a
 * popover, a drag delay, a thicker stroke). Width decisions belong to
 * container queries; see design-system/index.md "Width decisions".
 */
export function useCoarsePointer() {
  const [coarse, setCoarse] = React.useState<boolean>(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(COARSE_POINTER_QUERY).matches
      : false,
  )

  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const mql = window.matchMedia(COARSE_POINTER_QUERY)
    const onChange = () => setCoarse(mql.matches)
    mql.addEventListener("change", onChange)
    setCoarse(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return coarse
}
