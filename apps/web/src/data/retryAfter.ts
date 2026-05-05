// RFC 7231 §7.1.3: `Retry-After` is either delta-seconds (digits) or an HTTP-date
// (RFC 5322). The retry policy on `useCreateTask` honors the value only for 429
// responses (rate-limit floor) — 5xx Retry-After is informational and not used.
export const parseRetryAfter = (value: string | null): number | undefined => {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10) * 1000;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return undefined;
  return Math.max(0, ms - Date.now());
};
