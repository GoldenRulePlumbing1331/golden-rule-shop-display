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
    outstandingBalance: job.outstanding_balance || 0,
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
// Callback count — jobs tagged "Callback" within a window
// ---------------------------------------------------------------------------

export async function countCallbacksInRange({ startISO, endISO }) {
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

  function hasCallbackTag(job) {
    const tags = job.tags || [];
    return tags.some(t => {
      const name = typeof t === "string" ? t : (t.name || "");
      return name.toLowerCase() === "callback";
    });
  }

  return all.filter(hasCallbackTag).length;
}

// ---------------------------------------------------------------------------
// Uncollected balances — jobs in window with outstanding_balance > 0
// ---------------------------------------------------------------------------

export async function getUncollectedSummary({ startISO, endISO }) {
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

  const withBalance = all.filter(j => (j.outstanding_balance || 0) > 0);
  const totalCents = withBalance.reduce((sum, j) => sum + (j.outstanding_balance || 0), 0);

  return {
    count: withBalance.length,
    totalCents,
    totalDollars: Math.round(totalCents / 100),
    display: formatRevenue(totalCents),
  };
}

// ---------------------------------------------------------------------------
// Per-tech job counts — for the bar chart on Goals slide
// ---------------------------------------------------------------------------

// The fixed lineup of techs we display across the shop deck.
// First name → matched against assigned_employees on jobs.
// Order here is the order they'll appear in the bar chart unless re-sorted.
export const TIME_TRACKING_TECHS = [
  { id: "pro_d60fd2a5a1ba4630a5eaa3ef4eec5fb7", first: "Donat",  last: "Houle",     display: "Donat" },
  { id: "pro_2ad90ce39da54e669fdf80d7d0642c74", first: "Matt",   last: "Shew",      display: "Matt" },
  { id: "pro_dce147af238f473fa002e40d9eb78b59", first: "Rudy",   last: "Dimemmo",   display: "Rudy" },
  { id: "pro_f2b087323f4844feac6f872692f94575", first: "Mark",   last: "Wileczek",  display: "Mark" },
  { id: "pro_c16796482f324fd6b9a0aa6cf2c2e200", first: "Tanner", last: "Lasco",     display: "Tanner" },
  { id: "pro_2493967341af4b11a1f93223670a2eb6", first: "Sam",    last: "Parry",     display: "Sam" },
  { id: "pro_31c8e5be25454345a92c54e461a81034", first: "Dom",    last: "Facciolo",  display: "Dom" },
  { id: "pro_334b5e2b6f6749ebbfd07753f850b23c", first: "Pat",    last: "Donnelly",  display: "Pat" },
  { id: "pro_4fa8fe66def94c0ba0455943825f9f78", first: "Kevin",  last: "Donnelly",  display: "Kevin" },
  { id: "pro_672e3970d1924afa8f18a4d6020613fc", first: "Ed",     last: "Carr",      display: "Ed" },
  { id: "pro_80742babc13b413c887ce9b104a645d9", first: "Jay",    last: "Stetser",   display: "Jay" },
];

