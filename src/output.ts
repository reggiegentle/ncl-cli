export type CliError = { code: string; message: string; retryable: boolean; http?: { status: number }; detail?: string };
export type OkEnvelope<T> = { ok: true; data: T; meta?: Record<string, unknown> };
export type FailEnvelope = { ok: false; error: CliError; meta?: Record<string, unknown> };

export function codeError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

export function ok<T>(data: T, meta?: Record<string, unknown>): OkEnvelope<T> {
  return meta ? { ok: true, data, meta } : { ok: true, data };
}

export function fail(error: CliError, meta?: Record<string, unknown>): FailEnvelope {
  return meta ? { ok: false, error, meta } : { ok: false, error };
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function toErrorCode(err: any): string {
  if (typeof err?.code === "string" && err.code.trim()) return err.code;
  const status = err?.status as number | undefined;
  if (status === 401 || status === 403) return "AUTH_INVALID";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (typeof status === "number" && status >= 500) return "UPSTREAM_5XX";
  if (err?.name === "AbortError") return "TIMEOUT";
  return "UNKNOWN";
}

export function makeError(err: any, override: { code?: string; message?: string } = {}): CliError {
  const status = err?.status as number | undefined;
  const code = override.code || toErrorCode(err);
  const message = override.message || err?.message || "Request failed";
  const retryable = code === "RATE_LIMITED" || code === "UPSTREAM_5XX" || code === "TIMEOUT";
  const error: CliError = { code, message, retryable };
  if (typeof status === "number") error.http = { status };
  return error;
}
