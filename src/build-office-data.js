// Office display data layer.
// Pulls today's HCP data and shapes it into a dashboard-ready structure.

import { getJobsInRange, getEmployees, getJobAppointments } from "./hcp.js";
import { readCalendarEvents } from "./google.js";
import { TIME_TRACKING_TECHS } from "./jobs.js";
import { overrideFirstName } from "./name-overrides.js";

const ET = "America/New_York";

// ---------------------------------------------------------------------------
// Date / time helpers — operating in ET because that's what the office cares about
// ---------------------------------------------------------------------------

function todayBoundsET() {
  // Compute the UTC ISO range that corresponds to "today" in ET
  const now = new Date();
  const etFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = etFormatter.formatToParts(now);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;

  // Build the ET midnight boundaries by treating them as UTC strings with the offset
  // ET is UTC-4 during DST (March-November), UTC-5 otherwise
  const offsetHours = etOffsetHours(now);
  const offsetStr = offsetHours === -4 ? "-04:00" : "-05:00";

  const startET = new Date(`${y}-${m}-${d}T00:00:00${offsetStr}`);
  const endET = new Date(`${y}-${m}-${d}T23:59:59${offsetStr}`);

  return {
    startISO: startET.toISOString(),
    endISO: endET.toISOString(),
    todayDateOnlyET: `${y}-${m}-${d}`,
  };
}

function etOffsetHours(date) {
  // Rough DST detection: DST in US runs from 2nd Sunday in March to 1st Sunday in November
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-11
  if (month > 2 && month < 10) return -4; // April through October: definitely EDT
  if (month < 2 || month > 10) return -5; // Jan/Feb/Dec: definitely EST
  // March or November: use a simple check
  // March: DST starts 2nd Sunday. November: DST ends 1st Sunday.
  // Good enough for our purposes — we'll be off by a few hours on transition day
  if (month === 2) return date.getUTCDate() >= 8 ? -4 : -5;
  return date.getUTCDate() >= 1 ? -5 : -4;
}

// Returns a Date pointing to Monday-of-two-weeks-ago at 00:00 ET.
// Used as the cutoff for "current week + previous two weeks" filtering.
function mondayTwoWeeksAgoET() {
  const now = new Date();

  // Get today's calendar date in ET
  const etFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = etFormatter.formatToParts(now);
  const y = parseInt(parts.find(p => p.type === "year").value, 10);
  const m = parseInt(parts.find(p => p.type === "month").value, 10);
  const d = parseInt(parts.find(p => p.type === "day").value, 10);
  const weekday = parts.find(p => p.type === "weekday").value; // "Mon", "Tue", etc.

  // Days to subtract to reach Monday of THIS week
  const dayOffsets = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const daysToThisMonday = dayOffsets[weekday] ?? 0;

  // Total days back: to this Monday, then 14 more days (2 prior weeks)
  const totalDaysBack = daysToThisMonday + 14;

  // Construct the cutoff date at midnight ET
  const offsetHours = etOffsetHours(now);
  const offsetStr = offsetHours === -4 ? "-04:00" : "-05:00";
  const todayMidnightET = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00${offsetStr}`);
  const cutoffET = new Date(todayMidnightET.getTime() - totalDaysBack * 86400000);

  return cutoffET;
}

function fmtTimeET(isoString) {
  if (!isoString) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoString));
}

function nowET() {
  return new Date();
}

function minutesSinceISO(isoString) {
  if (!isoString) return null;
  return Math.round((Date.now() - new Date(isoString).getTime()) / 60000);
}

function fmtElapsed(minutes) {
  if (minutes == null) return "";
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hrs}h` : `${hrs}h ${mins}m`;
}

// ---------------------------------------------------------------------------
// HCP data shaping — for office display
// ---------------------------------------------------------------------------

function customerLastName(job) {
  const cust = job?.customer || {};
  if (cust.last_name) return cust.last_name;
  if (cust.company) return cust.company;
  if (cust.first_name) return cust.first_name;
  return "(no name)";
}

