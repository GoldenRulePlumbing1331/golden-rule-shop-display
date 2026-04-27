// The orchestrator. Pulls from HCP + Sheet + Calendar and assembles
// a single `data` object that the deck generator will consume.

import {
  getWeekJobs,
  groupByDay,
  pickMajorJobByDay,
  getCompletedJobsInRange,
  rollupKPIs,
  getEmployeeRoster,
  getTagDurations,
  getHygieneStats,
  countCallbacksInRange,
  getUncollectedSummary,
  getCompletedByTech,
} from "./jobs.js";
import { readSheet, readCalendarEvents } from "./google.js";

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
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

async function buildJobBoard(thisMon, nextMon) {
  const jobs = await getWeekJobs({
    startISO: thisMon.toISOString(),
    endISO: nextMon.toISOString(),
  });
  const groups = groupByDay(jobs);
  const majors = pickMajorJobByDay(groups);

  const counts = {
    open: jobs.filter(j => j.workStatus === "scheduled").length,
    inProgress: jobs.filter(j => j.workStatus === "in progress").length,
    total: jobs.length,
  };

  return { majors, counts };
}

async function buildKPIs(lastMon, thisMon) {
  // Pull all KPIs for last week's window in parallel
  const [completed, callbackCount, uncollected, byTech] = await Promise.all([
    getCompletedJobsInRange({
      startISO: lastMon.toISOString(),
      endISO: thisMon.toISOString(),
    }),
    countCallbacksInRange({
      startISO: lastMon.toISOString(),
      endISO: thisMon.toISOString(),
    }),
    getUncollectedSummary({
      startISO: lastMon.toISOString(),
      endISO: thisMon.toISOString(),
    }),
    getCompletedByTech({
      startISO: lastMon.toISOString(),
      endISO: thisMon.toISOString(),
    }),
  ]);

  return {
    ...rollupKPIs(completed),
    callbackCount,
    uncollected,
    byTech,
  };
}

