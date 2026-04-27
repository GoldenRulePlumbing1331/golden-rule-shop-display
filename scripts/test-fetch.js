import { getWeekJobs, groupByDay, pickMajorJobByDay } from "../src/jobs.js";

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
  const mon = mondayOfThisWeek();
  const sun = addDays(mon, 7);
  console.log(`=== Job Board preview ===`);
  console.log(`Week of ${mon.toISOString().slice(0,10)}\n`);

  const jobs = await getWeekJobs({
    startISO: mon.toISOString(),
    endISO: sun.toISOString(),
  });
  console.log(`Active scheduled jobs (cancelled/completed filtered): ${jobs.length}\n`);

  const groups = groupByDay(jobs);
  console.log("--- Counts by day ---");
  for (const day of ["MON","TUE","WED","THU","FRI","SAT","SUN"]) {
    console.log(`  ${day}: ${groups[day].length}`);
  }

  const majors = pickMajorJobByDay(groups);
  console.log("\n--- Major job per weekday (this is what Slide 6 will show) ---");
  for (const day of ["MON","TUE","WED","THU","FRI"]) {
    const j = majors[day];
    if (!j) {
      console.log(`  ${day}:  (no scheduled work)`);
      continue;
    }
    console.log(
      `  ${day}  ${j.timeLabel?.padEnd(8)}  ${j.durationLabel.padEnd(9)}  ${j.techDisplay.padEnd(22)}  ${j.description.slice(0, 60)}`
    );
  }

  console.log(`\n--- Status breakdown (sanity check) ---`);
  const statusCounts = {};
  for (const j of jobs) {
    statusCounts[j.workStatus] = (statusCounts[j.workStatus] || 0) + 1;
  }
  console.log(statusCounts);
})().catch(err => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