export async function getCompletedByTech({ startISO, endISO }) {
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
  const completed = all.filter(j => COMPLETE_STATUSES.has(j.work_status));

  // Count by lead tech
  const counts = new Map();
  for (const t of TIME_TRACKING_TECHS) counts.set(t.id, 0);

  for (const j of completed) {
    const employees = j.assigned_employees || [];
    if (employees.length === 0) continue;
    const lead = employees[0];
    if (counts.has(lead.id)) {
      counts.set(lead.id, counts.get(lead.id) + 1);
    }
  }

  // Build bars in TIME_TRACKING_TECHS order, then filter to non-zero
  // and sort descending by count (matches HCP's chart style)
  const rows = TIME_TRACKING_TECHS
    .map(t => ({ techId: t.id, name: t.display, count: counts.get(t.id) || 0 }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);

  return rows;
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
// Tag-based duration averages
// ---------------------------------------------------------------------------

const NON_WORK_TAGS = new Set([
  "New Customer", "Tenant", "Landlord", "Family/Friend", "Contractor",
  "GR Supplied", "Homeowner Supplied",
  "Material Ordered", "Warranty", "Follow-up", "Final", "Walkout",
  "Bill From Shop", "Reconnect", "Callback",
  "BCWC Members", "Hersheys Mill", "Exton Station",
  "No Send: Kevin", "Requested: Donat", "Requested: Brett", "Requested: Dom",
  "Emergency",
  "Moen", "Rheem",
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
// Time tracking — per-tech compliance with OMW / Start / Finish
// ---------------------------------------------------------------------------

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
  stats.omwPct    = jobs.length > 0 ? Math.round(100 * stats.omwHit    / jobs.length) : null;
  stats.startPct  = jobs.length > 0 ? Math.round(100 * stats.startHit  / jobs.length) : null;
  stats.finishPct = jobs.length > 0 ? Math.round(100 * stats.finishHit / jobs.length) : null;

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

  const eligible = all.filter(j => COMPLETE_STATUSES.has(j.work_status));

  // Pass 1: Group by lead tech (used for compliance %s)
  const byLeadTech = new Map();
  for (const j of eligible) {
    const employees = j.assigned_employees || [];
    if (employees.length === 0) continue;
    const lead = employees[0];
    if (!byLeadTech.has(lead.id)) byLeadTech.set(lead.id, { jobs: [] });
    byLeadTech.get(lead.id).jobs.push(j);
  }

  // Pass 2: Count ALL assigned techs (lead + helpers) — used for "ASSIGNED" column
  const assignedCounts = new Map();
  for (const j of eligible) {
    const employees = j.assigned_employees || [];
    for (const emp of employees) {
      assignedCounts.set(emp.id, (assignedCounts.get(emp.id) || 0) + 1);
    }
  }

  // Build a row for EVERY tech in the allowlist — even if they have zero jobs.
  // Techs not in the allowlist are excluded entirely.
  const rows = [];
  for (const t of TIME_TRACKING_TECHS) {
    const fullName = `${t.first} ${t.last}`.trim();
    const bucket = byLeadTech.get(t.id);
    const totalAssigned = assignedCounts.get(t.id) || 0;

    if (!bucket || bucket.jobs.length === 0) {
      // No lead jobs in this window — show as N/A across compliance columns,
      // but still display assigned count if helper-only on jobs
      rows.push({
        employeeId: t.id,
        name: fullName,
        displayName: t.display,
        totalJobs: 0,           // lead jobs count
        totalAssigned,           // total assigned (lead + helper)
        omwHit: 0, startHit: 0, finishHit: 0,
        omwPct: null, startPct: null, finishPct: null, overallPct: null,
      });
    } else {
      const stats = rollupTech(t.id, fullName, bucket.jobs);
      stats.displayName = t.display;
      stats.totalAssigned = totalAssigned;
      rows.push(stats);
    }
  }

  // Sort: techs with data first (by overall desc), techs with no data last
  rows.sort((a, b) => {
    const aHas = a.overallPct !== null ? 1 : 0;
    const bHas = b.overallPct !== null ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return (b.overallPct ?? 0) - (a.overallPct ?? 0);
  });

  return rows;
}

export async function getHygieneStats() {
  const [last7, last30] = await Promise.all([
    computeHygieneForWindow({ daysBack: 7 }),
    computeHygieneForWindow({ daysBack: 30 }),
  ]);

  const eligibleLeaders = last7.filter(r => r.totalJobs >= 5);
  const leader = eligibleLeaders.length > 0 ? eligibleLeaders[0] : null;

  const flagged = last30.filter(r => r.overallPct !== null && r.overallPct < 80);

  return { last7, last30, leader, flagged };
}
