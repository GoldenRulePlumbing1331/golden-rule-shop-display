import { getJobsInRange } from "../src/hcp.js";

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function durationMinutes(startISO, endISO) {
  if (!startISO || !endISO) return null;
  const ms = new Date(endISO) - new Date(startISO);
  if (ms <= 0) return null;
  return Math.round(ms / 60000);
}

const COMPLETE_STATUSES = new Set(["complete", "complete unrated", "complete rated"]);

(async () => {
  // Pull jobs from the last 30 days
  const start = daysAgo(30);
  const end = new Date();
  console.log(`Pulling completed jobs scheduled ${start.toISOString().slice(0,10)} → ${end.toISOString().slice(0,10)}`);

  const all = [];
  let page = 1;
  while (true) {
    const resp = await getJobsInRange({
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      pageSize: 100,
      page,
    });
    const batch = resp?.jobs || [];
    all.push(...batch);
    const totalPages = resp?.total_pages || 1;
    if (page >= totalPages) break;
    page += 1;
    if (page > 20) break;
  }

  const completed = all.filter(j => COMPLETE_STATUSES.has(j.work_status));
  console.log(`Total fetched: ${all.length} | Completed: ${completed.length}\n`);

  // ---- 1) Tag distribution ----
  console.log("=== TAG DISTRIBUTION (completed jobs) ===");
  const tagCounts = {};
  let untagged = 0;
  for (const j of completed) {
    const tags = j.tags || [];
    if (tags.length === 0) {
      untagged++;
    } else {
      for (const t of tags) {
        // Tags can be strings or objects depending on HCP API version
        const tagName = typeof t === "string" ? t : (t.name || t.label || JSON.stringify(t));
        tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
      }
    }
  }
  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  console.log(`Untagged completed jobs: ${untagged} of ${completed.length} (${Math.round(100 * untagged / completed.length)}%)`);
  console.log(`\nTags found:`);
  for (const [tag, count] of sortedTags) {
    console.log(`  ${count.toString().padStart(4)}  ${tag}`);
  }

  // ---- 2) Timestamp coverage ----
  console.log("\n=== TIMESTAMP COVERAGE ===");
  let bothActual = 0, onlyScheduled = 0, neither = 0;
  for (const j of completed) {
    const startedAt = j.work_timestamps?.started_at;
    const completedAt = j.work_timestamps?.completed_at;
    const schedStart = j.schedule?.scheduled_start;
    const schedEnd = j.schedule?.scheduled_end;
    if (startedAt && completedAt) bothActual++;
    else if (schedStart && schedEnd) onlyScheduled++;
    else neither++;
  }
  console.log(`  Have actual times (start + complete): ${bothActual}`);
  console.log(`  Only scheduled times available:       ${onlyScheduled}`);
  console.log(`  Neither (skip these in average):      ${neither}`);

  // ---- 3) Sample averages — try BOTH methods on the top 5 tags ----
  console.log("\n=== AVERAGES BY TOP 5 TAGS — actual vs scheduled ===");
  console.log("(actual = work_timestamps; sched = schedule fields)\n");
  console.log(`  ${"TAG".padEnd(30)}  ${"#actual".padStart(7)}  ${"actual avg".padStart(11)}  ${"#sched".padStart(7)}  ${"sched avg".padStart(11)}`);
  console.log(`  ${"-".repeat(30)}  ${"-".repeat(7)}  ${"-".repeat(11)}  ${"-".repeat(7)}  ${"-".repeat(11)}`);

  for (const [tag] of sortedTags.slice(0, 5)) {
    const matching = completed.filter(j => {
      const tags = j.tags || [];
      return tags.some(t => (typeof t === "string" ? t : (t.name || "")) === tag);
    });

    const actualMins = matching
      .map(j => durationMinutes(j.work_timestamps?.started_at, j.work_timestamps?.completed_at))
      .filter(m => m !== null && m > 0);
    const schedMins = matching
      .map(j => durationMinutes(j.schedule?.scheduled_start, j.schedule?.scheduled_end))
      .filter(m => m !== null && m > 0);

    const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0) / arr.length) : null;
    const fmt = m => m == null ? "—" : (m >= 60 ? `${(m/60).toFixed(1)} hr` : `${m} min`);

    console.log(`  ${tag.padEnd(30)}  ${String(actualMins.length).padStart(7)}  ${fmt(avg(actualMins)).padStart(11)}  ${String(schedMins.length).padStart(7)}  ${fmt(avg(schedMins)).padStart(11)}`);
  }
})().catch(err => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
