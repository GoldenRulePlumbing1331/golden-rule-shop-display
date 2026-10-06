// Service-area trends: completed jobs per city, comparing
//   - the last 7 days to the 7 days before them, and
//   - the last 30 days to the 30 days before them,
// so the shop can see which towns are heating up or cooling off.
//
// Windows end YESTERDAY (ET): today is only half a day of work and would make
// every town look like it dropped.

import { etDateKey, addDaysKey, keyToUTCNoon, inRange, fmtKeyRange } from "./dates.js";
import { pullAllJobs, COMPLETE_STATUSES, jobDoneAt } from "./hcp-pull.js";

const TOP_CITIES = 10;

function titleCase(s) {
  return s.trim().split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function windowKeys(now = new Date()) {
  const end = addDaysKey(etDateKey(now), -1);
  return {
    end,
    w7:  { from: addDaysKey(end, -6),  to: end },
    p7:  { from: addDaysKey(end, -13), to: addDaysKey(end, -7) },
    w30: { from: addDaysKey(end, -29), to: end },
    p30: { from: addDaysKey(end, -59), to: addDaysKey(end, -30) },
  };
}

export function rollupServiceAreas(jobs, { now = new Date() } = {}) {
  const w = windowKeys(now);
  const cities = new Map();
  const totals = { w7: 0, p7: 0, w30: 0, p30: 0 };
  let noCity = 0;

  for (const j of jobs) {
    if (!COMPLETE_STATUSES.has(j.work_status)) continue;
    const day = etDateKey(jobDoneAt(j));
    if (!day) continue;

    const hit = {
      w7: inRange(day, w.w7.from, w.w7.to),
      p7: inRange(day, w.p7.from, w.p7.to),
      w30: inRange(day, w.w30.from, w.w30.to),
      p30: inRange(day, w.p30.from, w.p30.to),
    };
    if (!hit.w7 && !hit.p7 && !hit.w30 && !hit.p30) continue;

    const raw = (j.address?.city || "").trim();
    for (const key of Object.keys(hit)) if (hit[key]) totals[key] += 1;
    if (!raw) { noCity += 1; continue; }

    const city = titleCase(raw);
    if (!cities.has(city)) cities.set(city, { city, w7: 0, p7: 0, w30: 0, p30: 0 });
    const row = cities.get(city);
    for (const key of Object.keys(hit)) if (hit[key]) row[key] += 1;
  }

  const rows = [...cities.values()]
    .map(r => ({ ...r, d7: r.w7 - r.p7, d30: r.w30 - r.p30 }))
    .sort((a, b) => b.w30 - a.w30 || b.w7 - a.w7 || a.city.localeCompare(b.city))
    .slice(0, TOP_CITIES);

  return {
    labels: {
      w7: fmtKeyRange(w.w7.from, w.w7.to),
      p7: fmtKeyRange(w.p7.from, w.p7.to),
      w30: fmtKeyRange(w.w30.from, w.w30.to),
      p30: fmtKeyRange(w.p30.from, w.p30.to),
    },
    totals: { ...totals, d7: totals.w7 - totals.p7, d30: totals.w30 - totals.p30 },
    rows,
    noCity,
  };
}

export async function getServiceAreaTrends({ now = new Date() } = {}) {
  const w = windowKeys(now);
  // Pad: HCP filters on scheduled start, we bucket on completion day.
  const startISO = new Date(keyToUTCNoon(w.p30.from).getTime() - 3 * 86400000).toISOString();
  const endISO = new Date(now.getTime() + 36 * 3600000).toISOString();
  const jobs = await pullAllJobs(startISO, endISO);
  const result = rollupServiceAreas(jobs, { now });
  console.log(
    `[service-areas] ${jobs.length} jobs pulled; 7d ${result.totals.w7} vs ${result.totals.p7}, ` +
    `30d ${result.totals.w30} vs ${result.totals.p30}, ${result.noCity} without a city`
  );
  if (result.totals.w30 === 0) throw new Error("no completed jobs in the last 30 days — slide hidden");
  return result;
}
