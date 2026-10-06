// Offline checks for the revenue, service-area and yearly-stat rollups
// (no HCP access needed).   node scripts/test-reports-offline.js

import assert from "node:assert/strict";
import { rollupRevenue, periodKeys, TRUCK_TECH_NAMES } from "../src/hcp-reports.js";
import { rollupServiceAreas, windowKeys } from "../src/service-areas.js";
import { rollupTechYear } from "../src/tech-year-stats.js";
import { ageHoursFromLabel } from "../src/hcp-buttons.js";
import { TIME_TRACKING_TECHS } from "../src/jobs.js";

const tech = name => TIME_TRACKING_TECHS.find(t => t.display === name);
const [jay, matt, jacob] = [tech("Jay"), tech("Matt"), tech("Jacob")];

// =============================================================================
// Revenue by truck
// =============================================================================
// Wednesday 2026-10-07, 2pm Eastern (18:00Z during EDT).
const now = new Date("2026-10-07T18:00:00Z");
const k = periodKeys(now);
assert.equal(k.today, "2026-10-07");
assert.equal(k.weekStart, "2026-10-05");
assert.equal(k.lastWeekStart, "2026-09-28");
assert.equal(k.lastWeekEnd, "2026-10-04");
assert.equal(k.lastWeekSamePointEnd, "2026-09-30");
assert.equal(k.monthStart, "2026-10-01");

// Only the ten truck techs are listed, in this exact set.
assert.deepEqual([...TRUCK_TECH_NAMES].sort(),
  ["Dom", "Donat", "Ed", "Jay", "Kevin", "Mark", "Matt", "Pat", "Rudy", "Sam"]);

const job = (status, dollars, completedISO, ...leads) => ({
  work_status: status,
  total_amount: dollars * 100,
  work_timestamps: { completed_at: completedISO },
  assigned_employees: leads.map(t => ({ id: t.id })),
});

const jobs = [
  job("complete", 1000, "2026-10-07T15:00:00Z", jay),            // today
  job("complete rated", 500, "2026-10-06T15:00:00Z", jay, matt), // this week, crew: lead (Jay) only
  job("complete", 300, "2026-10-05T15:00:00Z", matt),            // this week (Monday)
  job("complete", 200, "2026-10-05T15:00:00Z", jacob),           // led by a non-truck tech -> "other"
  job("scheduled", 9999, null, jay),                              // not complete: ignored
  job("user canceled", 777, "2026-10-07T15:00:00Z", jay),        // canceled: ignored
  job("complete", 400, "2026-09-29T15:00:00Z", jay),             // last week, before same-point cutoff
  job("complete", 50, "2026-10-01T03:30:00Z", jay),              // 11:30pm ET Wed Sep 30 -> last week, inside cutoff
  job("complete", 100, "2026-10-01T04:30:00Z", jay),             // 12:30am ET Thu Oct 1 -> last week, in October
  job("complete", 600, "2026-10-02T15:00:00Z", matt),            // last week (Fri), in October
];
const r = rollupRevenue(jobs, { now });

assert.equal(r.periods.today.cents, 1000 * 100);
assert.equal(r.periods.week.cents, (1000 + 500 + 300) * 100);            // Jacob's $200 not in trucks
assert.equal(r.otherWeekCents, 200 * 100);
assert.equal(r.periods.lastWeek.cents, (400 + 50 + 100 + 600) * 100);
assert.equal(r.periods.lastWeekSamePoint.cents, (400 + 50) * 100);
assert.equal(r.periods.month.cents, (1000 + 500 + 300 + 100 + 600) * 100);
assert.equal(r.weekDeltaPct, Math.round(((1800 - 450) / 450) * 100));

assert.equal(r.byTech.length, 10);                                       // every truck has a row
assert.ok(!r.byTech.some(x => x.name === "Jacob"));
assert.equal(r.byTech[0].name, "Jay");
const jayRow = r.byTech.find(x => x.name === "Jay");
assert.equal(jayRow.week.cents, (1000 + 500) * 100);
assert.equal(jayRow.week.jobs, 2);
assert.equal(r.byTech.find(x => x.name === "Matt").week.cents, 300 * 100); // crew job did NOT credit Matt
assert.equal(r.byTech.find(x => x.name === "Sam").week.cents, 0);          // quiet truck still listed
// The table adds up to the week tile.
assert.equal(r.byTech.reduce((s, x) => s + x.week.cents, 0), r.periods.week.cents);

// =============================================================================
// Service-area trends
// =============================================================================
// Now = Wed 2026-10-07 -> windows end Tue 10-06.
const w = windowKeys(now);
assert.equal(w.end, "2026-10-06");
assert.deepEqual(w.w7,  { from: "2026-09-30", to: "2026-10-06" });
assert.deepEqual(w.p7,  { from: "2026-09-23", to: "2026-09-29" });
assert.deepEqual(w.w30, { from: "2026-09-07", to: "2026-10-06" });
assert.deepEqual(w.p30, { from: "2026-08-08", to: "2026-09-06" });

