// Offline checks for the revenue + estimate rollups (no HCP access needed).
//   node scripts/test-reports-offline.js

import assert from "node:assert/strict";
import { rollupRevenue, rollupEstimates, periodKeys } from "../src/hcp-reports.js";
import { TIME_TRACKING_TECHS } from "../src/jobs.js";

const [jay, matt] = [
  TIME_TRACKING_TECHS.find(t => t.display === "Jay"),
  TIME_TRACKING_TECHS.find(t => t.display === "Matt"),
];

// Wednesday 2026-10-07, 2pm Eastern (18:00Z during EDT).
const now = new Date("2026-10-07T18:00:00Z");
const k = periodKeys(now);
assert.equal(k.today, "2026-10-07");
assert.equal(k.weekStart, "2026-10-05");          // Monday
assert.equal(k.lastWeekStart, "2026-09-28");
assert.equal(k.lastWeekEnd, "2026-10-04");
assert.equal(k.lastWeekSamePointEnd, "2026-09-30"); // last Wed
assert.equal(k.monthStart, "2026-10-01");

const job = (status, dollars, completedISO, ...leads) => ({
  work_status: status,
  total_amount: dollars * 100,
  work_timestamps: { completed_at: completedISO },
  assigned_employees: leads.map(t => ({ id: t.id })),
});

const jobs = [
  job("complete", 1000, "2026-10-07T15:00:00Z", jay),            // today
  job("complete rated", 500, "2026-10-06T15:00:00Z", jay, matt), // this week, crew: credit Jay only
  job("complete", 300, "2026-10-05T15:00:00Z", matt),            // this week (Monday)
  job("complete", 200, "2026-10-05T15:00:00Z", { id: "pro_unknown" }), // this week, non-listed lead
  job("scheduled", 9999, null, jay),                              // not complete: ignored
  job("user canceled", 777, "2026-10-07T15:00:00Z", jay),        // canceled: ignored
  job("complete", 400, "2026-09-29T15:00:00Z", jay),             // last week (Tue), before same-point cutoff
  job("complete", 50, "2026-10-01T03:30:00Z", jay),              // 11:30pm ET Wed Sep 30 -> last week, inside same-point cutoff
  job("complete", 100, "2026-10-01T04:30:00Z", jay),             // 12:30am ET Thu Oct 1 -> last week, past cutoff, in October
  job("complete", 600, "2026-10-02T15:00:00Z", matt),            // last week (Fri), past cutoff, in October
];
const r = rollupRevenue(jobs, { now });

assert.equal(r.periods.today.cents, 1000 * 100);
assert.equal(r.periods.week.cents, (1000 + 500 + 300 + 200) * 100);
assert.equal(r.periods.lastWeek.cents, (400 + 50 + 100 + 600) * 100);
assert.equal(r.periods.lastWeekSamePoint.cents, (400 + 50) * 100);   // Mon Sep 28 – Wed Sep 30 only
assert.equal(r.periods.month.cents, (1000 + 500 + 300 + 200 + 100 + 600) * 100); // Oct 1 onward, by ET day
assert.equal(r.otherWeekCents, 200 * 100);
assert.equal(r.weekDeltaPct, Math.round(((2000 - 450) / 450) * 100));

const jayRow = r.byTech.find(x => x.name === "Jay");
assert.equal(jayRow.week.cents, (1000 + 500) * 100);          // lead credit only
assert.equal(jayRow.week.jobs, 2);
const mattRow = r.byTech.find(x => x.name === "Matt");
assert.equal(mattRow.week.cents, 300 * 100);                  // crew job did NOT credit Matt
assert.equal(r.byTech[0].name, "Jay");                        // sorted by week revenue

// Estimates
const est = (daysAgo, options, lead, status = "scheduled") => ({
  work_status: status,
  created_at: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
  assigned_employees: lead ? [{ id: lead.id }] : [],
  options,
});
const opt = (dollars, approval) => ({ total_amount: dollars * 100, approval_status: approval });

const e = rollupEstimates([
  est(2, [opt(1000, "approved")], jay),
  est(3, [opt(2000, "rejected")], jay),
  est(4, [opt(1500, "pending")], jay),
  est(5, [opt(800, "approved"), opt(1200, "rejected")], matt), // any approved option => won
  est(6, [opt(0, "pending")], matt),                            // unpriced: skipped
  est(40, [opt(900, "approved")], matt),                        // outside 30 days
  est(1, [opt(500, "approved")], jay, "user canceled"),         // canceled
], { now });

assert.equal(e.team.sent, 4);
assert.equal(e.team.won, 2);
assert.equal(e.team.lost, 1);
assert.equal(e.team.open, 1);
assert.equal(e.team.winPct, 50);
assert.equal(e.team.wonCents, (1000 + 800) * 100);
assert.equal(e.byTech.find(x => x.name === "Jay").sent, 3);

console.log("✓ all offline report checks passed");
