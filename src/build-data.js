// The orchestrator. Pulls from HCP + Google Sheets and assembles the single
// `data` object the slideshow renderer consumes.
//
// Every section is fetched through safe(): if one source fails, only that slide
// drops out of the rotation and the rest of the board still builds.

import {
  getEmployeeRoster,
  getTagDurations,
  getCompletedJobsInRange,
  rollupKPIs,
  countCallbacksInRange,
  getUncollectedSummary,
  getCompletedByTech,
} from "./jobs.js";
import { readSheet } from "./google.js";
import { getHcpButtons } from "./hcp-buttons.js";
import { getRevenueByTruck } from "./hcp-reports.js";
import { getServiceAreaTrends } from "./service-areas.js";
import { loadTechYearStats } from "./tech-year-stats.js";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function mondayOf(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  mon.setUTCHours(0, 0, 0, 0);
  return mon;
}

export function addDays(d, n) {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function isoDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

function fmtFullDateET(date) {
  const isoDay = date.toISOString().slice(0, 10);
  const [y, m, d] = isoDay.split("-").map(Number);
  const localMidnight = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(localMidnight);
}

// ---------------------------------------------------------------------------
// Safe section wrapper
// ---------------------------------------------------------------------------

async function safe(label, fn) {
  try {
    const result = await fn();
    return { ok: true, data: result };
  } catch (e) {
    console.error(`[build-data] ${label} FAILED: ${e.message}`);
    return { ok: false, error: `${label}: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

async function buildKPIs(lastMon, thisMon) {
  const range = { startISO: lastMon.toISOString(), endISO: thisMon.toISOString() };
  const [completed, callbackCount, uncollected, byTech] = await Promise.all([
    getCompletedJobsInRange(range),
    countCallbacksInRange(range),
    getUncollectedSummary(range),
    getCompletedByTech(range),
  ]);

  return {
    ...rollupKPIs(completed),
    callbackCount,
    uncollected,
    byTech,
  };
}

function buildOnCallEntry(row, roster) {
  if (!row) return null;
  const tech = roster.find(e => e.id === row.primary_employee_id);
  if (!tech) {
    console.warn(`[build-data] on-call: employee ID ${row.primary_employee_id} not found in roster`);
    return null;
  }
  return {
    weekStart: row.week_start_date,
    primaryName: tech.fullName,
    primaryMobile: tech.mobile,
    primaryEmail: tech.email,
    dispatcher: row.dispatcher_name || "",
    materialRuns: row.material_runs_name || "",
  };
}

async function buildOnCall(sheetId, roster, nextMon) {
  const rows = await readSheet(sheetId, "on_call_rotation");
  if (rows.length === 0) return { current: null, next: null };

  const today = isoDateOnly(new Date());
  const nextMonISO = isoDateOnly(nextMon);

  const past = rows
    .filter(r => r.week_start_date && r.week_start_date <= today)
    .sort((a, b) => b.week_start_date.localeCompare(a.week_start_date));
  const currentRow = past[0] || null;
  const nextRow = rows.find(r => r.week_start_date === nextMonISO) || null;

  return {
    current: buildOnCallEntry(currentRow, roster),
    next: buildOnCallEntry(nextRow, roster),
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function buildData({ sheetId, today = new Date() } = {}) {
  if (!sheetId) throw new Error("buildData: sheetId is required");

  const thisMon = mondayOf(today);
  const nextMon = addDays(thisMon, 7);
  const lastMon = addDays(thisMon, -7);

  console.log(`[build-data] Building board data for week of ${isoDateOnly(thisMon)}`);

  const rosterResult = await safe("employee roster", () => getEmployeeRoster());
  const roster = rosterResult.ok ? rosterResult.data : [];

  const [onCallR, kpisR, tagDurationsR, revenueR, buttonsR, areasR, yearR] = await Promise.all([
    safe("on-call", () => buildOnCall(sheetId, roster, nextMon)),
    safe("weekly KPIs", () => buildKPIs(lastMon, thisMon)),
    safe("tag durations", () => getTagDurations({ daysBack: 30, topN: 8 })),
    safe("revenue by truck", () => getRevenueByTruck()),
    safe("HCP buttons sheet", () => getHcpButtons()),
    safe("service areas", () => getServiceAreaTrends()),
    safe("yearly tech stats", async () => loadTechYearStats()),
  ]);

  const sections = [onCallR, kpisR, tagDurationsR, revenueR, buttonsR, areasR, yearR];
  return {
    weekOf: {
      mondayISO: isoDateOnly(thisMon),
      humanLabel: fmtFullDateET(thisMon),
    },
    onCall:       onCallR.ok ? onCallR.data : { current: null, next: null },
    kpis:         kpisR.ok ? kpisR.data : null,
    tagDurations: tagDurationsR.ok ? tagDurationsR.data : [],
    revenue:      revenueR.ok ? revenueR.data : null,
    hcpButtons:   buttonsR.ok ? buttonsR.data : null,
    serviceAreas: areasR.ok ? areasR.data : null,
    techYear:     yearR.ok ? yearR.data : null,
    rosterCount: roster.length,
    errors: [rosterResult, ...sections].filter(r => !r.ok).map(r => r.error),
  };
}
