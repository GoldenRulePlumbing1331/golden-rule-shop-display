// Job-board data layer.
// Pulls scheduled jobs for a week and shapes them for the shop display.

import { getScheduledJobs } from "./hcp.js";
import { overrideFirstName } from "./name-overrides.js";

// Eastern Time helpers — Golden Rule is in PA, so the deck should reflect ET.
// We don't need a full tz library; Intl.DateTimeFormat handles it.

const ET = "America/New_York";

function formatTechDisplay(names, maxChars = 28) {
  if (!names || names.length === 0) return "[ UNASSIGNED ]";

// Use first names only; first names + last initials get long fast on a crew of 3-4.
  // The HCP first_name field is split on whitespace, then the override table is applied
  // so e.g. "R Kevin" → "Kevin" instead of truncating to just "R".
  const firsts = names.map(fullName => {
    // The fullName here is "First Last" (built from HCP's first_name + last_name).
    // We need the original first_name part, which is everything before the FINAL space.
    // But our shapeJob already concatenated, so the safest thing is: take everything
    // up to the last space as the "first name field", then run that through the override.
    const lastSpace = fullName.lastIndexOf(" ");
    const firstNameField = lastSpace > 0 ? fullName.slice(0, lastSpace) : fullName;
    const overridden = overrideFirstName(firstNameField);
    // Now apply our existing first-token rule to the (possibly overridden) value.
    return (overridden.split(/\s+/)[0] || overridden).trim();
  });

  // Single tech — show the full first name.
  if (firsts.length === 1) return firsts[0];

  // Multi-tech — start with all of them, peel off the back if too long,
  // and append "+N more" if we had to drop anyone.
  let included = [...firsts];
  let dropped = 0;

  // Keep removing from the end until we fit.
  // Format with no suffix first, then with "+N more" suffix once we drop one.
  while (included.length > 1) {
    const candidate = dropped === 0
      ? included.join(", ")
      : `${included.join(", ")} +${dropped}`;
    if (candidate.length <= maxChars) return candidate;
    included.pop();
    dropped += 1;
  }

  // Worst case: even one name + suffix doesn't fit. Show first + count.
  return `${included[0]} +${dropped}`;
}

function fmtDayET(isoString) {
  if (!isoString) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "short",
  }).format(new Date(isoString)).toUpperCase();
}

function fmtTimeET(isoString) {
  if (!isoString) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoString));
}

function fmtDateET(isoString) {
  // e.g. "Mon Apr 27"
  if (!isoString) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(isoString));
}

// Minutes between two ISO timestamps; null if missing.
function durationMinutes(startISO, endISO) {
  if (!startISO || !endISO) return null;
  return Math.round((new Date(endISO) - new Date(startISO)) / 60000);
}

// Human-readable duration, e.g. "1 hr", "2.5 hrs", "FULL DAY"
function fmtDuration(mins) {
  if (mins == null) return "—";
  if (mins >= 7 * 60) return "FULL DAY";
  if (mins >= 60) {
    const hrs = mins / 60;
    return Number.isInteger(hrs) ? `${hrs} hrs` : `${hrs.toFixed(1)} hrs`;
  }
  return `${mins} min`;
}

// Take an HCP job and return only the fields the deck cares about.
function shapeJob(job) {
  const start = job?.schedule?.scheduled_start || null;
  const end = job?.schedule?.scheduled_end || null;
  const techNames = (job?.assigned_employees || [])
    .map(e => {
      const first = e.first_name || "";
      const last = e.last_name || "";
      return `${first} ${last}`.trim();
    })
    .filter(Boolean);

  const cust = job?.customer || {};
  const addr = job?.address || {};

  return {
    id: job.id,
description: job.description
  || job?.job_fields?.job_type?.name
  || "Service call",
    workStatus: job.work_status,
    jobType: job?.job_fields?.job_type?.name || null,
    businessUnit: job?.job_fields?.business_unit?.name || null,
    scheduledStart: start,
    scheduledEnd: end,
    durationMinutes: durationMinutes(start, end),
    durationLabel: fmtDuration(durationMinutes(start, end)),
    dayLabel: fmtDayET(start),       // "MON"
    timeLabel: fmtTimeET(start),     // "9:00 AM"
    dateLabel: fmtDateET(start),     // "Mon Apr 27"
    techNames,                       // ["John Smith"] — usually 0 or 1
    techDisplay: formatTechDisplay(techNames),
    customerName: [cust.first_name, cust.last_name].filter(Boolean).join(" ") || cust.company || "(no customer)",
    city: addr.city || null,
    totalAmount: job.total_amount || 0,
  };
}

