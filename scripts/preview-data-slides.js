// Renders the shop slideshow to ./output/preview.html using
//   - the REAL HCP Buttons sheet export (path given as argv[2]), and
//   - SYNTHETIC revenue / estimate data (clearly fake numbers),
// so the three data slides can be eyeballed without HCP or Google access.
//
//   node scripts/preview-data-slides.js path/to/HCP_Buttons.txt

import fs from "fs";
import { parseDashboard } from "../src/hcp-buttons.js";
import { rollupRevenue, rollupEstimates } from "../src/hcp-reports.js";
import { TIME_TRACKING_TECHS } from "../src/jobs.js";
import { renderHTML } from "../src/render-html.js";
import { dashboardRowsFromExport } from "./sheet-export.js";

const file = process.argv[2];
if (!file) throw new Error("usage: node scripts/preview-data-slides.js <HCP_Buttons export>");

const hcpButtons = parseDashboard(dashboardRowsFromExport(fs.readFileSync(file, "utf8")));

// ---- synthetic jobs: Wednesday afternoon, every tech busy ----
const now = new Date("2026-10-07T18:00:00Z");
let seed = 7;
const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
const jobs = [];
for (let dayBack = 0; dayBack < 9; dayBack++) {
  for (const t of TIME_TRACKING_TECHS) {
    const n = Math.floor(rnd() * 3) + (dayBack === 0 ? 0 : 1);
    for (let i = 0; i < n; i++) {
      const done = new Date(now.getTime() - dayBack * 86400000 - Math.floor(rnd() * 5) * 3600000);
      jobs.push({
        work_status: "complete",
        total_amount: Math.round((250 + rnd() * rnd() * 5200) * 100),
        work_timestamps: { completed_at: done.toISOString() },
        assigned_employees: [{ id: t.id }],
      });
    }
  }
}
const revenue = rollupRevenue(jobs, { now });

const estimatesIn = [];
for (const t of TIME_TRACKING_TECHS) {
  const n = 4 + Math.floor(rnd() * 8);
  for (let i = 0; i < n; i++) {
    const roll = rnd();
    estimatesIn.push({
      work_status: "scheduled",
      created_at: new Date(now.getTime() - Math.floor(rnd() * 28) * 86400000).toISOString(),
      assigned_employees: [{ id: t.id }],
      options: [{
        total_amount: Math.round((400 + rnd() * 9000) * 100),
        approval_status: roll < 0.4 ? "approved" : roll < 0.65 ? "rejected" : "pending",
      }],
    });
  }
}
const estimates = rollupEstimates(estimatesIn, { now });

const data = {
  weekOf: { mondayISO: "2026-10-05", humanLabel: "Monday, October 5, 2026" },
  jobBoard: null, kpis: null,
  onCall: { current: null, next: null },
  events: [], newItems: [], safetyTopic: null, shoutout: null,
  tagDurations: [], hygiene: null, googleReviews: [], serviceAreas: null,
  hcpButtons, revenue, estimates,
};

fs.mkdirSync("./output", { recursive: true });
const result = await renderHTML(data, "./output/preview.html");
console.log("slides:", result.plan.join(", "));
