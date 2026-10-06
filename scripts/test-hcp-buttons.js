// Test for the HCP Buttons parser.
//
//   node scripts/test-hcp-buttons.js path/to/HCP_Buttons.txt   (text export of the sheet; offline)
//   node scripts/test-hcp-buttons.js                           (reads the live sheet; needs
//                                                               GOOGLE_SERVICE_ACCOUNT_JSON)

import fs from "fs";
import { parseDashboard, getHcpButtons } from "../src/hcp-buttons.js";
import { dashboardRowsFromExport } from "./sheet-export.js";

const file = process.argv[2];
const parsed = file
  ? parseDashboard(dashboardRowsFromExport(fs.readFileSync(file, "utf8")))
  : await getHcpButtons();

console.log("Updated:", parsed.updatedLabel);
console.log("Last 7 label:", parsed.last7Label, "| techs:", parsed.last7.length);
console.log("Today label:", parsed.todayLabel, "| techs:", parsed.today.length);
console.log("Team 7d:", parsed.team7);
console.log("Team today:", parsed.teamToday);
for (const r of parsed.last7) {
  console.log(
    `${r.display.padEnd(8)} jobs=${String(r.jobs).padStart(2)} all3=${String(r.all3).padStart(3)}% ` +
    `omw→start=${r.omwToStartMin ?? "-"}m missing=${r.missing.map(m => `#${m.job}:${m.step}`).join(",") || "-"}`
  );
}
