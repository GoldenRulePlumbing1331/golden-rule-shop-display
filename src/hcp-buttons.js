// Reads the "HCP Buttons" Google Sheet and shapes it for the shop slideshow.
//
// The slide shows SOLO jobs only (one tech on the job) and, for each tech, the
// share of those jobs where On My Way, Start and Finish were all pressed — and
// only for techs whose Role on the sheet's "Techs" tab is "office staff" (and
// Include = YES). Change a role or Include flag on that tab and the board
// follows on the next build; no code change needed.
//
// The numbers come from the sheet's Dashboard tab, which that sheet's own script
// refreshes. If the script hasn't run lately the board still shows the last
// values, but flags them as old (see STALE_HOURS).
//
// Dashboard tab layout: a title row, then two stacked blocks ("LAST 7 DAYS ..."
// and "TODAY ...") each with a two-line header and one row per tech. We scan for
// the block titles instead of assuming row numbers.
//
// Columns of a tech row (0-based):
//   0 Tech | 1 Jobs | 2 OMW% | 3 Start% | 4 Finish% | 5 All-3%
//   6-10  solo jobs  (Jobs, OMW, Start, Finish, All 3)
//   11-15 crew jobs  (Jobs, OMW, Start, Finish, All 3)
//   16 OMW→Start avg minutes | 17 Misses logged | 18 Jobs with missing buttons
//
// Setup (one time):
//   1. Share the sheet (Viewer is enough) with the same service account the
//      rest of the build uses.
//   2. Add a repository VARIABLE named HCP_BUTTONS_SHEET_ID (Settings > Secrets
//      and variables > Actions > Variables) set to the ID from the sheet's URL:
//      docs.google.com/spreadsheets/d/<THIS PART>/edit
//
// The ID is deliberately NOT hard-coded: this repo is public.

import { readSheetRaw } from "./google.js";
import { overrideFirstName } from "./name-overrides.js";
import { ET } from "./dates.js";

export const OFFICE_STAFF_ROLE = "office staff";
// Dashboard older than this gets an "OLD DATA" flag on the slide.
export const STALE_HOURS = 36;

// "73%" -> 73, "–" / "" / undefined -> null
function parsePct(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s === "–" || s === "-" || s === "—") return null;
  const n = parseFloat(s.replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s === "–" || s === "-" || s === "—") return null;
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const normName = s => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

// "R Kevin Donnelly" -> "Kevin", "Jay Stetser" -> "Jay"
function displayName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  for (let i = parts.length; i >= 1; i--) {
    const candidate = parts.slice(0, i).join(" ");
    const overridden = overrideFirstName(candidate);
    if (overridden !== candidate) return overridden;
  }
  return parts[0];
}

function parseTechRow(r) {
  const name = String(r[0] || "").trim();
  return {
    name,
    display: displayName(name),
    jobs: parseNum(r[1]) ?? 0,
    omw: parsePct(r[2]),
    start: parsePct(r[3]),
    finish: parsePct(r[4]),
    all3: parsePct(r[5]),
    solo: {
      jobs: parseNum(r[6]) ?? 0,
      omw: parsePct(r[7]),
      start: parsePct(r[8]),
      finish: parsePct(r[9]),
      all3: parsePct(r[10]),
    },
    crew: { jobs: parseNum(r[11]) ?? 0, all3: parsePct(r[15]) },
  };
}

// Pure parser: raw 2-D Dashboard values in, structured data out.
export function parseDashboard(rows) {
  const result = { updatedLabel: "", last7Label: "", todayLabel: "", last7: [], today: [] };
  let section = null; // "last7" | "today" | null

  for (const raw of rows) {
    const r = raw || [];
    const first = String(r[0] ?? "").trim();
    const second = String(r[1] ?? "").trim();

    if (/^HCP button dashboard/i.test(first)) {
      result.updatedLabel = second.replace(/^updated\s*/i, "");
      continue;
    }
    if (/^LAST 7 DAYS/i.test(first)) {
      section = "last7";
      result.last7Label = (first.match(/\(([^)]*)\)/) || [])[1] || "";
      continue;
    }
    if (/^TODAY/i.test(first)) {
      section = "today";
      result.todayLabel = (first.match(/\(([^)]*)\)/) || [])[1] || "";
      continue;
    }
    if (!section) continue;

    if (r.every(c => String(c ?? "").trim() === "")) { section = null; continue; }
    if (!first || /^tech$/i.test(first)) continue;
    if (parseNum(r[1]) == null) continue;

    result[section].push(parseTechRow(r));
  }
  return result;
}

