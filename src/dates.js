// Eastern-time calendar-day helpers. Everything on the board is bucketed by
// the ET calendar day a job was finished, never by UTC day.

export const ET = "America/New_York";

// "YYYY-MM-DD" for the ET calendar day an instant falls on.
export function etDateKey(isoOrDate) {
  if (!isoOrDate) return null;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = t => parts.find(p => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function keyToUTCNoon(key) {
  return new Date(`${key}T12:00:00Z`);
}

export function addDaysKey(key, n) {
  return new Date(keyToUTCNoon(key).getTime() + n * 86400000).toISOString().slice(0, 10);
}

// Monday of the week containing `key`.
export function mondayKey(key) {
  const dow = keyToUTCNoon(key).getUTCDay(); // 0 = Sun
  return addDaysKey(key, dow === 0 ? -6 : 1 - dow);
}

export const inRange = (key, from, to) => key != null && key >= from && key <= to;

// "Jan 1 – Oct 6" style label from two keys.
export function fmtKeyRange(fromKey, toKey) {
  const f = k => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" })
    .format(keyToUTCNoon(k));
  return `${f(fromKey)} – ${f(toKey)}`;
}