const COMPLETE_STATUSES = new Set([
  "complete",
  "complete unrated",
  "complete rated",
]);

const ESTIMATE_STATUSES = new Set([
  "scheduled",
  "in progress",
  "complete unrated",
  "complete rated",
  "complete",
]);

// Pull all jobs in a window with pagination handled
async function pullJobsInRange(startISO, endISO) {
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
  return all;
}

// ---------------------------------------------------------------------------
// Multi-day jobs
// ---------------------------------------------------------------------------
// HCP's /jobs date filter matches on the job's scheduled start — its FIRST day.
// A job that began on an earlier day never comes back in "today's" pull, even
// when a tech is dispatched to it today, so that tech used to show
// "NO JOBS TODAY". To catch them we look back for jobs that started earlier
// and are still open, then check each one's appointments for a visit today.

const MULTI_DAY_LOOKBACK_DAYS = 30;
const MULTI_DAY_MAX_CANDIDATES = 100;
const APPOINTMENT_FETCH_CONCURRENCY = 5;

const CANCELED_STATUSES = new Set([
  "user canceled",
  "pro canceled",
  "canceled",
  "deleted",
]);

// "YYYY-MM-DD" for the ET calendar day an instant falls on.
function etDateKey(isoOrDate) {
  if (!isoOrDate) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoOrDate));
  const get = t => parts.find(p => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// ET calendar days a visit covers: its start day, plus any weekdays after it
// through the end day. Used only for the "Day 2 of 3" label.
function coveredDates(startISO, endISO) {
  const startKey = etDateKey(startISO);
  if (!startKey) return [];
  // An end at exactly midnight belongs to the day before.
  const endKey = endISO
    ? etDateKey(new Date(new Date(endISO).getTime() - 60000))
    : startKey;
  const out = [];
  let cursor = new Date(`${startKey}T12:00:00Z`);
  for (let i = 0; i < 60; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (key > endKey && out.length > 0) break;
    const dow = cursor.getUTCDay();
    if (key === startKey || (dow !== 0 && dow !== 6)) out.push(key);
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return out;
}

// Employee ids on one appointment. Returns null when the payload doesn't say,
// so the caller falls back to the job's assigned employees.
function appointmentEmployeeIds(a) {
  for (const list of [a.dispatched_employees_ids, a.dispatched_employee_ids, a.employee_ids]) {
    if (Array.isArray(list)) return list;
  }
  const objs = a.dispatched_employees || a.assigned_employees || a.employees;
  if (Array.isArray(objs)) {
    return objs.map(e => (typeof e === "string" ? e : e?.id)).filter(Boolean);
  }
  return null;
}

function readAppointments(respOrList) {
  const list = Array.isArray(respOrList)
    ? respOrList
    : (respOrList?.appointments || respOrList?.data || []);
  return list
    .map(a => ({
      start: a.start_time || a.scheduled_start || a.start || null,
      end: a.end_time || a.scheduled_end || a.end || null,
      employeeIds: appointmentEmployeeIds(a),
    }))
    .filter(v => v.start);
}

let appointmentFetchWarned = false;

// All visits on a job: from its appointments when HCP has them, otherwise the
// job's own schedule window treated as one (possibly multi-day) visit.
async function getJobVisits(job) {
  const embedded = job.appointments || job.schedule?.appointments;
  if (Array.isArray(embedded) && embedded.length > 0) {
    const visits = readAppointments(embedded);
    if (visits.length > 0) return { visits, source: "embedded" };
  }

  try {
    const visits = readAppointments(await getJobAppointments(job.id));
    if (visits.length > 0) return { visits, source: "appointments" };
  } catch (e) {
    if (!appointmentFetchWarned) {
      appointmentFetchWarned = true;
      console.warn(`[build-office-data] appointments fetch failed (falling back to job schedule): ${e.message.split("\n")[0]}`);
    }
  }

  const start = job.schedule?.scheduled_start;
  const end = job.schedule?.scheduled_end;
  return {
    visits: start ? [{ start, end: end || null, employeeIds: null }] : [],
    source: "schedule",
  };
}

function visitOverlaps(visit, windowStartMs, windowEndMs) {
  const s = new Date(visit.start).getTime();
  const e = visit.end ? new Date(visit.end).getTime() : s;
  return s <= windowEndMs && e >= windowStartMs;
}

async function forEachWithConcurrency(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// Finds jobs that started before today but have a visit today.
// Returns { byTech: Map<techId, entry[]>, jobs: job[] } where each entry is
// { job, dayNumber, totalDays, todayVisitStart, source }.
async function findMultiDayJobsToday({ startISO, endISO, todayDateOnlyET, trackedIds }) {
  const todayStartMs = new Date(startISO).getTime();
  const todayEndMs = new Date(endISO).getTime();
  const lookbackStart = new Date(todayStartMs - MULTI_DAY_LOOKBACK_DAYS * 86400000).toISOString();
  // Stop just before today's window so nothing is counted twice.
  const lookbackEnd = new Date(todayStartMs - 1000).toISOString();

  const earlierJobs = await pullJobsInRange(lookbackStart, lookbackEnd);

  let candidates = earlierJobs.filter(j => {
    if (CANCELED_STATUSES.has(j.work_status)) return false;
    if (!(j.assigned_employees || []).some(e => trackedIds.has(e.id))) return false;
    // Finished jobs only matter if they were finished today (their final day).
    if (COMPLETE_STATUSES.has(j.work_status)) {
      return etDateKey(j.work_timestamps?.completed_at) === todayDateOnlyET;
    }
    return true;
  });

  // Newest first, so if the cap is ever hit the stalest jobs are the ones dropped.
  candidates.sort((a, b) =>
    (b.schedule?.scheduled_start || "").localeCompare(a.schedule?.scheduled_start || "")
  );
  if (candidates.length > MULTI_DAY_MAX_CANDIDATES) {
    console.warn(`[build-office-data] ${candidates.length} multi-day candidates — checking newest ${MULTI_DAY_MAX_CANDIDATES}`);
    candidates = candidates.slice(0, MULTI_DAY_MAX_CANDIDATES);
  }
  console.log(`[build-office-data] Multi-day check: ${earlierJobs.length} jobs in prior ${MULTI_DAY_LOOKBACK_DAYS} days, ${candidates.length} still open (or finished today)`);

  const byTech = new Map();
  const jobs = [];

  await forEachWithConcurrency(candidates, APPOINTMENT_FETCH_CONCURRENCY, async job => {
    try {
      const { visits, source } = await getJobVisits(job);
      const todays = visits.filter(v => visitOverlaps(v, todayStartMs, todayEndMs));
      if (todays.length === 0) return;

      const assignedIds = (job.assigned_employees || []).map(e => e.id);
      const techIds = new Set();
      for (const v of todays) {
        for (const id of (v.employeeIds ?? assignedIds)) techIds.add(id);
      }

      const dates = new Set([todayDateOnlyET]);
      for (const v of visits) for (const k of coveredDates(v.start, v.end)) dates.add(k);
      const ordered = [...dates].sort();

      const entry = {
        job,
        dayNumber: ordered.indexOf(todayDateOnlyET) + 1,
        totalDays: ordered.length,
        todayVisitStart: todays.map(v => v.start).sort()[0],
        source,
      };
      jobs.push(job);
      for (const id of techIds) {
        if (!byTech.has(id)) byTech.set(id, []);
        byTech.get(id).push(entry);
      }

      const names = (job.assigned_employees || [])
        .filter(e => techIds.has(e.id))
        .map(e => e.first_name)
        .join(", ");
      console.log(`[build-office-data]   multi-day today: ${customerLastName(job)} — day ${entry.dayNumber}/${entry.totalDays} — ${names || "(no tracked tech)"} [${source}]`);
    } catch (e) {
      console.warn(`[build-office-data] multi-day check failed for job ${job.id}: ${e.message}`);
    }
  });

  return { byTech, jobs };
}

// ---------------------------------------------------------------------------
// Out-of-office detection — same logic as events slide
// ---------------------------------------------------------------------------

function isOutOfOfficeTitle(title) {
  if (!title) return false;
  const t = title.trim().toLowerCase();
  const outKeywords = [
    "- out", "- off", "- vacation", "- sick", "- doctor", "- dr.",
    "- pto", "- leave", "- appointment", "- appt",
    "- dentist", "- dental", "- medical",
  ];
  for (const kw of outKeywords) {
    if (t.includes(kw)) return true;
  }
  return false;
}

function extractTechNameFromOOO(title) {
  // Pull the part before the dash, uppercase, used to match against roster
  // e.g. "MATT - Out" → "MATT"
  // e.g. "TJ - TJ Dentist" → "TJ"
  const dashIdx = title.indexOf("-");
  if (dashIdx === -1) return null;
  return title.slice(0, dashIdx).trim().toUpperCase();
}

async function getOutOfOfficeTechsToday(calendarId, todayDateOnly) {
  if (!calendarId) return new Set();
  try {
    // Pull events for today only (with a small buffer)
    const startDate = `${todayDateOnly}T00:00:00Z`;
    // End of day plus 12h buffer for timezone
    const endDate = new Date(`${todayDateOnly}T23:59:59Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const endISO = endDate.toISOString();

    const events = await readCalendarEvents(calendarId, {
      startISO: startDate,
      endISO,
    });

    const outNames = new Set();
    for (const e of events) {
      const title = e.summary || "";
      if (!isOutOfOfficeTitle(title)) continue;
      const techName = extractTechNameFromOOO(title);
      if (techName) outNames.add(techName);
    }
    return outNames;
  } catch (e) {
    console.warn(`[build-office-data] OOO fetch failed: ${e.message}`);
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// Crew status per tech
// ---------------------------------------------------------------------------

function classifyTechStatus(tech, jobsToday, multiDayToday, outOfOfficeNames, now) {
  const techDisplayUpper = tech.display.toUpperCase();
  if (outOfOfficeNames.has(techDisplayUpper) || outOfOfficeNames.has(tech.first.toUpperCase())) {
    return { status: "out", label: "OUT", color: "🚫" };
  }

  if (jobsToday.length === 0 && multiDayToday.length === 0) {
    return { status: "no_jobs", label: "NO JOBS TODAY", color: "🔘" };
  }

  // Currently on site — has started_at but no completed_at
  const activeJob = jobsToday.find(j => {
    const wt = j.work_timestamps || {};
    return wt.started_at && !wt.completed_at;
  });
  if (activeJob) {
    const startedAt = activeJob.work_timestamps?.started_at;
    const elapsedMin = minutesSinceISO(startedAt);
    return {
      status: "on_site",
      label: "ON SITE",
      color: "🟢",
      detail: customerLastName(activeJob),
      elapsed: fmtElapsed(elapsedMin),
    };
  }

  // En route — OMW set but not started yet
  const enRouteJob = jobsToday.find(j => {
    const wt = j.work_timestamps || {};
    return wt.on_my_way_at && !wt.started_at && !wt.completed_at;
  });
  if (enRouteJob) {
    return {
      status: "en_route",
      label: "EN ROUTE",
      color: "🟡",
      detail: customerLastName(enRouteJob),
      etaTime: fmtTimeET(enRouteJob.schedule?.scheduled_start),
    };
  }

  // Late — scheduled job whose start was >30 min ago, no OMW
  const lateJob = jobsToday.find(j => {
    if (j.work_status !== "scheduled") return false;
    const wt = j.work_timestamps || {};
    if (wt.on_my_way_at || wt.started_at) return false;
    const schedStart = j.schedule?.scheduled_start;
    if (!schedStart) return false;
    const minutesPast = (now.getTime() - new Date(schedStart).getTime()) / 60000;
    return minutesPast >= 30;
  });
  if (lateJob) {
    return {
      status: "late",
      label: "LATE START",
      color: "🔴",
      detail: customerLastName(lateJob),
      etaTime: fmtTimeET(lateJob.schedule?.scheduled_start),
    };
  }

  // On a multi-day job today. HCP tracks OMW/start/finish once per job (not
  // per visit), so the job's started_at is from day one — show which day of
  // the job this is instead of an "on site" timer.
  const openMultiDay = multiDayToday.filter(e => !COMPLETE_STATUSES.has(e.job.work_status));
  if (openMultiDay.length > 0) {
    // Prefer a visit that's already underway; otherwise the next one today.
    const nowMs = now.getTime();
    const sorted = [...openMultiDay].sort((a, b) =>
      (a.todayVisitStart || "").localeCompare(b.todayVisitStart || "")
    );
    const underway = sorted.filter(e => new Date(e.todayVisitStart).getTime() <= nowMs);
    const entry = underway.length > 0 ? underway[underway.length - 1] : sorted[0];
    const startsLater = new Date(entry.todayVisitStart).getTime() > nowMs;
    return {
      status: "multi_day",
      label: "MULTI-DAY",
      color: "🔵",
      detail: customerLastName(entry.job),
      dayLabel: entry.totalDays > 1 ? `Day ${entry.dayNumber} of ${entry.totalDays}` : "",
      etaTime: startsLater ? fmtTimeET(entry.todayVisitStart) : null,
    };
  }

  // Partition: completed jobs vs upcoming jobs
  const upcomingJobs = jobsToday.filter(j => {
    return j.work_status === "scheduled" && !COMPLETE_STATUSES.has(j.work_status);
  });

  // If there are no upcoming jobs, all jobs are completed → DAY COMPLETE
  // (includes a multi-day job whose final day was today)
  if (upcomingJobs.length === 0) {
    const doneCount = jobsToday.length + multiDayToday.length;
    return {
      status: "done",
      label: "DAY COMPLETE",
      color: "⚫",
      detail: `${doneCount} job${doneCount === 1 ? "" : "s"} complete`,
    };
  }

  // There ARE upcoming jobs — show the next one (earliest by scheduled_start)
  upcomingJobs.sort((a, b) => {
    const aTime = a.schedule?.scheduled_start || "";
    const bTime = b.schedule?.scheduled_start || "";
    return aTime.localeCompare(bTime);
  });
  const nextJob = upcomingJobs[0];

  return {
    status: "available",
    label: "AVAILABLE",
    color: "⚪",
    detail: customerLastName(nextJob),
    etaTime: fmtTimeET(nextJob.schedule?.scheduled_start),
  };
}

// ---------------------------------------------------------------------------
// Today summary stats
// ---------------------------------------------------------------------------

function buildTodaySummary(allTodayJobs) {
  const counts = {
    scheduled: 0,
    completed: 0,
    inProgress: 0,
    notStarted: 0,
  };
  let revenueCents = 0;

  for (const j of allTodayJobs) {
    const status = j.work_status;
    if (COMPLETE_STATUSES.has(status)) {
      counts.completed += 1;
      revenueCents += j.total_amount || 0;
    } else if (status === "in progress") {
      counts.inProgress += 1;
    } else if (status === "scheduled") {
      // Differentiate "not started yet" from "scheduled but should have started"
      const wt = j.work_timestamps || {};
      if (wt.on_my_way_at || wt.started_at) {
        counts.inProgress += 1;
      } else {
        counts.notStarted += 1;
      }
    }
  }
  counts.scheduled = counts.completed + counts.inProgress + counts.notStarted;

  return {
    ...counts,
    revenueDisplay: formatRevenue(revenueCents),
    revenueCents,
  };
}

function formatRevenue(amountCents) {
  if (!amountCents || amountCents < 0) return "$0";
  const dollars = amountCents / 100;
  return "$" + dollars.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// Open estimates and past-due invoices
// ---------------------------------------------------------------------------

// Pull estimates from the /estimates endpoint and filter to "open" ones —
// $0 estimates dated within the current calendar week + 2 prior weeks,
// whose scheduled date has already passed (or unscheduled, which use created_at).
// Excludes canceled and estimates that have been approved or rejected.
async function pullOpenEstimates() {
  // Pull a generous window — we'll filter to current+2 weeks client-side.
  // Window: last 45 days (still useful as a coarse pull window).
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 45);
  start.setUTCHours(0, 0, 0, 0);

  // Paginate through /estimates. HCP's server-side date filter doesn't apply
  // here, so we walk many pages and filter client-side.
  // Cap at 20 pages × 100/page = 2000 estimates max.
  const allEstimates = [];
  let page = 1;
  const MAX_PAGES = 20;
  while (page <= MAX_PAGES) {
    let resp;
    try {
      const { getEstimates } = await import("./hcp.js");
      resp = await getEstimates({
        startISO: start.toISOString(),
        endISO: end.toISOString(),
        pageSize: 100,
        page,
      });
    } catch (e) {
      console.warn(`[build-office-data] estimates page ${page} failed: ${e.message}`);
      break;
    }
    const batch = resp?.estimates || [];
    allEstimates.push(...batch);
    const totalPages = resp?.total_pages || 1;
    if (page >= totalPages) break;
    page += 1;
  }
  console.log(`[build-office-data] pulled ${allEstimates.length} estimates total (raw, before filters)`);

  // Calendar-week cutoff: Monday of two weeks ago at 00:00 ET
  const cutoffDate = mondayTwoWeeksAgoET();
  const cutoffTime = cutoffDate.getTime();
  console.log(`[build-office-data] estimates cutoff: ${cutoffDate.toISOString()} (this week + 2 prior weeks)`);

  // Statuses we EXCLUDE because they mean the estimate is closed/done
  const CLOSED_STATUSES = new Set([
    "user canceled", "pro canceled", "canceled", "deleted",
  ]);

  const now = Date.now();

  const openEstimates = allEstimates.filter(est => {
    // Reference date — scheduled date if it exists, otherwise created date.
    const refDate = est.schedule?.scheduled_start || est.created_at;
    if (!refDate) return false;
    const refTime = new Date(refDate).getTime();

    // Window: must be within current week + 2 prior weeks
    if (refTime < cutoffTime) return false;

    // Future-scheduled estimates — skip. Only show items that should already
    // have happened (or did happen) and still need pricing follow-up.
    if (refTime > now) return false;

    // Exclude canceled/deleted estimates
    if (CLOSED_STATUSES.has(est.work_status)) return false;

    // Must have at least one option
    const options = est.options || [];
    if (options.length === 0) return false;

    // Take the first option as canonical
    const opt = options[0];

    // Must NOT have been approved or rejected — still open
    const approval = opt.approval_status;
    if (approval === "approved" || approval === "rejected") return false;

    // ONLY show estimates with $0 total — these are the ones missing pricing.
    const amount = opt.total_amount || 0;
    if (amount > 0) return false;

    return true;
  });

  // Sort by reference date ascending — oldest first (highest age)
  openEstimates.sort((a, b) => {
    const aRef = a.schedule?.scheduled_start || a.created_at || "";
    const bRef = b.schedule?.scheduled_start || b.created_at || "";
    return aRef.localeCompare(bRef);
  });

  return openEstimates.map(est => {
    const opt = est.options[0];
    // Age based on scheduled date — "tech went out X days ago and didn't enter pricing"
    // For unscheduled estimates, fall back to created_at
    const refDate = est.schedule?.scheduled_start || est.created_at;
    const ageDays = refDate ? Math.floor((now - new Date(refDate).getTime()) / 86400000) : 0;
    const techName = (est.assigned_employees || [])[0]?.first_name || "";
    return {
      id: est.id,
      estimateNumber: est.estimate_number || "",
      ageDays,
      amount: 0,
      amountDisplay: "NO PRICE",
      customer: customerLastName(est),
      techName: overrideFirstName(techName).split(/\s+/)[0],
      description: (opt.name || est.estimate_number || "Estimate").slice(0, 50),
    };
  });
}

async function pullPastDueInvoices() {
  // Pull jobs from a generous 90-day window for context, then filter to
  // current calendar week + 2 prior weeks on the office display.
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 90);
  start.setUTCHours(0, 0, 0, 0);

  const allJobs = await pullJobsInRange(start.toISOString(), end.toISOString());

  const unpaid = allJobs.filter(j => {
    const balance = j.outstanding_balance || 0;
    if (balance <= 0) return false;
    // Only count completed jobs — work in progress isn't "past due"
    return COMPLETE_STATUSES.has(j.work_status);
  });

  // Calendar-week cutoff: Monday of two weeks ago at 00:00 ET
  const cutoffDate = mondayTwoWeeksAgoET();
  const cutoffTime = cutoffDate.getTime();
  console.log(`[build-office-data] past-due invoices cutoff: ${cutoffDate.toISOString()} (this week + 2 prior weeks)`);

  // Calculate age from completed_at, filter to the calendar-week window
  const now = Date.now();
  const withAge = unpaid.map(j => {
    const completedAt = j.work_timestamps?.completed_at || j.schedule?.scheduled_end;
    const ageDays = completedAt ? Math.floor((now - new Date(completedAt).getTime()) / 86400000) : 0;
    const completedTime = completedAt ? new Date(completedAt).getTime() : 0;
    return {
      id: j.id,
      ageDays,
      completedTime,
      amount: j.outstanding_balance || 0,
      amountDisplay: formatRevenue(j.outstanding_balance || 0),
      customer: customerLastName(j),
    };
  });

  // Filter: completed within current week + 2 prior weeks
  const pastDue = withAge.filter(i => i.completedTime >= cutoffTime);
  pastDue.sort((a, b) => b.ageDays - a.ageDays);
  return pastDue;
}

// ---------------------------------------------------------------------------
// Hot list — what needs attention
// ---------------------------------------------------------------------------

// Seeded shuffle — deterministic for a given seed, so a single build is consistent
// but the seed changes every 30 min, naturally rotating which items appear in HOT.
function seededShuffle(array, seed) {
  const result = [...array];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    // Simple linear congruential generator for repeatable randomness
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildHotList(crew, openEstimates, pastDueInvoices) {
  const hot = [];

  // 1. Late techs — always first, never rotated (urgent and time-sensitive)
  for (const c of crew) {
    if (c.status.status === "late") {
      hot.push({
        severity: "high",
        icon: "🔴",
        text: `${c.tech.display} is past scheduled start with no OMW — ${c.status.detail || "next customer"}`,
      });
      if (hot.length >= 3) break;
    }
  }

  // 2. Estimates missing pricing >2 days old — sales follow-up needed
  if (hot.length < 3) {
    const oldEstimates = openEstimates.filter(e => e.ageDays >= 2);
    // Sort by age desc — oldest first
    oldEstimates.sort((a, b) => b.ageDays - a.ageDays);
    for (const e of oldEstimates) {
      hot.push({
        severity: "medium",
        icon: "⚠️",
        text: `${e.customer} — estimate from ${e.techName}, ${e.ageDays}d old, no price entered`,
      });
      if (hot.length >= 3) break;
    }
  }

  // 3. Aging invoices — ROTATED. The seed is based on the current
  // 30-minute window, so the rotation changes naturally throughout the day
  // but stays stable within a single build's data. Now showing only invoices
  // within current week + 2 prior weeks (handled in pullPastDueInvoices).
  if (hot.length < 3) {
    // Use everything in the past-due list since it's already windowed
    const seed = Math.floor(Date.now() / (30 * 60 * 1000));
    const shuffled = seededShuffle(pastDueInvoices, seed);
    for (const i of shuffled) {
      hot.push({
        severity: "medium",
        icon: "⚠️",
        text: `${i.customer} — ${i.amountDisplay} unpaid, ${i.ageDays} days past due`,
      });
      if (hot.length >= 3) break;
    }
  }

  return hot.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function buildOfficeData({ calendarId } = {}) {
  console.log(`[build-office-data] Starting office dashboard build at ${new Date().toISOString()}`);

  const { startISO, endISO, todayDateOnlyET } = todayBoundsET();
  console.log(`[build-office-data] Today (ET): ${todayDateOnlyET}, range: ${startISO} → ${endISO}`);

  const trackedIds = new Set(TIME_TRACKING_TECHS.map(t => t.id));

  // Fetch in parallel. The multi-day check is best-effort: if it fails, the
  // board still builds exactly as it did before.
  const [todayJobs, multiDay, ooOfficeNames, openEstimates, pastDueInvoices] = await Promise.all([
    pullJobsInRange(startISO, endISO),
    findMultiDayJobsToday({ startISO, endISO, todayDateOnlyET, trackedIds }).catch(e => {
      console.warn(`[build-office-data] multi-day check failed: ${e.message}`);
      return { byTech: new Map(), jobs: [] };
    }),
    getOutOfOfficeTechsToday(calendarId, todayDateOnlyET),
    pullOpenEstimates(),
    pullPastDueInvoices(),
  ]);

  console.log(`[build-office-data] Pulled ${todayJobs.length} jobs for today (+${multiDay.jobs.length} multi-day jobs with a visit today)`);
  console.log(`[build-office-data] OOO techs today: ${[...ooOfficeNames].join(", ") || "(none)"}`);
  console.log(`[build-office-data] Open estimates: ${openEstimates.length}`);
  console.log(`[build-office-data] Past-due invoices: ${pastDueInvoices.length}`);

  // Build crew status — one entry per tech in TIME_TRACKING_TECHS allowlist
  const now = nowET();
  const crew = [];

  for (const tech of TIME_TRACKING_TECHS) {
    const techJobs = todayJobs.filter(j => {
      const employees = j.assigned_employees || [];
      return employees.some(e => e.id === tech.id);
    });
    const techMultiDay = multiDay.byTech.get(tech.id) || [];
    const status = classifyTechStatus(tech, techJobs, techMultiDay, ooOfficeNames, now);
    crew.push({
      tech: {
        id: tech.id,
        display: tech.display,
      },
      status,
      jobCount: techJobs.length + techMultiDay.length,
    });
  }

  // Sort crew: active/working first, then available, then out
  const statusPriority = {
    on_site: 1, multi_day: 2, en_route: 3, late: 4, available: 5, idle: 6,
    done: 7, no_jobs: 8, out: 9,
  };
  crew.sort((a, b) => {
    const aP = statusPriority[a.status.status] || 99;
    const bP = statusPriority[b.status.status] || 99;
    if (aP !== bP) return aP - bP;
    return a.tech.display.localeCompare(b.tech.display);
  });

  // Multi-day jobs with a visit today count toward today's numbers too
  // (in progress, or completed + revenue if today was the final day).
  const todaySummary = buildTodaySummary([...todayJobs, ...multiDay.jobs]);
  const totalPastDueValue = pastDueInvoices.reduce((sum, i) => sum + i.amount, 0);

  const hotList = buildHotList(crew, openEstimates, pastDueInvoices);

  return {
    generatedAt: new Date().toISOString(),
    todayDateOnly: todayDateOnlyET,
    crew,
    todaySummary,
    openEstimates: {
      list: openEstimates.slice(0, 8),
      totalCount: openEstimates.length,
      totalValue: `${openEstimates.length} ESTIMATES MISSING PRICING`,
      agedCount: openEstimates.filter(e => e.ageDays >= 7).length,
      agedValue: "",
    },
    pastDueInvoices: {
      list: pastDueInvoices.slice(0, 8),
      totalCount: pastDueInvoices.length,
      totalValue: formatRevenue(totalPastDueValue),
    },
    hotList,
  };
}
