// Build the office display HTML page.
// Pulls live HCP data and renders the "TODAY" dashboard.

import fs from "fs";
import path from "path";
import { buildOfficeData } from "../src/build-office-data.js";
import { renderOfficeToday } from "../src/render-office-today.js";

const OUTPUT_DIR = "./output";
const OUTPUT_FILE = "GoldenRule_OfficeDisplay_CURRENT.html";

async function main() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    console.warn("[build-office] GOOGLE_CALENDAR_ID not set — out-of-office detection disabled");
  }

  console.log("[build-office] Fetching office data...");
  const data = await buildOfficeData({ calendarId });

  console.log("[build-office] Rendering HTML...");
  const html = renderOfficeToday(data);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
  fs.writeFileSync(outputPath, html, "utf8");
  console.log(`[build-office] Written: ${outputPath}`);

  // Summary stats for the build log
  const onSite = data.crew.filter(c => c.status.status === "on_site").length;
  const late = data.crew.filter(c => c.status.status === "late").length;
  const out = data.crew.filter(c => c.status.status === "out").length;
  console.log(`[build-office] Crew: ${onSite} on site, ${late} late, ${out} out`);
  console.log(`[build-office] Today: ${data.todaySummary.completed} done, ${data.todaySummary.inProgress} in progress, ${data.todaySummary.notStarted} not started`);
  console.log(`[build-office] Pipeline: ${data.openEstimates.totalCount} estimates ${data.openEstimates.totalValue}, ${data.pastDueInvoices.totalCount} unpaid ${data.pastDueInvoices.totalValue}`);
  console.log(`[build-office] Hot items: ${data.hotList.length}`);
}

main().catch(err => {
  console.error("[build-office] FATAL:", err);
  process.exit(1);
});
