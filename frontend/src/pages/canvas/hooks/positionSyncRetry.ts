export function shouldRetryPositionSync(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (typeof status !== 'number') {
    return true;
  }
  return status === 429 || status >= 500;
}
