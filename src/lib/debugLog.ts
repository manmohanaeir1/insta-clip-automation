const namespace = 'InstaClip';

export function debugStep(step: string, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();

  if (details) {
    console.log(`[${namespace}] ${timestamp} ${step}`, sanitizeDetails(details));
    return;
  }

  console.log(`[${namespace}] ${timestamp} ${step}`);
}

export function debugError(step: string, error: unknown, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const payload = {
    ...details,
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error)
  };

  console.error(`[${namespace}] ${timestamp} ${step}`, sanitizeDetails(payload));
}

function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => {
      if (typeof value === 'string' && value.length > 220) {
        return [key, `${value.slice(0, 220)}...`];
      }

      return [key, value];
    })
  );
}
