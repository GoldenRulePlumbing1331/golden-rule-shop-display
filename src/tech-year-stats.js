// Year-to-date stats per technician: job count, average job size, hours per job,
// total on-job hours, total travel hours.
//
// This is a heavy pull (the whole year, thousands of jobs), so it is NOT done on
// the every-10-minutes slideshow build. A weekly workflow (or a manual "Run
// workflow" click) runs `npm run refresh-year-stats`, which writes
// data/tech-year-stats.json; the slideshow just reads that file.
//
// How the numbers are counted
//   * Only completed jobs finished this calendar year (ET).
//   * A job counts for EVERY tech assigned to it (a 2-man job is 1 job for each),
//     and "average job size" is the average total of the jobs they were on —
//     not revenue credited to them (that is what the Revenue slide does).
//   * On-job hours = Start → Finish. Travel hours = On My Way → Start.
//     HCP stamps these once per JOB, not per visit, so a multi-day job or a
//     forgotten Finish button would produce nonsense hours. Those jobs still
//     count toward job count and size, but are left out of the hours:
//       - on-job: skipped if it crosses midnight (ET) or runs longer than 12 h
//       - travel: skipped if longer than 3 h
//     Hours per job divides by the jobs whose hours were usable, so skipped
//     jobs don't drag the average down.

import fs from "fs";
import path from "path";
import { TIME_TRACKING_TECHS } from "./jobs.js";
import { etDateKey, addDaysKey } from "./dates.js";
import { pullAllJobs, COMPLETE_STATUSES, jobDoneAt } from "./hcp-pull.js";

export const MAX_ONJOB_HOURS = 12;
export const MAX_TRAVEL_HOURS = 3;
export const DATA_FILE = "data/tech-year-stats.json";
// A cache older than this is hidden rather than shown as if it were current.
export const MAX_AGE_DAYS = 21;

function fmtMoney(cents) {
  if (!cents || cents < 0) return "$0";
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

const hoursBetween = (a, b) => (new Date(b) - new Date(a)) / 3600000;

export function rollupTechYear(jobs, { now = new Date() } = {}) {
  const today = etDateKey(now);
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const blank = () => ({ jobs: 0, cents: 0, onJobHours: 0, travelHours: 0, hoursJobs: 0, travelJobs: 0 });
  const rows = new Map(TIME_TRACKING_TECHS.map(t => [t.id, { id: t.id, name: t.display, ...blank() }]));
  const skipped = { onJob: 0, travel: 0 };
  let completedJobs = 0;

  for (const j of jobs) {
    if (!COMPLETE_STATUSES.has(j.work_status)) continue;
    const day = etDateKey(jobDoneAt(j));
    if (!day || day < yearStart || day > today) continue;
    completedJobs += 1;

    const ids = [...new Set((j.assigned_employees || []).map(e => e.id))].filter(id => rows.has(id));
    if (ids.length === 0) continue;

    const { on_my_way_at: omw, started_at: started, completed_at: done } = j.work_timestamps || {};

    let onJobH = null;
    if (started && done) {
      const h = hoursBetween(started, done);
      const sameDay = etDateKey(started) === etDateKey(done);
      if (h > 0 && h <= MAX_ONJOB_HOURS && sameDay) onJobH = h;
      else skipped.onJob += 1;
    }
    let travelH = null;
    if (omw && started) {
      const h = hoursBetween(omw, started);
      if (h >= 0 && h <= MAX_TRAVEL_HOURS) travelH = h;
      else skipped.travel += 1;
    }

    for (const id of ids) {
      const r = rows.get(id);
      r.jobs += 1;
      r.cents += j.total_amount || 0;
      if (onJobH != null) { r.onJobHours += onJobH; r.hoursJobs += 1; }
      if (travelH != null) { r.travelHours += travelH; r.travelJobs += 1; }
    }
  }

  const shape = r => ({
    ...r,
    avgJobCents: r.jobs > 0 ? Math.round(r.cents / r.jobs) : null,
    avgJobDisplay: r.jobs > 0 ? fmtMoney(r.cents / r.jobs) : "—",
    hoursPerJob: r.hoursJobs > 0 ? Math.round((r.onJobHours / r.hoursJobs) * 10) / 10 : null,
    onJobHours: Math.round(r.onJobHours),
    travelHours: Math.round(r.travelHours),
  });

  const techs = [...rows.values()]
    .filter(r => r.jobs > 0)
    .map(shape)
    .sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name));

  return { yearStart, asOfDay: today, completedJobs, skipped, techs };
}

export async function computeTechYearStats({ now = new Date() } = {}) {
  const today = etDateKey(now);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const startISO = new Date(new Date(`${addDaysKey(yearStart, -3)}T00:00:00Z`)).toISOString();
  const endISO = new Date(now.getTime() + 36 * 3600000).toISOString();

  // A year is a lot of pages; allow plenty, and still fail loudly past the cap.
  const jobs = await pullAllJobs(startISO, endISO, { maxPages: 200 });
  console.log(`[tech-year] pulled ${jobs.length} jobs since ${yearStart}`);
  const result = rollupTechYear(jobs, { now });
  console.log(
    `[tech-year] ${result.completedJobs} completed jobs, ${result.techs.length} techs; ` +
    `hours skipped as unusable — on-job: ${result.skipped.onJob}, travel: ${result.skipped.travel}`
  );
  return { generatedAt: now.toISOString(), ...result };
}

export function writeTechYearStats(stats, file = DATA_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(stats, null, 2) + "\n", "utf8");
}

// Read by the slideshow build. Throws (→ slide hidden) if missing or stale.
export function loadTechYearStats({ now = new Date(), file = DATA_FILE } = {}) {
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found — run the "Refresh yearly tech stats" workflow once`);
  }
  const stats = JSON.parse(fs.readFileSync(file, "utf8"));
  const ageDays = (new Date(etDateKey(now)) - new Date(stats.asOfDay)) / 86400000;
  if (!(ageDays <= MAX_AGE_DAYS)) {
    throw new Error(`${file} is ${Math.round(ageDays)} days old (as of ${stats.asOfDay}) — slide hidden until it is refreshed`);
  }
  if (!stats.techs || stats.techs.length === 0) throw new Error(`${file} has no techs`);
  return stats;
}
