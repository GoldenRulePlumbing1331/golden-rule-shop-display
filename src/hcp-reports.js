// Extra HCP reports for the shop slideshow:
//   - Revenue by technician (today / this week / last week / month to date)
//   - Estimate win rate by technician (last 30 days)
//
// Each report is split into a pure `rollup*` function (data in, numbers out,
// easy to test) and a thin `get*` wrapper that pulls from the HCP API.
//
// "Truck" = technician: each tech drives their own truck, so revenue per tech
// is revenue per truck. A job's revenue is credited to its LEAD tech
// (assigned_employees[0]), the same rule the "jobs completed by technician"
// chart already uses. Revenue is the job's total_amount (cents), counted on the
// day the job was completed.

import { getJobsInRange, getEstimates } from "./hcp.js";
import { TIME_TRACKING_TECHS } from "./jobs.js";

const ET = "America/New_York";

const COMPLETE_STATUSES = new Set(["complete", "complete unrated", "complete rated"]);
const CANCELED_STATUSES = new Set(["user canceled", "pro canceled", "canceled", "deleted"]);

const TECH_BY_ID = new Map(TIME_TRACKING_TECHS.map(t => [t.id, t]));

// ---------------------------------------------------------------------------
// Date helpers (everything is bucketed by Eastern calendar day)
// ---------------------------------------------------------------------------

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

function keyToUTCNoon(key) {
  return new Date(`${key}T12:00:00Z`);
}

function addDaysKey(key, n) {
  return new Date(keyToUTCNoon(key).getTime() + n * 86400000).toISOString().slice(0, 10);
}

// Monday of the week containing `key`.
function mondayKey(key) {
  const dow = keyToUTCNoon(key).getUTCDay(); // 0 = Sun
  return addDaysKey(key, dow === 0 ? -6 : 1 - dow);
}

export function periodKeys(now = new Date()) {
  const today = etDateKey(now);
  const weekStart = mondayKey(today);
  const lastWeekStart = addDaysKey(weekStart, -7);
  const daysIntoWeek = Math.round((keyToUTCNoon(today) - keyToUTCNoon(weekStart)) / 86400000);
  return {
    today,
    weekStart,
    lastWeekStart,
    lastWeekEnd: addDaysKey(weekStart, -1),
    lastWeekSamePointEnd: addDaysKey(lastWeekStart, daysIntoWeek),
    monthStart: `${today.slice(0, 7)}-01`,
  };
}

const inRange = (key, from, to) => key != null && key >= from && key <= to;

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

