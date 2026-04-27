// Job-board data layer.
// Pulls scheduled jobs for a week and shapes them for the shop display.

import { getScheduledJobs } from "./hcp.js";

// Eastern Time helpers — Golden Rule is in PA, so the deck should reflect ET.
// We don't need a full tz library; Intl.DateTimeFormat handles it.

const ET = "America/New_York";

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
    description: job.description || "(no description)",
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
    techDisplay: techNames.length ? techNames.join(", ") : "[ UNASSIGNED ]",
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
