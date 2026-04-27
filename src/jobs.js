// Job-board data layer.
// Pulls scheduled jobs for a week and shapes them for the shop display.

import { getScheduledJobs, getJobsInRange, getEmployees } from "./hcp.js";
import { overrideFirstName } from "./name-overrides.js";

const ET = "America/New_York";

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

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
  if (!isoString) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(isoString));
}

function durationMinutes(startISO, endISO) {
  if (!startISO || !endISO) return null;
  return Math.round((new Date(endISO) - new Date(startISO)) / 60000);
}

function fmtDuration(mins) {
  if (mins == null) return "—";
  if (mins >= 7 * 60) return "FULL DAY";
  if (mins >= 60) {
    const hrs = mins / 60;
    return Number.isInteger(hrs) ? `${hrs} hrs` : `${hrs.toFixed(1)} hrs`;
  }
  return `${mins} min`;
}

function formatTechDisplay(names, maxChars = 28) {
  if (!names || names.length === 0) return "[ UNASSIGNED ]";

  const firsts = names.map(fullName => {
    const lastSpace = fullName.lastIndexOf(" ");
    const firstNameField = lastSpace > 0 ? fullName.slice(0, lastSpace) : fullName;
    const overridden = overrideFirstName(firstNameField);
    return (overridden.split(/\s+/)[0] || overridden).trim();
  });

  if (firsts.length === 1) return firsts[0];

  let included = [...firsts];
  let dropped = 0;

  while (included.length > 1) {
    const candidate = dropped === 0
      ? included.join(", ")
      : `${included.join(", ")} +${dropped}`;
    if (candidate.length <= maxChars) return candidate;
    included.pop();
    dropped += 1;
  }

  return `${included[0]} +${dropped}`;
}

// ---------------------------------------------------------------------------
// Job shaping (active jobs)
// ---------------------------------------------------------------------------

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
    dayLabel: fmtDayET(start),
    timeLabel: fmtTimeET(start),
    dateLabel: fmtDateET(start),
    techNames,
    techDisplay: formatTechDisplay(techNames),
    customerName: [cust.first_name, cust.last_name].filter(Boolean).join(" ") || cust.company || "(no customer)",
    city: addr.city || null,
    totalAmount: job.total_amount || 0,
  };
}

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

export async function getWeekJobs({ startISO, endISO }) {
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
    if (page > 20) break;
  }
  return all.map(shapeJob).filter(isOnBoard);
}

export function groupByDay(shapedJobs) {
  const groups = { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [] };
  for (const j of shapedJobs) {
    if (groups[j.dayLabel]) groups[j.dayLabel].push(j);
  }
  for (const day of Object.keys(groups)) {
    groups[day].sort((a, b) =>
      (a.scheduledStart || "").localeCompare(b.scheduledStart || "")
    );
  }
  return groups;
}

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
// Completed jobs and KPIs
// ---------------------------------------------------------------------------

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

export function rollupKPIs(completedJobs) {
  const jobsClosed = completedJobs.length;
  const revenueCents = completedJobs.reduce((sum, j) => sum + (j.totalAmount || 0), 0);
  return {
    jobsClosed,
    revenueDollars: Math.round(revenueCents / 100),
    revenueCents,
    revenueDisplay: formatRevenue(revenueCents),
  };
}

function formatRevenue(amountCents) {
  if (!amountCents || amountCents < 0) return "$0";
  const dollars = amountCents / 100;
  return "$" + dollars.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// Employees
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

// ---------------------------------------------------------------------------
// Tag-based duration averages — for the "Average Job Time" slide
// ---------------------------------------------------------------------------

const NON_WORK_TAGS = new Set([
  // Customer relationship
  "New Customer", "Tenant", "Landlord", "Family/Friend", "Contractor",
  // Supply origin
  "GR Supplied", "Homeowner Supplied",
  // Admin / lifecycle
  "Material Ordered", "Warranty", "Follow-up", "Final", "Walkout",
  "Bill From Shop", "Reconnect",
  // Place / community
  "BCWC Members", "Hersheys Mill", "Exton Station",
  // Tech routing
  "No Send: Kevin", "Requested: Donat", "Requested: Brett", "Requested: Dom",
  // Service mode (not a work type)
  "Emergency",
  // Brands (descriptors, not jobs)
  "Moen", "Rheem",
  // Misc admin
  "Pipeline Automation",
]);

function median(arr) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function fmtDurationShort(mins) {
  if (mins == null) return "—";
  if (mins >= 60) {
    const hrs = mins / 60;
    return Number.isInteger(hrs) ? `${hrs} hr` : `${hrs.toFixed(1)} hr`;
  }
  return `${Math.round(mins)} min`;
}

export async function getTagDurations({ daysBack = 30, topN = 8 } = {}) {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - daysBack);
  start.setUTCHours(0, 0, 0, 0);

  const all = [];
  let page = 1;
  while (true) {
    const resp = await getJobsInRange({
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      pageSize: 100,
      page,
    });
    const batch = resp?.jobs || [];
    all.push(...batch);
    const totalPages = resp?.total_pages || 1;
    if (page >= totalPages) break;
    page += 1;
    if (page > 20) break;
  }

  const completed = all.filter(j => COMPLETE_STATUSES.has(j.work_status));

  function jobDurationMinutes(j) {
    const startedAt = j.work_timestamps?.started_at;
    const completedAt = j.work_timestamps?.completed_at;
    const schedStart = j.schedule?.scheduled_start;
    const schedEnd = j.schedule?.scheduled_end;
    if (startedAt && completedAt) {
      const ms = new Date(completedAt) - new Date(startedAt);
      return ms > 0 ? ms / 60000 : null;
    }
    if (schedStart && schedEnd) {
      const ms = new Date(schedEnd) - new Date(schedStart);
      return ms > 0 ? ms / 60000 : null;
    }
    return null;
  }

  const byTag = new Map();
  for (const j of completed) {
    const dur = jobDurationMinutes(j);
    if (dur === null) continue;
    const tags = j.tags || [];
    for (const t of tags) {
      const tagName = typeof t === "string" ? t : (t.name || t.label || "");
      if (!tagName) continue;
      if (NON_WORK_TAGS.has(tagName)) continue;
      if (!byTag.has(tagName)) byTag.set(tagName, []);
      byTag.get(tagName).push(dur);
    }
  }

  const rows = [];
  for (const [tag, durations] of byTag.entries()) {
    if (durations.length < 3) continue;
    const med = median(durations);
    rows.push({
      tag,
      sampleCount: durations.length,
      medianMinutes: Math.round(med),
      medianLabel: fmtDurationShort(med),
    });
  }
  rows.sort((a, b) => b.sampleCount - a.sampleCount);
  return rows.slice(0, topN);
}

