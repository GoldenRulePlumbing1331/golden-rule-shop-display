// Office display data layer.
// Pulls today's HCP data and shapes it into a dashboard-ready structure.

import { getJobsInRange, getEmployees } from "./hcp.js";
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

function classifyTechStatus(tech, jobsToday, outOfOfficeNames, now) {
  const techDisplayUpper = tech.display.toUpperCase();
  if (outOfOfficeNames.has(techDisplayUpper) || outOfOfficeNames.has(tech.first.toUpperCase())) {
    return { status: "out", label: "OUT", color: "🚫" };
  }

  if (jobsToday.length === 0) {
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

  // Partition: completed jobs vs upcoming jobs
  const upcomingJobs = jobsToday.filter(j => {
    return j.work_status === "scheduled" && !COMPLETE_STATUSES.has(j.work_status);
  });

  // If there are no upcoming jobs, all jobs are completed → DAY COMPLETE
  if (upcomingJobs.length === 0) {
    return {
      status: "done",
      label: "DAY COMPLETE",
      color: "⚫",
      detail: `${jobsToday.length} job${jobsToday.length === 1 ? "" : "s"} complete`,
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
// estimates that have been delivered to the customer, have a real dollar value,
// and haven't been approved or rejected yet.
async function pullOpenEstimates() {
  // Window: last 45 days. Estimates older than that are unlikely to be
  // closable — they're stale leads, not actionable follow-ups.
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 45);
  start.setUTCHours(0, 0, 0, 0);

  // Paginate through /estimates. HCP's server-side date filter doesn't appear
  // to apply here, so we may need to walk many pages to find recent estimates.
  // Cap at 20 pages × 100/page = 2000 estimates max, then filter client-side.
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

  // Diagnostic — what's the age distribution of what we pulled?
  if (allEstimates.length > 0) {
    const now = Date.now();
    const ages = allEstimates
      .map(e => e.created_at ? Math.floor((now - new Date(e.created_at).getTime()) / 86400000) : -1)
      .filter(a => a >= 0);
    const oldest = Math.max(...ages);
    const newest = Math.min(...ages);
    const within45 = ages.filter(a => a <= 45).length;
    console.log(`[build-office-data] estimate ages: newest=${newest}d, oldest=${oldest}d, within 45 days=${within45}`);
  }


  // Hard age cap — only consider estimates created in the last 45 days.
  // We do this client-side because HCP's server-side date filter
  // doesn't appear to be honored on the /estimates endpoint.
  const fortyFiveDaysAgo = new Date();
  fortyFiveDaysAgo.setUTCDate(fortyFiveDaysAgo.getUTCDate() - 45);

  // Statuses we EXCLUDE because they mean the estimate is closed/done
  const CLOSED_STATUSES = new Set([
    "user canceled", "pro canceled", "canceled", "deleted",
  ]);

  const openEstimates = allEstimates.filter(est => {
    // Age cap — must be created within the last 45 days
    const createdAt = est.created_at;
    if (!createdAt) return false;
    if (new Date(createdAt) < fortyFiveDaysAgo) return false;

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
    // Covers all stages: not yet scheduled, scheduled, in progress, delivered.
    // Any $0 estimate sitting in HCP needs attention from someone.
    const amount = opt.total_amount || 0;
    if (amount > 0) return false;

    return true;
  });

  // Sort by created_at ascending — oldest first (highest age)
  openEstimates.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));

  const now = Date.now();
  return openEstimates.map(est => {
    const opt = est.options[0];
    const refDate = est.created_at;
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
  // Pull jobs from the last 90 days with outstanding balance
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

  // Calculate age from work_timestamps.completed_at (when work finished)
  const now = Date.now();
  const withAge = unpaid.map(j => {
    const completedAt = j.work_timestamps?.completed_at || j.schedule?.scheduled_end;
    const ageDays = completedAt ? Math.floor((now - new Date(completedAt).getTime()) / 86400000) : 0;
    return {
      id: j.id,
      ageDays,
      amount: j.outstanding_balance || 0,
      amountDisplay: formatRevenue(j.outstanding_balance || 0),
      customer: customerLastName(j),
    };
  });

  // Filter to truly past due (more than 7 days old)
  const pastDue = withAge.filter(i => i.ageDays >= 7);
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

  // 3. Aging invoices (>21 days) — ROTATED. The seed is based on the current
  // 30-minute window, so the rotation changes naturally throughout the day
  // but stays stable within a single build's data.
  if (hot.length < 3) {
    const oldInvoices = pastDueInvoices.filter(i => i.ageDays >= 21);
    // Seed: 30-min window number since epoch
    const seed = Math.floor(Date.now() / (30 * 60 * 1000));
    const shuffled = seededShuffle(oldInvoices, seed);
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

  // Fetch in parallel
  const [todayJobs, ooOfficeNames, openEstimates, pastDueInvoices] = await Promise.all([
    pullJobsInRange(startISO, endISO),
    getOutOfOfficeTechsToday(calendarId, todayDateOnlyET),
    pullOpenEstimates(),
    pullPastDueInvoices(),
  ]);

  console.log(`[build-office-data] Pulled ${todayJobs.length} jobs for today`);
  console.log(`[build-office-data] OOO techs today: ${[...ooOfficeNames].join(", ") || "(none)"}`);
  console.log(`[build-office-data] Open estimates: ${openEstimates.length}`);
  console.log(`[build-office-data] Past-due invoices: ${pastDueInvoices.length}`);

  // Build crew status — one entry per tech in TIME_TRACKING_TECHS allowlist
  const now = nowET();
  const crew = [];

  // DEBUG: log every job and its assigned employees, so we can see what HCP returns
  console.log(`[build-office-data] DEBUG: ${todayJobs.length} jobs for today, breakdown of employee assignments:`);
  for (const j of todayJobs) {
    const employees = j.assigned_employees || [];
    const empIds = employees.map(e => `${e.first_name || ""} ${e.last_name || ""}|${e.id}`).join(" + ");
    const status = j.work_status || "?";
    const sched = j.schedule?.scheduled_start ? j.schedule.scheduled_start.slice(11, 16) : "??:??";
    console.log(`  ${sched} [${status}] ${(j.description || "no desc").slice(0, 40)} → ${empIds || "(unassigned)"}`);
  }
  console.log(`[build-office-data] DEBUG: matching against ${TIME_TRACKING_TECHS.length} techs in roster`);
  for (const t of TIME_TRACKING_TECHS) {
    console.log(`  ${t.display} → ${t.id}`);
  }

  for (const tech of TIME_TRACKING_TECHS) {
    const techJobs = todayJobs.filter(j => {
      const employees = j.assigned_employees || [];
      return employees.some(e => e.id === tech.id);
    });
    console.log(`[build-office-data] DEBUG match: ${tech.display} (${tech.id}) → matched ${techJobs.length} jobs`);
    if (techJobs.length > 0) {
      for (const j of techJobs) {
        console.log(`  - ${j.work_status} @ ${j.schedule?.scheduled_start?.slice(11, 16)} ${(j.description || "").slice(0, 40)}`);
      }
    }
    const status = classifyTechStatus(tech, techJobs, ooOfficeNames, now);
    console.log(`[build-office-data] DEBUG status: ${tech.display} → ${status.status} (${status.label})`);
    crew.push({
      tech: {
        id: tech.id,
        display: tech.display,
      },
      status,
      jobCount: techJobs.length,
    });
  }

  // Sort crew: active/working first, then available, then out
  const statusPriority = {
    on_site: 1, en_route: 2, late: 3, available: 4, idle: 5,
    done: 6, no_jobs: 7, out: 8,
  };
  crew.sort((a, b) => {
    const aP = statusPriority[a.status.status] || 99;
    const bP = statusPriority[b.status.status] || 99;
    if (aP !== bP) return aP - bP;
    return a.tech.display.localeCompare(b.tech.display);
  });

  const todaySummary = buildTodaySummary(todayJobs);
  const totalOpenEstValue = openEstimates.reduce((sum, e) => sum + e.amount, 0);
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
