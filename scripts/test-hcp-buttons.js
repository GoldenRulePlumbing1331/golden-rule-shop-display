// Test for the HCP Buttons reader.
//
//   node scripts/test-hcp-buttons.js path/to/HCP_Buttons.txt   (text export of the sheet; offline)
//   node scripts/test-hcp-buttons.js                           (reads the live sheet; needs
//                                                               GOOGLE_SERVICE_ACCOUNT_JSON and
//                                                               HCP_BUTTONS_SHEET_ID)

import fs from "fs";
import {
  parseDashboard, parseTechsTab, buildSoloView, getHcpButtons,
} from "../src/hcp-buttons.js";
import { dashboardRowsFromExport, techsRowsFromExport } from "./sheet-export.js";

const file = process.argv[2];
let view;
if (file) {
  const text = fs.readFileSync(file, "utf8");
  // The export was taken Mon 10/5 ~9:47 AM ET; pin "now" so the age check is stable.
  const now = new Date("2026-10-05T14:00:00Z");
  view = buildSoloView(
    parseDashboard(dashboardRowsFromExport(text)),
    parseTechsTab(techsRowsFromExport(text)),
    { now },
  );
} else {
  view = await getHcpButtons();
}

console.log("Updated:", view.updatedLabel, "| age h:", view.ageHours?.toFixed(1), "| stale:", view.stale);
console.log("Window:", view.last7Label);
console.log("Team solo:", view.team);
for (const r of view.rows) {
  console.log(
    `${r.display.padEnd(8)} solo=${String(r.soloJobs).padStart(2)} ` +
    `omw=${r.omw}% start=${r.start}% finish=${r.finish}% all3=${r.all3}%`
  );
}
console.log("Office staff with no solo jobs:", view.noSoloDisplay.join(", ") || "(none)");
console.log("Office staff not on Dashboard:", view.notOnDashboard.join(", ") || "(none)");
