// Revenue by truck.
//
// Only techs who have their own truck are listed. A job's revenue is credited
// to its LEAD tech (assigned_employees[0]), so the table adds up to the tiles.
// Revenue is the job's total_amount (cents), counted on the ET day the job was
// completed. Jobs led by anyone else (office staff, new hires without a truck)
// are left out of the table and reported as "other" for the week.
//
// Split into a pure `rollupRevenue` (easy to test) and a thin `getRevenueByTruck`
// that pulls from the HCP API.

import { TIME_TRACKING_TECHS } from "./jobs.js";
import { ET, etDateKey, keyToUTCNoon, addDaysKey, mondayKey, inRange } from "./dates.js";
import { pullAllJobs, COMPLETE_STATUSES, jobDoneAt } from "./hcp-pull.js";

// Display names (as in TIME_TRACKING_TECHS) of the techs with their own trucks.
export const TRUCK_TECH_NAMES = [
  "Sam", "Dom", "Donat", "Pat", "Kevin", "Rudy", "Mark", "Jay", "Matt", "Ed",
];

const TRUCK_TECHS = TRUCK_TECH_NAMES.map(name => {
  const t = TIME_TRACKING_TECHS.find(x => x.display === name);
  if (!t) throw new Error(`Truck tech "${name}" is not in TIME_TRACKING_TECHS`);
  return t;
});

export function periodKeys(now = new Date()) {
  const today = etDateKey(now);
  const weekStart = mondayKey(today);
  const lastWeekStart = addDaysKey(weekStart, -7);
  const daysIntoWeek = Math.round((keyToUTCNoon(today) - keyToUTCNoon(weekStart)) / 86400000);
  return {
    today,
    weekStart,
    lastWeekStart,
    lastWeekEnd: addDaysKey(weekStart, -1),
    lastWeekSamePointEnd: addDaysKey(lastWeekStart, daysIntoWeek),
    monthStart: `${today.slice(0, 7)}-01`,
  };
}

function fmtMoney(cents) {
  if (!cents || cents < 0) return "$0";
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

export function rollupRevenue(jobs, { now = new Date() } = {}) {
  const k = periodKeys(now);

  const blank = () => ({ cents: 0, jobs: 0 });
  const periods = {
    today: blank(), week: blank(), lastWeek: blank(),
    lastWeekSamePoint: blank(), month: blank(),
  };
  const techRows = new Map(TRUCK_TECHS.map(t => [t.id, {
    id: t.id, name: t.display, week: blank(), lastWeek: blank(), month: blank(),
  }]));
  let otherWeekCents = 0;

  const add = (bucket, cents) => { bucket.cents += cents; bucket.jobs += 1; };

  for (const j of jobs) {
    if (!COMPLETE_STATUSES.has(j.work_status)) continue;
    const cents = j.total_amount || 0;
    const day = etDateKey(jobDoneAt(j));
    if (!day) continue;

    const inWeek = inRange(day, k.weekStart, k.today);
    const lead = (j.assigned_employees || [])[0];
    const row = lead ? techRows.get(lead.id) : null;

    if (!row) {
      if (inWeek) otherWeekCents += cents;
      continue;
    }

    const inLastWeek = inRange(day, k.lastWeekStart, k.lastWeekEnd);
    const inMonth = inRange(day, k.monthStart, k.today);

    if (day === k.today) add(periods.today, cents);
    if (inWeek) { add(periods.week, cents); add(row.week, cents); }
    if (inLastWeek) { add(periods.lastWeek, cents); add(row.lastWeek, cents); }
    if (inRange(day, k.lastWeekStart, k.lastWeekSamePointEnd)) add(periods.lastWeekSamePoint, cents);
    if (inMonth) { add(periods.month, cents); add(row.month, cents); }
  }

  // Every truck gets a row, even at $0, so a quiet truck is visible rather than missing.
  const byTech = [...techRows.values()]
    .map(r => ({
      ...r,
      weekDisplay: fmtMoney(r.week.cents),
      monthDisplay: fmtMoney(r.month.cents),
      avgTicketDisplay: r.week.jobs > 0 ? fmtMoney(r.week.cents / r.week.jobs) : "—",
    }))
    .sort((a, b) => b.week.cents - a.week.cents || b.month.cents - a.month.cents);

  let weekDeltaPct = null;
  if (periods.week.cents > 0 && periods.lastWeekSamePoint.cents > 0) {
    weekDeltaPct = Math.round(
      ((periods.week.cents - periods.lastWeekSamePoint.cents) / periods.lastWeekSamePoint.cents) * 100
    );
  }

  const display = {};
  for (const [name, b] of Object.entries(periods)) display[name] = fmtMoney(b.cents);

  return {
    asOfDay: k.today,
    weekStart: k.weekStart,
    monthLabel: new Intl.DateTimeFormat("en-US", { timeZone: ET, month: "long" })
      .format(keyToUTCNoon(k.today)).toUpperCase(),
    periods,
    display,
    weekDeltaPct,
    otherWeekCents,
    otherWeekDisplay: fmtMoney(otherWeekCents),
    byTech,
    maxWeekCents: Math.max(1, ...byTech.map(r => r.week.cents)),
  };
}

export async function getRevenueByTruck({ now = new Date() } = {}) {
  const k = periodKeys(now);
  const earliest = [k.lastWeekStart, k.monthStart].sort()[0];
  // Pad both ends: HCP filters on scheduled start, we bucket on completion day.
  const startISO = new Date(keyToUTCNoon(earliest).getTime() - 2 * 86400000).toISOString();
  const endISO = new Date(now.getTime() + 36 * 3600000).toISOString();

  const jobs = await pullAllJobs(startISO, endISO);
  console.log(`[hcp-reports] revenue: pulled ${jobs.length} jobs (${earliest} → today)`);
  return rollupRevenue(jobs, { now });
}
