export const boundedInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
};

export const optionalPositiveInteger = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error('Target workflow job ID must be a positive integer');
  }
  return parsed;
};

export const workflowJobBackoffMs = (
  attempt: number,
  baseDelayMs: number,
  maximumDelayMs: number,
): number => Math.min(maximumDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)));

export const redactWorkflowJobError = (error: unknown): string =>
  String(error instanceof Error ? error.message : error || 'Workflow job failed')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\+\d{7,15}\b/g, '[redacted-phone]')
    .replace(/\b(?:re|sk|whsec|AC|SK)_[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
    .slice(0, 500);

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export const workflowTriggerMatches = (
  triggerConfig: unknown,
  eventPayload: unknown,
): boolean => {
  const config = record(triggerConfig);
  const payload = record(eventPayload);
  if (Object.keys(config).length === 0) return true;

  if (config.tag_name && payload.tag !== config.tag_name) return false;
  if (config.stage_id !== undefined) {
    const stage = payload.newStageId ?? payload.newStage;
    if (stage === undefined || String(config.stage_id) !== String(stage)) return false;
  }
  if (config.pipeline_id !== undefined) {
    const pipeline = payload.pipeline_id ?? record(payload.deal).pipeline_id;
    if (pipeline === undefined || String(config.pipeline_id) !== String(pipeline)) return false;
  }
  if (config.source && payload.source !== config.source) return false;
  if (config.form_id !== undefined) {
    const form = record(payload.form).id ?? payload.form_id;
    if (form === undefined || String(config.form_id) !== String(form)) return false;
  }
  return true;
};