// ---------------------------------------------------------------------------
// Timestamp hygiene — per-tech compliance with OMW / Start / Finish
// ---------------------------------------------------------------------------

// Compute compliance for one job. All three buttons (OMW, Start, Finish) are
// tracked on every job — the shop expects every tech to hit all three on
// every visit, regardless of job type.
function jobCompliance(job) {
  const wt = job.work_timestamps || {};
  return {
    omwHit: Boolean(wt.on_my_way_at),
    startHit: Boolean(wt.started_at),
    finishHit: Boolean(wt.completed_at),
  };
}

function rollupTech(empId, empName, jobs) {
  const stats = {
    employeeId: empId,
    name: empName,
    totalJobs: jobs.length,
    omwHit: 0,
    startHit: 0,
    finishHit: 0,
  };
  for (const j of jobs) {
    const c = jobCompliance(j);
    if (c.omwHit) stats.omwHit += 1;
    if (c.startHit) stats.startHit += 1;
    if (c.finishHit) stats.finishHit += 1;
  }
  // All three percentages use the same denominator (total jobs)
  stats.omwPct    = jobs.length > 0 ? Math.round(100 * stats.omwHit    / jobs.length) : null;
  stats.startPct  = jobs.length > 0 ? Math.round(100 * stats.startHit  / jobs.length) : null;
  stats.finishPct = jobs.length > 0 ? Math.round(100 * stats.finishHit / jobs.length) : null;

  // Overall: simple average of the three percentages
  const pcts = [stats.omwPct, stats.startPct, stats.finishPct].filter(p => p !== null);
  stats.overallPct = pcts.length > 0
    ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
    : null;
  return stats;
}

async function computeHygieneForWindow({ daysBack }) {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - daysBack);
  start.setUTCHours(0, 0, 0, 0);

  const all = [];
  let page = 1;
  while (true) {
    const resp = await getJobsInRange({
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      pageSize: 100,
      page,
    });
    const batch = resp?.jobs || [];
    all.push(...batch);
    const totalPages = resp?.total_pages || 1;
    if (page >= totalPages) break;
    page += 1;
    if (page > 20) break;
  }

  // Only completed jobs — work in progress shouldn't count against finish %
  const eligible = all.filter(j => COMPLETE_STATUSES.has(j.work_status));

  // Group by lead tech (first assigned employee)
  const byTech = new Map();
  for (const j of eligible) {
    const employees = j.assigned_employees || [];
    if (employees.length === 0) continue;
    const lead = employees[0];
    const id = lead.id;
    const name = `${lead.first_name || ""} ${lead.last_name || ""}`.trim();
    if (!byTech.has(id)) byTech.set(id, { name, jobs: [] });
    byTech.get(id).jobs.push(j);
  }

  const rows = [];
  for (const [empId, { name, jobs }] of byTech.entries()) {
    if (jobs.length < 3) continue;
    rows.push(rollupTech(empId, name, jobs));
  }
  rows.sort((a, b) => (b.overallPct ?? 0) - (a.overallPct ?? 0));
  return rows;
}

export async function getHygieneStats() {
  const [last7, last30] = await Promise.all([
    computeHygieneForWindow({ daysBack: 7 }),
    computeHygieneForWindow({ daysBack: 30 }),
  ]);

  // Apply the name override (e.g. R Kevin → Kevin) for display
  function shorten(name) {
    const lastSpace = name.lastIndexOf(" ");
    const firstField = lastSpace > 0 ? name.slice(0, lastSpace) : name;
    const last = lastSpace > 0 ? name.slice(lastSpace + 1) : "";
    const overridden = overrideFirstName(firstField);
    const firstWord = overridden.split(/\s+/)[0] || overridden;
    return last ? `${firstWord} ${last}` : firstWord;
  }
  for (const r of last7) r.displayName = shorten(r.name);
  for (const r of last30) r.displayName = shorten(r.name);

  // Identify this week's leader (highest overall, must have ≥5 jobs in last 7 days)
  const eligibleLeaders = last7.filter(r => r.totalJobs >= 5);
  const leader = eligibleLeaders.length > 0 ? eligibleLeaders[0] : null;

  // Identify any tech below 80% in the 30-day window
  const flagged = last30.filter(r => r.overallPct !== null && r.overallPct < 80);

  return { last7, last30, leader, flagged };
}
