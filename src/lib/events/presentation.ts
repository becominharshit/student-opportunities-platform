export type DateFact = { text: string; dateTime: string | null; note?: string };
/** A calendar date is formatted as a calendar date, never interpreted in a visitor's zone. */
export function dateFact(localDate: string | null, instant: string | null, timezone: string | null): DateFact {
  if (instant && timezone) {
    try {
      const date = new Date(instant);
      const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: timezone }).format(date);
      const time = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: timezone }).format(date);
      return { text: `${day} · ${time} (${timezone})`, dateTime: instant };
    } catch { /* Fall back only to an explicitly stored calendar date. */ }
  }
  if (localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    const [year, month, day] = localDate.split("-").map(Number);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (months[month - 1] && day >= 1 && day <= 31)
      return { text: `${day} ${months[month - 1]} ${year}`, dateTime: localDate, note: "Exact time not provided" };
  }
  return { text: "Date not specified", dateTime: null };
}
export function publicHttps(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? value : null; }
  catch { return null; }
}
export function label(value: string | null, unknown = "Not specified") {
  if (!value || value === "unknown") return unknown;
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}
export function trustLabel(event: { verification_status: string; verification_level: string | null }) {
  if (event.verification_status !== "current") return "Verification needs refresh";
  return ({ verified: "Verified", source_confirmed: "Source Confirmed", community_submitted: "Community Submitted" })[event.verification_level ?? ""] ?? "Verification not established";
}
function amount(value: number | null, currency: string | null) {
  if (value === null || !Number.isFinite(value) || !currency) return null;
  return `${currency} ${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value)}`;
}
export function feeLabel(event: { fee: number | null; fee_max: number | null; currency: string | null; fee_status: string; fee_basis: string }) {
  if (event.fee_status === "free") return "Free";
  if (event.fee_status === "unknown") return "Fee not specified";
  const low = amount(event.fee, event.currency), high = amount(event.fee_max, event.currency);
  const basis = event.fee_basis === "person" ? " per person" : event.fee_basis === "team" ? " per team" : "";
  if (low && high && event.fee !== event.fee_max) return `${low}–${high}${basis}`;
  if (low) return `${event.fee_status === "varies" ? "From " : ""}${low}${basis}`;
  if (high) return `Up to ${high}${basis}`;
  return event.fee_status === "paid" ? "Paid · amount not specified" : "Fee varies · amount not specified";
}
export function prizeLabel(event: { prize_pool: number | null; prize_currency: string | null }) {
  return amount(event.prize_pool, event.prize_currency) ?? "Prize amount not specified";
}
export function teamLabel(event: { min_team_size: number | null; max_team_size: number | null }) {
  const { min_team_size: min, max_team_size: max } = event;
  if (min !== null && max !== null) return min === max ? `${min} participant${min === 1 ? "" : "s"}` : `${min}–${max} participants`;
  if (min !== null) return `At least ${min} participants; maximum not specified`;
  if (max !== null) return `Up to ${max} participants; minimum not specified`;
  return "Team size not specified";
}
