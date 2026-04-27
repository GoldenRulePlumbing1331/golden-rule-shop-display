import {
  getWeekJobs, groupByDay, pickMajorJobByDay,
  getCompletedJobsInRange, rollupKPIs,
  getEmployeeRoster,
} from "../src/jobs.js";

function mondayOfThisWeek() {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}
function addDays(d, n) {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

(async () => {
  const thisMon = mondayOfThisWeek();
  const nextMon = addDays(thisMon, 7);
  const lastMon = addDays(thisMon, -7);

  // ===== SLIDE 6 — Job Board (this week) =====
  console.log(`=== Slide 6 — Job Board ===`);
  console.log(`Week of ${thisMon.toISOString().slice(0,10)}\n`);

  const weekJobs = await getWeekJobs({
    startISO: thisMon.toISOString(),
    endISO: nextMon.toISOString(),
  });
  console.log(`Active scheduled jobs: ${weekJobs.length}`);

  const groups = groupByDay(weekJobs);
  const majors = pickMajorJobByDay(groups);
  for (const day of ["MON","TUE","WED","THU","FRI"]) {
    const j = majors[day];
    if (!j) { console.log(`  ${day}:  (no scheduled work)`); continue; }
    console.log(`  ${day}  ${(j.timeLabel||"").padEnd(8)}  ${j.durationLabel.padEnd(9)}  ${j.techDisplay.padEnd(22)}  ${j.description.slice(0, 60)}`);
  }

  // ===== SLIDE 10 — KPI tiles (last week's completed jobs) =====
  console.log(`\n=== Slide 10 — KPIs ===`);
  console.log(`Looking at jobs scheduled ${lastMon.toISOString().slice(0,10)} → ${thisMon.toISOString().slice(0,10)}\n`);

  const completedLastWeek = await getCompletedJobsInRange({
    startISO: lastMon.toISOString(),
    endISO: thisMon.toISOString(),
  });
  const kpis = rollupKPIs(completedLastWeek);
  console.log(`  Jobs Closed:  ${kpis.jobsClosed}`);
  console.log(`  Revenue:      ${kpis.revenueDisplay}`);
  console.log(`  (raw dollars: ${kpis.revenueDollars})`);

  // ===== Employee roster (for on-call lookup later) =====
  console.log(`\n=== Employees on the account ===`);
  const roster = await getEmployeeRoster();
  console.log(`Total: ${roster.length}\n`);
  for (const emp of roster) {
    console.log(`  ${emp.fullName.padEnd(28)}  ${emp.role || "(no role)"}  ${emp.id}`);
  }
})().catch(err => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