async function buildOnCall(sheetId, roster) {
  const rows = await readSheet(sheetId, "on_call_rotation");
  if (rows.length === 0) return null;

  const today = isoDateOnly(new Date());
  const past = rows
    .filter(r => r.week_start_date && r.week_start_date <= today)
    .sort((a, b) => b.week_start_date.localeCompare(a.week_start_date));
  const row = past[0];
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

async function buildEvents(sheetId, calendarId, thisMon, weeksOut = 2) {
  const endRange = addDays(thisMon, 7 * weeksOut);
  const events = [];

  try {
    const calEvents = await readCalendarEvents(calendarId, {
      startISO: thisMon.toISOString(),
      endISO: endRange.toISOString(),
    });
    for (const e of calEvents) {
      const start = e.start?.dateTime || e.start?.date;
      if (!start) continue;
      events.push({
        source: "calendar",
        startISO: start,
        title: e.summary || "(untitled)",
        location: e.location || "",
        category: "MEETING",
      });
    }
  } catch (e) {
    console.warn(`[build-data] calendar fetch failed: ${e.message}`);
  }

  try {
    const sheetRows = await readSheet(sheetId, "events");
    for (const r of sheetRows) {
      if (!r.date) continue;
      events.push({
        source: "sheet",
        startISO: r.date,
        title: r.title || "(untitled)",
        location: r.time_location || "",
        category: r.category || "MEETING",
        notes: r.notes || "",
      });
    }
  } catch (e) {
    console.warn(`[build-data] events sheet fetch failed: ${e.message}`);
  }

  events.sort((a, b) => a.startISO.localeCompare(b.startISO));
  return events.slice(0, 4);
}

async function buildNewItems(sheetId) {
  const rows = await readSheet(sheetId, "new_items");
  return rows
    .filter(r => r.name)
    .sort((a, b) => (b.added_date || "").localeCompare(a.added_date || ""))
    .slice(0, 3)
    .map(r => ({
      name: r.name,
      category: (r.category || "").toUpperCase(),
      location: r.location || "",
      notes: r.notes || "",
      addedDate: r.added_date || "",
    }));
}

async function buildMovedItems(sheetId) {
  const rows = await readSheet(sheetId, "moved_items");
  return rows
    .filter(r => r.name)
    .sort((a, b) => (b.moved_date || "").localeCompare(a.moved_date || ""))
    .slice(0, 3)
    .map(r => ({
      name: r.name,
      oldLocation: r.old_location || "",
      newLocation: r.new_location || "",
      movedDate: r.moved_date || "",
    }));
}

async function buildSafetyTopic(sheetId, thisMon) {
  const rows = await readSheet(sheetId, "safety_topic");
  if (rows.length === 0) return null;

  const today = isoDateOnly(new Date());
  const past = rows
    .filter(r => r.week_start_date && r.week_start_date <= today)
    .sort((a, b) => b.week_start_date.localeCompare(a.week_start_date));
  const row = past[0];
  if (!row || !row.headline) return null;

  const bullets = (row.bullets || "")
    .split("|")
    .map(s => s.trim())
    .filter(Boolean);

  return {
    weekStart: row.week_start_date,
    headline: row.headline,
    bullets,
  };
}

async function buildShoutout(sheetId, roster) {
  const rows = await readSheet(sheetId, "shoutouts");
  if (rows.length === 0) return null;

  const today = isoDateOnly(new Date());
  const past = rows
    .filter(r => r.week_start_date && r.week_start_date <= today)
    .sort((a, b) => b.week_start_date.localeCompare(a.week_start_date));
  const row = past[0];
  if (!row || !row.tech_employee_id) return null;

  const tech = roster.find(e => e.id === row.tech_employee_id);
  if (!tech) {
    console.warn(`[build-data] shoutout: employee ID ${row.tech_employee_id} not found in roster`);
    return null;
  }

  return {
    weekStart: row.week_start_date,
    techName: tech.fullName,
    reason: row.reason || "",
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function buildData({ sheetId, calendarId, today = new Date() } = {}) {
  if (!sheetId) throw new Error("buildData: sheetId is required");
  if (!calendarId) throw new Error("buildData: calendarId is required");

  const thisMon = mondayOf(today);
  const nextMon = addDays(thisMon, 7);
  const lastMon = addDays(thisMon, -7);

  console.log(`[build-data] Building deck data for week of ${isoDateOnly(thisMon)}`);

  const rosterResult = await safe("employee roster", () => getEmployeeRoster());
  const roster = rosterResult.ok ? rosterResult.data : [];

  const [
    jobBoardR, kpisR, onCallR, eventsR,
    newItemsR, movedItemsR, safetyR, shoutoutR, tagDurationsR, hygieneR,
  ] = await Promise.all([
    safe("job board", () => buildJobBoard(thisMon, nextMon)),
    safe("KPIs", () => buildKPIs(lastMon, thisMon)),
    safe("on-call", () => buildOnCall(sheetId, roster)),
    safe("events", () => buildEvents(sheetId, calendarId, thisMon)),
    safe("new items", () => buildNewItems(sheetId)),
    safe("moved items", () => buildMovedItems(sheetId)),
    safe("safety topic", () => buildSafetyTopic(sheetId, thisMon)),
    safe("shoutout", () => buildShoutout(sheetId, roster)),
    safe("tag durations", () => getTagDurations({ daysBack: 30, topN: 8 })),
    safe("hygiene", () => getHygieneStats()),
  ]);

  return {
    weekOf: {
      mondayISO: isoDateOnly(thisMon),
      humanLabel: fmtFullDateET(thisMon),
    },
    jobBoard:     jobBoardR.ok ? jobBoardR.data : null,
    kpis:         kpisR.ok ? kpisR.data : null,
    onCall:       onCallR.ok ? onCallR.data : null,
    events:       eventsR.ok ? eventsR.data : [],
    newItems:     newItemsR.ok ? newItemsR.data : [],
    movedItems:   movedItemsR.ok ? movedItemsR.data : [],
    safetyTopic:  safetyR.ok ? safetyR.data : null,
    shoutout:     shoutoutR.ok ? shoutoutR.data : null,
    tagDurations: tagDurationsR.ok ? tagDurationsR.data : [],
    hygiene:      hygieneR.ok ? hygieneR.data : null,
    rosterCount: roster.length,
    errors: [
      jobBoardR, kpisR, onCallR, eventsR,
      newItemsR, movedItemsR, safetyR, shoutoutR, tagDurationsR, hygieneR,
    ].filter(r => !r.ok).map(r => r.error),
  };
}