async function pullAllJobs(startISO, endISO) {
  const all = [];
  let page = 1;
  while (true) {
    const resp = await getJobsInRange({ startISO, endISO, pageSize: 100, page });
    all.push(...(resp?.jobs || []));
    if (page >= (resp?.total_pages || 1)) break;
    page += 1;
    if (page > 30) break;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Revenue by tech
// ---------------------------------------------------------------------------

function fmtMoney(cents) {
  if (!cents || cents < 0) return "$0";
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

export function rollupRevenue(jobs, { now = new Date() } = {}) {
  const k = periodKeys(now);

  const blank = () => ({ cents: 0, jobs: 0 });
  const periods = {
    today: blank(), week: blank(), lastWeek: blank(),
    lastWeekSamePoint: blank(), month: blank(),
  };
  const techRows = new Map();
  for (const t of TIME_TRACKING_TECHS) {
    techRows.set(t.id, {
      id: t.id, name: t.display,
      week: blank(), lastWeek: blank(), month: blank(),
    });
  }
  let otherWeekCents = 0;

  const add = (bucket, cents) => { bucket.cents += cents; bucket.jobs += 1; };

  for (const j of jobs) {
    if (!COMPLETE_STATUSES.has(j.work_status)) continue;
    const cents = j.total_amount || 0;

    // Revenue lands on the day the job was finished; fall back to its schedule.
    const when = j.work_timestamps?.completed_at
      || j.schedule?.scheduled_end
      || j.schedule?.scheduled_start;
    const day = etDateKey(when);
    if (!day) continue;

    const inWeek = inRange(day, k.weekStart, k.today);
    const inLastWeek = inRange(day, k.lastWeekStart, k.lastWeekEnd);
    const inMonth = inRange(day, k.monthStart, k.today);

    if (day === k.today) add(periods.today, cents);
    if (inWeek) add(periods.week, cents);
    if (inLastWeek) add(periods.lastWeek, cents);
    if (inRange(day, k.lastWeekStart, k.lastWeekSamePointEnd)) add(periods.lastWeekSamePoint, cents);
    if (inMonth) add(periods.month, cents);

    const lead = (j.assigned_employees || [])[0];
    const row = lead ? techRows.get(lead.id) : null;
    if (row) {
      if (inWeek) add(row.week, cents);
      if (inLastWeek) add(row.lastWeek, cents);
      if (inMonth) add(row.month, cents);
    } else if (inWeek) {
      otherWeekCents += cents;
    }
  }

  const byTech = [...techRows.values()]
    .filter(r => r.week.jobs > 0 || r.month.jobs > 0)
    .map(r => ({
      ...r,
      weekDisplay: fmtMoney(r.week.cents),
      monthDisplay: fmtMoney(r.month.cents),
      avgTicketCents: r.week.jobs > 0 ? Math.round(r.week.cents / r.week.jobs) : null,
      avgTicketDisplay: r.week.jobs > 0 ? fmtMoney(r.week.cents / r.week.jobs) : "—",
    }))
    .sort((a, b) => b.week.cents - a.week.cents || b.month.cents - a.month.cents);

  // Only compare to last week once there's something to compare.
  let weekDeltaPct = null;
  if (periods.week.cents > 0 && periods.lastWeekSamePoint.cents > 0) {
    weekDeltaPct = Math.round(
      ((periods.week.cents - periods.lastWeekSamePoint.cents) / periods.lastWeekSamePoint.cents) * 100
    );
  }

  const display = {};
  for (const [name, b] of Object.entries(periods)) display[name] = fmtMoney(b.cents);

  return {
    asOfDay: k.today,
    weekStart: k.weekStart,
    monthLabel: new Intl.DateTimeFormat("en-US", { timeZone: ET, month: "long" })
      .format(keyToUTCNoon(k.today)).toUpperCase(),
    periods,
    display,
    weekDeltaPct,
    otherWeekCents,
    otherWeekDisplay: fmtMoney(otherWeekCents),
    byTech,
    maxWeekCents: Math.max(1, ...byTech.map(r => r.week.cents)),
  };
}

export async function getRevenueByTech({ now = new Date() } = {}) {
  const k = periodKeys(now);
  const earliest = [k.lastWeekStart, k.monthStart].sort()[0];
  // Pad both ends: HCP filters on scheduled start, we bucket on completion day.
  const startISO = new Date(keyToUTCNoon(earliest).getTime() - 2 * 86400000).toISOString();
  const endISO = new Date(now.getTime() + 36 * 3600000).toISOString();

  const jobs = await pullAllJobs(startISO, endISO);
  console.log(`[hcp-reports] revenue: pulled ${jobs.length} jobs (${earliest} → today)`);
  return rollupRevenue(jobs, { now });
}

// ---------------------------------------------------------------------------
// Estimate win rate by tech
// ---------------------------------------------------------------------------

function decideEstimate(est) {
  const priced = (est.options || []).filter(o => (o.total_amount || 0) > 0);
  if (priced.length === 0) return null; // unpriced — the office board chases those
  const approved = priced.filter(o => o.approval_status === "approved");
  if (approved.length > 0) {
    return { state: "won", cents: approved.reduce((s, o) => s + (o.total_amount || 0), 0), sentCents: Math.max(...priced.map(o => o.total_amount || 0)) };
  }
  const allDeclined = priced.every(o => o.approval_status === "rejected" || o.approval_status === "declined");
  return {
    state: allDeclined ? "lost" : "open",
    cents: 0,
    sentCents: Math.max(...priced.map(o => o.total_amount || 0)),
  };
}

export function rollupEstimates(estimates, { now = new Date(), daysBack = 30 } = {}) {
  const sinceKey = addDaysKey(etDateKey(now), -daysBack);
  const statusCounts = {};

  const blank = () => ({ sent: 0, won: 0, lost: 0, open: 0, wonCents: 0, openCents: 0 });
  const team = blank();
  const rows = new Map(TIME_TRACKING_TECHS.map(t => [t.id, { id: t.id, name: t.display, ...blank() }]));

  for (const est of estimates) {
    if (CANCELED_STATUSES.has(est.work_status)) continue;
    const day = etDateKey(est.created_at || est.schedule?.scheduled_start);
    if (!day || day < sinceKey) continue;

    const decision = decideEstimate(est);
    if (!decision) continue;

    for (const o of est.options || []) {
      const s = o.approval_status || "(none)";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }

    const targets = [team];
    const lead = (est.assigned_employees || [])[0];
    const row = lead ? rows.get(lead.id) : null;
    if (row) targets.push(row);

    for (const t of targets) {
      t.sent += 1;
      if (decision.state === "won") { t.won += 1; t.wonCents += decision.cents; }
      else if (decision.state === "lost") t.lost += 1;
      else { t.open += 1; t.openCents += decision.sentCents; }
    }
  }

  const withRates = r => ({
    ...r,
    winPct: r.sent > 0 ? Math.round((r.won / r.sent) * 100) : null,
    wonDisplay: fmtMoney(r.wonCents),
    openDisplay: fmtMoney(r.openCents),
  });

  const byTech = [...rows.values()]
    .filter(r => r.sent > 0)
    .map(withRates)
    .sort((a, b) => b.wonCents - a.wonCents || b.sent - a.sent);

  return { daysBack, statusCounts, team: withRates(team), byTech };
}

export async function getEstimateWinRates({ now = new Date(), daysBack = 30 } = {}) {
  const end = new Date(now);
  const start = new Date(now.getTime() - (daysBack + 5) * 86400000);

  const all = [];
  let page = 1;
  while (page <= 20) {
    const resp = await getEstimates({
      startISO: start.toISOString(), endISO: end.toISOString(), pageSize: 100, page,
    });
    all.push(...(resp?.estimates || []));
    if (page >= (resp?.total_pages || 1)) break;
    page += 1;
  }

  const result = rollupEstimates(all, { now, daysBack });
  console.log(
    `[hcp-reports] estimates: ${all.length} pulled, ${result.team.sent} priced in last ${daysBack}d ` +
    `(${result.team.won} won / ${result.team.lost} lost / ${result.team.open} open); ` +
    `option approval statuses: ${JSON.stringify(result.statusCounts)}`
  );

  // A win rate of 0 across a pile of estimates almost always means the
  // approval field isn't what we think it is, not that nobody bought. Better to
  // hide the slide than to put a bogus 0% on the shop TV.
  if (result.team.sent < 5 || result.team.won === 0) {
    throw new Error(
      `estimate data not trustworthy yet (sent=${result.team.sent}, won=${result.team.won}) — slide hidden`
    );
  }
  return result;
}
