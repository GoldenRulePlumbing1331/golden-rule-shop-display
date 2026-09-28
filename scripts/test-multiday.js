// Diagnostic: shows how HCP returns multi-day jobs so the office board's
// multi-day detection can be checked against real data.
//
// For every still-open job from the last 30 days that has a tracked tech, it
// prints the job-level schedule and the raw /jobs/{id}/appointments response.
// Run from Actions → "Test multi-day jobs" → Run workflow.

import { getJobsInRange, getJobAppointments } from "../src/hcp.js";
import { TIME_TRACKING_TECHS } from "../src/jobs.js";

const LOOKBACK_DAYS = 30;
const MAX_JOBS_TO_DUMP = 15;
const CLOSED = new Set([
  "complete", "complete unrated", "complete rated",
  "user canceled", "pro canceled", "canceled", "deleted",
]);

const trackedIds = new Set(TIME_TRACKING_TECHS.map(t => t.id));

function fmtET(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

(async () => {
  const now = new Date();
  const start = new Date(now.getTime() - LOOKBACK_DAYS * 86400000);

  const jobs = [];
  for (let page = 1; page <= 20; page++) {
    const resp = await getJobsInRange({
      startISO: start.toISOString(),
      endISO: now.toISOString(),
      pageSize: 100,
      page,
    });
    jobs.push(...(resp?.jobs || []));
    if (page >= (resp?.total_pages || 1)) break;
  }

  const open = jobs
    .filter(j => !CLOSED.has(j.work_status))
    .filter(j => (j.assigned_employees || []).some(e => trackedIds.has(e.id)))
    .sort((a, b) => (b.schedule?.scheduled_start || "").localeCompare(a.schedule?.scheduled_start || ""));

  console.log(`Jobs in last ${LOOKBACK_DAYS} days: ${jobs.length}`);
  console.log(`Still open with a tracked tech: ${open.length} (dumping newest ${Math.min(open.length, MAX_JOBS_TO_DUMP)})\n`);

  for (const j of open.slice(0, MAX_JOBS_TO_DUMP)) {
    const cust = j.customer?.last_name || j.customer?.company || "(no name)";
    const techs = (j.assigned_employees || []).map(e => e.first_name).join(", ");
    console.log("=".repeat(72));
    console.log(`${cust}  —  ${j.id}  —  ${j.work_status}`);
    console.log(`  techs:     ${techs}`);
    console.log(`  schedule:  ${fmtET(j.schedule?.scheduled_start)}  →  ${fmtET(j.schedule?.scheduled_end)}`);
    console.log(`  started:   ${fmtET(j.work_timestamps?.started_at)}   completed: ${fmtET(j.work_timestamps?.completed_at)}`);
    const scheduleKeys = Object.keys(j.schedule || {});
    console.log(`  schedule keys on job: ${scheduleKeys.join(", ") || "(none)"}`);
    if (j.appointments) console.log(`  job.appointments present (${j.appointments.length})`);
    try {
      const appts = await getJobAppointments(j.id);
      console.log(`  /appointments response:`);
      console.log(JSON.stringify(appts, null, 2).split("\n").map(l => "    " + l).join("\n"));
    } catch (e) {
      console.log(`  /appointments FAILED: ${e.message.split("\n")[0]}`);
    }
  }
})().catch(err => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
