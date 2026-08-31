export function pickFittingValue(availableWidth: number, candidateWidths: readonly number[]): number {
  if (availableWidth <= 0 || candidateWidths.length === 0) return 0;
  const fittingIndex = candidateWidths.findIndex((width) => width <= availableWidth);
  return fittingIndex >= 0 ? fittingIndex : candidateWidths.length - 1;
}
