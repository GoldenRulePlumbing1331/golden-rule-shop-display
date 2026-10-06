// Renders the full shop slideshow to ./output/preview.html (and a second
// "old data" variant to ./output/preview-stale.html) with
//   - the REAL HCP Buttons sheet export (path given as argv[2]), and
//   - SYNTHETIC everything else (clearly fake numbers),
// so every slide can be eyeballed without HCP or Google access.
//
//   node scripts/preview-data-slides.js path/to/HCP_Buttons.txt

import fs from "fs";
import { parseDashboard, parseTechsTab, buildSoloView } from "../src/hcp-buttons.js";
import { rollupRevenue } from "../src/hcp-reports.js";
import { rollupServiceAreas } from "../src/service-areas.js";
import { rollupTechYear } from "../src/tech-year-stats.js";
import { TIME_TRACKING_TECHS } from "../src/jobs.js";
import { renderHTML } from "../src/render-html.js";
import { dashboardRowsFromExport, techsRowsFromExport } from "./sheet-export.js";

const file = process.argv[2];
if (!file) throw new Error("usage: node scripts/preview-data-slides.js <HCP_Buttons export>");
const text = fs.readFileSync(file, "utf8");
const dashboard = parseDashboard(dashboardRowsFromExport(text));
const techsTab = parseTechsTab(techsRowsFromExport(text));

let seed = 7;
const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
const ids = TIME_TRACKING_TECHS.map(t => t.id);

// Wednesday afternoon, every tech busy.
const now = new Date("2026-10-07T18:00:00Z");
const DAY = 86400000;

// ---- synthetic completed jobs across the year ----
const cities = ["West Chester", "Downingtown", "Exton", "Malvern", "Kennett Square",
  "Phoenixville", "Coatesville", "Media", "Chester Springs", "Berwyn", "Paoli", "Glen Mills"];
const jobs = [];
for (let dayBack = 0; dayBack < 280; dayBack++) {
  const dow = new Date(now.getTime() - dayBack * DAY).getUTCDay();
  if (dow === 0 || dow === 6) continue;
  for (const id of ids) {
    const n = Math.floor(rnd() * 3) + (dayBack === 0 ? 0 : 1);
    for (let i = 0; i < n; i++) {
      const start = new Date(now.getTime() - dayBack * DAY - Math.floor(rnd() * 4) * 3600000);
      const onJobH = 0.75 + rnd() * 4;
      const travelH = 0.2 + rnd() * 0.7;
      const crew = rnd() < 0.45 ? [{ id }, { id: ids[Math.floor(rnd() * ids.length)] }] : [{ id }];
      jobs.push({
        work_status: "complete",
        total_amount: Math.round((250 + rnd() * rnd() * 5200) * 100),
        address: { city: cities[Math.floor(rnd() * rnd() * cities.length)] },
        work_timestamps: {
          on_my_way_at: new Date(start.getTime() - travelH * 3600000).toISOString(),
          started_at: start.toISOString(),
          completed_at: new Date(start.getTime() + onJobH * 3600000).toISOString(),
        },
        assigned_employees: crew,
      });
    }
  }
}

const data = {
  weekOf: { mondayISO: "2026-10-05", humanLabel: "Monday, October 5, 2026" },
  onCall: {
    current: { primaryName: "Sample Tech", primaryMobile: "6105550100", primaryEmail: "sample@example.com", dispatcher: "Sample Dispatcher", materialRuns: "Sample Runner" },
    next:    { primaryName: "Next Tech",   primaryMobile: "6105550101", primaryEmail: "next@example.com",   dispatcher: "Sample Dispatcher", materialRuns: "Sample Runner" },
  },
  kpis: {
    jobsClosed: 141, revenueDisplay: "$197,783", callbackCount: 4,
    uncollected: { display: "$12,400", count: 9 },
    byTech: ["Sam", "Dom", "Donat", "Pat", "Kevin", "Rudy", "Mark", "Jay", "Matt", "Ed"].map((name, i) => ({ name, count: 18 - i })),
  },
  tagDurations: ["Water Heater", "Faucet Install", "Toilet Install", "Sewer Line", "Repipe", "Drain Cleaning", "Sump Pump", "Hose Bib"]
    .map((tag, i) => ({ tag, medianLabel: i % 2 ? "1.5 hr" : "45 min", sampleCount: 40 - i * 3 })),
  revenue: rollupRevenue(jobs, { now }),
  serviceAreas: rollupServiceAreas(jobs, { now }),
  techYear: rollupTechYear(jobs, { now }),
  hcpButtons: buildSoloView(dashboard, techsTab, { now: new Date("2026-10-05T14:00:00Z") }),
};

fs.mkdirSync("./output", { recursive: true });
const result = await renderHTML(data, "./output/preview.html");
console.log("slides:", result.plan.join(", "));

// Same board, but viewed two days after the sheet was last refreshed.
await renderHTML(
  { ...data, hcpButtons: buildSoloView(dashboard, techsTab, { now }) },
  "./output/preview-stale.html",
);
console.log("stale variant flag:", buildSoloView(dashboard, techsTab, { now }).stale);
