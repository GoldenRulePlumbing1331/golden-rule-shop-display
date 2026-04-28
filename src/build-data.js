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
import NAME_OVERRIDES from "./name-overrides.js";

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
// Tech display name resolver — applies NAME_OVERRIDES then takes first name
// ---------------------------------------------------------------------------

function techDisplayName(fullName) {
  if (!fullName) return "";
  const override = NAME_OVERRIDES[fullName];
  if (override) return override;
  return fullName.split(/\s+/)[0];
}

// ---------------------------------------------------------------------------
// Job categorization for the totals strip
// ---------------------------------------------------------------------------

const INSTALL_TAGS = new Set([
  "Water Heater", "Faucet Install", "Toilet Install", "Sink Install",
  "RO install", "Repipe", "Excavation", "Sewer Line", "Main Water Line",
  "Well Tank", "Well Pump", "Booster Pump", "Pipeline Automation",
  "Garbage Disposal", "Bidet",
]);

function categorizeJob(job) {
  const tags = (job.tags || []).map(t => typeof t === "string" ? t : (t.name || ""));
  const hasTag = (set) => tags.some(t => set.has(t));

  const jobType = (job.jobType || "").toLowerCase();
  if (jobType.includes("estimate")) return "estimate";

  if (hasTag(INSTALL_TAGS)) return "install";
  return "service";
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

  const breakdown = { service: 0, install: 0, estimate: 0, other: 0 };
  for (const j of jobs) {
    const cat = categorizeJob(j);
    if (breakdown[cat] !== undefined) breakdown[cat] += 1;
    else breakdown.other += 1;
  }

  return { majors, counts, breakdown };
}

async function buildKPIs(lastMon, thisMon) {
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

async function buildOnCall(sheetId, roster, thisMon, nextMon) {
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
// Google Reviews — pulls featured 5-star reviews from sheet
// ---------------------------------------------------------------------------

function isTruthy(val) {
  if (val === true) return true;
  if (typeof val === "string") {
    const v = val.trim().toLowerCase();
    return v === "true" || v === "yes" || v === "1" || v === "y";
  }
  return false;
}

async function buildGoogleReviews(sheetId, roster) {
  const rows = await readSheet(sheetId, "google_reviews");
  if (rows.length === 0) return [];

  // Filter to featured rows only, sort by review_date desc
  const featured = rows
    .filter(r => isTruthy(r.featured) && r.review_text)
    .sort((a, b) => (b.review_date || "").localeCompare(a.review_date || ""));

  if (featured.length === 0) return [];

  // Map each row to a review object with tech name lookup
  const mapped = featured.map(r => {
    let techDisplay = "";
    if (r.tech_employee_id) {
      const tech = roster.find(e => e.id === r.tech_employee_id);
      if (tech) {
        techDisplay = techDisplayName(tech.fullName);
      }
    }
    return {
      reviewDate: r.review_date || "",
      customerName: r.customer_name || "Customer",
      stars: parseInt(r.star_rating, 10) || 5,
      techDisplay,
      text: r.review_text || "",
      location: r.location || "",
    };
  });

  // Pick exactly 3 to display, repeating the most recent if fewer
  const result = [];
  for (let i = 0; i < 3; i++) {
    if (i < mapped.length) {
      result.push(mapped[i]);
    } else {
      result.push(mapped[0]); // repeat most recent
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Service Areas — counts completed jobs by city, last 30 days
// ---------------------------------------------------------------------------

async function buildServiceAreas(thisMon, daysBack = 30) {
  const startDate = addDays(thisMon, -daysBack);
  const completed = await getCompletedJobsInRange({
    startISO: startDate.toISOString(),
    endISO: thisMon.toISOString(),
  });

  // Aggregate by city
  const cityCounts = new Map();
  for (const job of completed) {
    const addr = job.address || {};
    const city = (addr.city || "").trim();
    if (!city) continue;

    // Normalize to title case for consistent display
    const normalized = city.split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");

    cityCounts.set(normalized, (cityCounts.get(normalized) || 0) + 1);
  }

  // Convert to sorted array, top 7
  const sorted = [...cityCounts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);

  return {
    daysBack,
    totalJobs: completed.length,
    cities: sorted,
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
    newItemsR, safetyR, shoutoutR, tagDurationsR, hygieneR,
    googleReviewsR, serviceAreasR,
  ] = await Promise.all([
    safe("job board", () => buildJobBoard(thisMon, nextMon)),
    safe("KPIs", () => buildKPIs(lastMon, thisMon)),
    safe("on-call", () => buildOnCall(sheetId, roster, thisMon, nextMon)),
    safe("events", () => buildEvents(sheetId, calendarId, thisMon)),
    safe("new items", () => buildNewItems(sheetId)),
    safe("safety topic", () => buildSafetyTopic(sheetId, thisMon)),
    safe("shoutout", () => buildShoutout(sheetId, roster)),
    safe("tag durations", () => getTagDurations({ daysBack: 30, topN: 8 })),
    safe("hygiene", () => getHygieneStats()),
    safe("google reviews", () => buildGoogleReviews(sheetId, roster)),
    safe("service areas", () => buildServiceAreas(thisMon, 30)),
  ]);

  return {
    weekOf: {
      mondayISO: isoDateOnly(thisMon),
      humanLabel: fmtFullDateET(thisMon),
    },
    jobBoard:      jobBoardR.ok ? jobBoardR.data : null,
    kpis:          kpisR.ok ? kpisR.data : null,
    onCall:        onCallR.ok ? onCallR.data : { current: null, next: null },
    events:        eventsR.ok ? eventsR.data : [],
    newItems:      newItemsR.ok ? newItemsR.data : [],
    safetyTopic:   safetyR.ok ? safetyR.data : null,
    shoutout:      shoutoutR.ok ? shoutoutR.data : null,
    tagDurations:  tagDurationsR.ok ? tagDurationsR.data : [],
    hygiene:       hygieneR.ok ? hygieneR.data : null,
    googleReviews: googleReviewsR.ok ? googleReviewsR.data : [],
    serviceAreas:  serviceAreasR.ok ? serviceAreasR.data : null,
    rosterCount: roster.length,
    errors: [
      jobBoardR, kpisR, onCallR, eventsR,
      newItemsR, safetyR, shoutoutR, tagDurationsR, hygieneR,
      googleReviewsR, serviceAreasR,
    ].filter(r => !r.ok).map(r => r.error),
  };
}