// Parses the Techs tab: Employee ID | Name | Role | Include
export function parseTechsTab(rows) {
  const techs = [];
  let cols = null;
  for (const r of rows) {
    const cells = (r || []).map(c => String(c ?? "").trim());
    if (cells.every(c => c === "")) continue;
    if (!cols) {
      const lower = cells.map(c => c.toLowerCase());
      const nameCol = lower.indexOf("name");
      const roleCol = lower.indexOf("role");
      if (nameCol === -1 || roleCol === -1) continue; // not the header yet
      cols = { name: nameCol, role: roleCol, include: lower.indexOf("include") };
      continue;
    }
    techs.push({
      name: cells[cols.name] || "",
      role: (cells[cols.role] || "").toLowerCase(),
      // No Include column (or blank) means included.
      include: cols.include === -1 || cells[cols.include] === ""
        ? true
        : /^(yes|y|true)$/i.test(cells[cols.include]),
    });
  }
  if (!cols) throw new Error('The "Techs" tab has no header row with Name and Role columns');
  return techs;
}

// Wall-clock "now" in ET as a UTC-shaped Date, so it can be compared to the
// timezone-less "Mon 10/5 9:47 AM" label on the sheet.
function etWallClock(now) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: ET, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(now);
  const g = t => Number(p.find(x => x.type === t).value);
  return new Date(Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute")));
}

// Hours since the sheet's "updated Mon 10/5 9:47 AM" stamp, or null if unreadable.
export function ageHoursFromLabel(label, now = new Date()) {
  const m = String(label || "").match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let hour = Number(m[3]) % 12;
  if (/pm/i.test(m[5])) hour += 12;
  const wall = etWallClock(now);
  let stamp = new Date(Date.UTC(wall.getUTCFullYear(), Number(m[1]) - 1, Number(m[2]), hour, Number(m[4])));
  // The label has no year; a stamp "in the future" means it is from last year.
  if (stamp - wall > 36 * 3600000) {
    stamp = new Date(Date.UTC(wall.getUTCFullYear() - 1, Number(m[1]) - 1, Number(m[2]), hour, Number(m[4])));
  }
  return (wall - stamp) / 3600000;
}

// Builds what the slide needs: solo-job stats for office-staff techs only.
export function buildSoloView(dashboard, techsTab, { now = new Date() } = {}) {
  const officeNames = new Set(
    techsTab
      .filter(t => t.include && t.role === OFFICE_STAFF_ROLE)
      .map(t => normName(t.name))
  );
  if (officeNames.size === 0) {
    throw new Error(`No techs with role "${OFFICE_STAFF_ROLE}" (Include = YES) on the Techs tab`);
  }

  const office = dashboard.last7.filter(r => officeNames.has(normName(r.name)));
  const matched = new Set(office.map(r => normName(r.name)));
  const notOnDashboard = [...officeNames].filter(n => !matched.has(n));

  const withSolo = office.filter(r => r.solo.jobs > 0);
  const noSolo = office.filter(r => r.solo.jobs === 0);

  const rows = withSolo.map(r => ({
    name: r.name,
    display: r.display,
    soloJobs: r.solo.jobs,
    omw: r.solo.omw,
    start: r.solo.start,
    finish: r.solo.finish,
    all3: r.solo.all3,
  })).sort((a, b) => (b.all3 ?? -1) - (a.all3 ?? -1) || b.soloJobs - a.soloJobs);

  // Job-weighted team numbers across the solo jobs shown.
  const soloJobs = rows.reduce((s, r) => s + r.soloJobs, 0);
  const weighted = key => {
    let num = 0, den = 0;
    for (const r of rows) {
      if (r[key] == null) continue;
      num += r[key] * r.soloJobs;
      den += r.soloJobs;
    }
    return den === 0 ? null : Math.round(num / den);
  };

  const ageHours = ageHoursFromLabel(dashboard.updatedLabel, now);
  return {
    updatedLabel: dashboard.updatedLabel,
    last7Label: dashboard.last7Label,
    ageHours,
    stale: ageHours != null && ageHours > STALE_HOURS,
    rows,
    noSoloDisplay: noSolo.map(r => r.display),
    notOnDashboard,
    team: {
      soloJobs,
      omw: weighted("omw"),
      start: weighted("start"),
      finish: weighted("finish"),
      all3: weighted("all3"),
    },
  };
}

export async function getHcpButtons({ sheetId, now = new Date() } = {}) {
  const id = sheetId || process.env.HCP_BUTTONS_SHEET_ID;
  if (!id) {
    throw new Error(
      "HCP_BUTTONS_SHEET_ID is not set — add it as a repository variable (see src/hcp-buttons.js)"
    );
  }
  const [dashRows, techRows] = await Promise.all([
    readSheetRaw(id, "Dashboard!A1:S200"),
    readSheetRaw(id, "Techs!A1:D100"),
  ]);
  const dashboard = parseDashboard(dashRows);
  if (dashboard.last7.length === 0) {
    throw new Error('HCP Buttons "Dashboard" tab was readable but no "LAST 7 DAYS" tech rows were found');
  }
  const view = buildSoloView(dashboard, parseTechsTab(techRows), { now });
  if (view.notOnDashboard.length > 0) {
    console.warn(`[hcp-buttons] office-staff techs missing from the Dashboard: ${view.notOnDashboard.join(", ")}`);
  }
  if (view.stale) {
    console.warn(`[hcp-buttons] Dashboard is ${Math.round(view.ageHours)}h old (${view.updatedLabel}) — slide will flag it`);
  }
  return view;
}
