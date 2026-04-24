import { ping, getScheduledJobs } from "../src/hcp.js";

function mondayOfThisWeek() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ...
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
  console.log("=== HCP connection test ===");

  console.log("\n1) Ping test (pulling 1 job)...");
  const pingResult = await ping();
  const count = Array.isArray(pingResult?.jobs) ? pingResult.jobs.length : 0;
  console.log(`   OK — received ${count} job(s). Keys returned:`,
    Object.keys(pingResult || {}));

  console.log("\n2) Week-of-jobs test...");
  const mon = mondayOfThisWeek();
  const sun = addDays(mon, 7);
  console.log(`   Range: ${mon.toISOString()}  →  ${sun.toISOString()}`);

  const weekJobs = await getScheduledJobs({
    startISO: mon.toISOString(),
    endISO: sun.toISOString(),
    pageSize: 50,
  });

  const jobs = weekJobs?.jobs || [];
  console.log(`   Received ${jobs.length} scheduled job(s) this week.`);
  for (const j of jobs.slice(0, 5)) {
    console.log(`   - ${j.scheduled_start || "?"}  |  ${j.description || j.work_status || "(no description)"}`);
  }

  console.log("\n=== All good ===");
})().catch(err => {
  console.error("\n!!! FAILED !!!");
  console.error(err.message);
  process.exit(1);
});