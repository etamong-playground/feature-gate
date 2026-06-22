/**
 * Today as YYYY-MM-DD in a given IANA timezone (default Asia/Seoul).
 *
 * Gate effective dates are calendar days, so they must be compared against
 * the calendar day in the service's jurisdiction — not UTC, which can be a
 * day off for KST users near midnight.
 *
 * Mirror of @etamong-lab/legal `todayISO()`. Kept here to avoid a downward
 * dependency (legal depends on feature-gate, not the other way around).
 */
export function todayISO(timeZone = "Asia/Seoul"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
