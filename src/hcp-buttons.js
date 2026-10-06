// Reads the "HCP Buttons" Google Sheet (the Dashboard tab) and shapes it for
// the shop slideshow.
//
// The Dashboard tab is a report, not a flat table: a title row, then two
// stacked blocks ("LAST 7 DAYS ..." and "TODAY ..."), each with a two-line
// header and one row per tech. So we scan for the block titles instead of
// assuming fixed row numbers.
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

// "R Kevin Donnelly" -> "Kevin", "Jay Stetser" -> "Jay"
function displayName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  // Try the name-override table against every leading slice ("R Kevin", ...).
  for (let i = parts.length; i >= 1; i--) {
    const candidate = parts.slice(0, i).join(" ");
    const overridden = overrideFirstName(candidate);
    if (overridden !== candidate) return overridden;
  }
  return parts[0];
}

// "#49576 Paul Niager (Finish); #49575 Ken Harper (Start)"
//   -> [{ job: "49576", step: "Finish" }, { job: "49575", step: "Start" }]
// Customer names are deliberately dropped: the job number is all a tech needs
// to find the job, and this screen hangs on a shop wall.
function parseMissing(cell) {
  if (!cell) return [];
  const out = [];
  for (const piece of String(cell).split(";")) {
    const m = piece.match(/#\s*([\w-]+)[^()]*\(([^)]+)\)/);
    if (m) out.push({ job: m[1], step: m[2].trim() });
  }
  return out;
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
    solo: { jobs: parseNum(r[6]) ?? 0, all3: parsePct(r[10]) },
    crew: { jobs: parseNum(r[11]) ?? 0, all3: parsePct(r[15]) },
    omwToStartMin: parseNum(r[16]),
    misses: parseNum(r[17]) ?? 0,
    missing: parseMissing(r[18]),
  };
}

// Job-weighted team compliance for one block.
export function summarize(rows) {
  const jobs = rows.reduce((s, r) => s + r.jobs, 0);
  if (jobs === 0) return { jobs: 0, omw: null, start: null, finish: null, all3: null };
  const weighted = key => {
    let num = 0, den = 0;
    for (const r of rows) {
      if (r[key] == null) continue;
      num += r[key] * r.jobs;
      den += r.jobs;
    }
    return den === 0 ? null : Math.round(num / den);
  };
  return {
    jobs,
    omw: weighted("omw"),
    start: weighted("start"),
    finish: weighted("finish"),
    all3: weighted("all3"),
  };
}

// Pure parser: raw 2-D sheet values in, structured data out. Exported so it
// can be tested against a saved copy of the sheet without touching Google.
export function parseDashboard(rows) {
  const result = {
    updatedLabel: "",
    last7Label: "",
    todayLabel: "",
    last7: [],
    today: [],
  };

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

    const blank = r.every(c => String(c ?? "").trim() === "");
    if (blank) { section = null; continue; }

    // Header lines ("" , ALL JOBS ... / Tech, Jobs ...) are not tech rows.
    if (!first || /^tech$/i.test(first)) continue;
    if (parseNum(r[1]) == null) continue;

    result[section].push(parseTechRow(r));
  }

  result.team7 = summarize(result.last7);
  result.teamToday = summarize(result.today);
  return result;
}

export async function getHcpButtons({ sheetId, tabName = "Dashboard" } = {}) {
  const id = sheetId || process.env.HCP_BUTTONS_SHEET_ID;
  if (!id) {
    throw new Error(
      "HCP_BUTTONS_SHEET_ID is not set — add it as a repository variable (see src/hcp-buttons.js). " +
      "Showing the API-based time-tracking slide instead."
    );
  }
  const rows = await readSheetRaw(id, `${tabName}!A1:S200`);
  const parsed = parseDashboard(rows);
  if (parsed.last7.length === 0) {
    throw new Error(
      `HCP Buttons "${tabName}" tab was readable but no "LAST 7 DAYS" tech rows were found`
    );
  }
  return parsed;
}