const cityJob = (city, completedISO, status = "complete") => ({
  work_status: status,
  address: { city },
  work_timestamps: { completed_at: completedISO },
});
const sa = rollupServiceAreas([
  cityJob("WEST CHESTER", "2026-10-06T15:00:00Z"),  // w7 + w30
  cityJob("west chester", "2026-10-01T15:00:00Z"),  // w7 + w30 (case-normalized)
  cityJob("West Chester", "2026-09-25T15:00:00Z"),  // p7 + w30
  cityJob("Exton", "2026-09-10T15:00:00Z"),         // w30 only
  cityJob("Exton", "2026-08-20T15:00:00Z"),         // p30 only
  cityJob("Downingtown", "2026-10-07T15:00:00Z"),   // today: excluded from every window
  cityJob("Malvern", "2026-10-02T15:00:00Z", "scheduled"), // not complete
  cityJob("", "2026-10-02T15:00:00Z"),              // no city: counted in totals only
], { now });

const wc = sa.rows.find(x => x.city === "West Chester");
assert.deepEqual([wc.w7, wc.p7, wc.w30, wc.p30], [2, 1, 3, 0]);
assert.equal(wc.d7, 1);
const ex = sa.rows.find(x => x.city === "Exton");
assert.deepEqual([ex.w7, ex.p7, ex.w30, ex.p30], [0, 0, 1, 1]);
assert.equal(ex.d30, 0);
assert.ok(!sa.rows.some(x => x.city === "Downingtown" || x.city === "Malvern"));
assert.equal(sa.rows[0].city, "West Chester");                // sorted by 30-day volume
assert.equal(sa.noCity, 1);
assert.deepEqual([sa.totals.w7, sa.totals.p7, sa.totals.w30, sa.totals.p30], [3, 1, 5, 1]);

// =============================================================================
// Yearly tech stats
// =============================================================================
const hrs = (h, base = "2026-03-10T14:00:00Z") => new Date(new Date(base).getTime() + h * 3600000).toISOString();
const yJob = (dollars, ts, ...techs) => ({
  work_status: "complete",
  total_amount: dollars * 100,
  work_timestamps: ts,
  assigned_employees: techs.map(t => ({ id: t.id })),
});
const T0 = "2026-03-10T14:00:00Z"; // 10:00am ET
const yr = rollupTechYear([
  // Good job: 0.5h travel, 2h on job, Jay + Matt both on it
  yJob(1000, { on_my_way_at: hrs(-0.5, T0), started_at: T0, completed_at: hrs(2, T0) }, jay, matt),
  // Jay solo: 1h travel, 4h on job
  yJob(500, { on_my_way_at: hrs(-1, "2026-03-11T14:00:00Z"), started_at: "2026-03-11T14:00:00Z", completed_at: hrs(4, "2026-03-11T14:00:00Z") }, jay),
  // Multi-day job: crosses midnight -> counts for job count/size, NOT hours
  yJob(3000, { on_my_way_at: hrs(-0.5, "2026-03-12T14:00:00Z"), started_at: "2026-03-12T14:00:00Z", completed_at: hrs(30, "2026-03-12T14:00:00Z") }, jay),
  // Forgot Finish: 15h same-day-ish is capped out (>12h) -> hours skipped
  yJob(200, { started_at: "2026-03-13T11:00:00Z", completed_at: hrs(14, "2026-03-13T11:00:00Z") }, matt),
  // Prior year: ignored entirely
  yJob(9999, { started_at: "2025-12-30T15:00:00Z", completed_at: "2025-12-30T17:00:00Z" }, jay),
  // Not complete: ignored
  { work_status: "scheduled", total_amount: 5000, assigned_employees: [{ id: jay.id }] },
], { now });

assert.equal(yr.yearStart, "2026-01-01");
const yJay = yr.techs.find(t => t.name === "Jay");
assert.equal(yJay.jobs, 3);                                  // 1000 + 500 + 3000
assert.equal(yJay.avgJobCents, Math.round((1000 + 500 + 3000) * 100 / 3));
assert.equal(yJay.hoursJobs, 2);                             // multi-day excluded from hours
assert.equal(yJay.onJobHours, 6);                            // 2 + 4
assert.equal(yJay.hoursPerJob, 3);                           // 6h / 2 usable jobs, not / 3
assert.equal(yJay.travelHours, 2);                           // 0.5 + 1 + 0.5 (multi-day travel is fine) = 2
const yMatt = yr.techs.find(t => t.name === "Matt");
assert.equal(yMatt.jobs, 2);                                 // crew job + forgotten-finish job
assert.equal(yMatt.onJobHours, 2);                           // only the good job's 2h
assert.equal(yMatt.hoursPerJob, 2);
assert.equal(yr.skipped.onJob, 2);                           // multi-day + forgotten-finish
assert.equal(yr.techs[0].name, "Jay");                       // sorted by job count

// =============================================================================
// Buttons sheet age
// =============================================================================
// 10/5 9:47 AM ET, checked at 10/5 14:00Z (10:00 AM ET) -> ~0.2h
assert.ok(Math.abs(ageHoursFromLabel("Mon 10/5 9:47 AM", new Date("2026-10-05T14:00:00Z")) - 0.22) < 0.05);
// two days later
assert.ok(Math.abs(ageHoursFromLabel("Mon 10/5 9:47 AM", new Date("2026-10-07T14:00:00Z")) - 48.22) < 0.05);
// PM and 12-hour edge cases
assert.ok(Math.abs(ageHoursFromLabel("Mon 10/5 12:30 PM", new Date("2026-10-05T17:00:00Z")) - 0.5) < 0.05);
assert.equal(ageHoursFromLabel("garbage", now), null);
// Year rollover: a "12/31" stamp read in early January is last year, not 11 months ahead
assert.ok(ageHoursFromLabel("Wed 12/31 5:00 PM", new Date("2027-01-01T17:00:00Z")) < 24);

console.log("✓ all offline report checks passed");
