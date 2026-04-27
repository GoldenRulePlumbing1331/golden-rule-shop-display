import { ping, getScheduledJobs } from "../src/hcp.js";

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
  console.log("=== HCP connection test ===");

  console.log("\n1) Ping test (pulling 1 job)...");
  const pingResult = await ping();
  console.log(`   OK — top-level keys:`, Object.keys(pingResult || {}));

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

  // ---- DIAGNOSTIC: dump the full structure of the first job ----
  if (jobs.length > 0) {
    console.log("\n3) Full structure of first job (so we can find the right field names):");
    console.log(JSON.stringify(jobs[0], null, 2));

    console.log("\n4) Top-level keys on a job object:");
    console.log(Object.keys(jobs[0]));
  }

  console.log("\n=== All good ===");
})().catch(err => {
  console.error("\n!!! FAILED !!!");
  console.error(err.message);
  process.exit(1);
});