// HCP work_status values we DON'T want on the Job Board.
// Values seen in real data: 'scheduled', 'in progress', 'complete unrated',
// 'user canceled', plus likely 'pro canceled', 'complete rated', 'needs scheduling'.
const HIDE_STATUSES = new Set([
  "user canceled",
  "pro canceled",
  "complete",
  "complete unrated",
  "complete rated",
  "needs scheduling",
  "unscheduled",
]);

function isOnBoard(job) {
  return !HIDE_STATUSES.has(job.workStatus);
}

// Pull all scheduled jobs in a date range, shape them, and filter.
export async function getWeekJobs({ startISO, endISO }) {
  // HCP paginates. Loop until we have them all.
  // page_size max we trust: 100 (some forum reports say up to 500 but 100 is safe).
  const all = [];
  let page = 1;
  while (true) {
    const resp = await getScheduledJobs({
      startISO, endISO, pageSize: 100, page,
    });
    const batch = resp?.jobs || [];
    all.push(...batch);
    const totalPages = resp?.total_pages || 1;
    if (page >= totalPages) break;
    page += 1;
    if (page > 20) break; // hard safety stop
  }
  return all.map(shapeJob).filter(isOnBoard);
}

// Group jobs by weekday: { MON: [...], TUE: [...], ... }
export function groupByDay(shapedJobs) {
  const groups = { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [] };
  for (const j of shapedJobs) {
    if (groups[j.dayLabel]) groups[j.dayLabel].push(j);
  }
  // Sort each day by start time
  for (const day of Object.keys(groups)) {
    groups[day].sort((a, b) =>
      (a.scheduledStart || "").localeCompare(b.scheduledStart || "")
    );
  }
  return groups;
}

// Pick the "major job" for each weekday for slide 6 (Job Board).
// Heuristic: longest scheduled duration. Ties → highest total_amount.
export function pickMajorJobByDay(groups) {
  const out = {};
  for (const day of ["MON", "TUE", "WED", "THU", "FRI"]) {
    const list = groups[day] || [];
    if (list.length === 0) {
      out[day] = null;
      continue;
    }
    const sorted = [...list].sort((a, b) => {
      const dDur = (b.durationMinutes || 0) - (a.durationMinutes || 0);
      if (dDur !== 0) return dDur;
      return (b.totalAmount || 0) - (a.totalAmount || 0);
    });
    out[day] = sorted[0];
  }
  return out;
}
// ---------------------------------------------------------------------------
// Last-week completed jobs → for Slide 10 KPI tiles ("Jobs Closed", "Revenue WTD")
// ---------------------------------------------------------------------------

import { getJobsInRange, getEmployees } from "./hcp.js";

const COMPLETE_STATUSES = new Set([
  "complete",
  "complete unrated",
  "complete rated",
]);

export async function getCompletedJobsInRange({ startISO, endISO }) {
  const all = [];
  let page = 1;
  while (true) {
    const resp = await getJobsInRange({ startISO, endISO, pageSize: 100, page });
    const batch = resp?.jobs || [];
    all.push(...batch);
    const totalPages = resp?.total_pages || 1;
    if (page >= totalPages) break;
    page += 1;
    if (page > 20) break;
  }
  return all
    .map(shapeJob)
    .filter(j => COMPLETE_STATUSES.has(j.workStatus));
}

// Roll up KPIs from a list of completed jobs.
export function rollupKPIs(completedJobs) {
  const jobsClosed = completedJobs.length;
  const revenue = completedJobs.reduce((sum, j) => sum + (j.totalAmount || 0), 0);
  return {
    jobsClosed,
    revenueDollars: Math.round(revenue),       // for "$48,250" display
    revenueDisplay: formatRevenue(revenue),     // formatted string
  };
}

function formatRevenue(amount) {
  // HCP returns total_amount as a number in dollars (verified from the test dump:
  // total_amount: 0 was a plain integer). If it ever comes back in cents, divide here.
  if (!amount || amount < 0) return "$0";
  if (amount >= 1000) {
    return "$" + amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return "$" + amount.toFixed(0);
}

// ---------------------------------------------------------------------------
// Employees → for the on-call rotation lookup
// ---------------------------------------------------------------------------

export async function getEmployeeRoster() {
  const resp = await getEmployees({ pageSize: 100 });
  const list = resp?.employees || [];
  return list.map(e => ({
    id: e.id,
    firstName: e.first_name,
    lastName: e.last_name,
    fullName: `${e.first_name || ""} ${e.last_name || ""}`.trim(),
    mobile: e.mobile_number || null,
    email: e.email || null,
    role: e.role || null,
  }));
}
