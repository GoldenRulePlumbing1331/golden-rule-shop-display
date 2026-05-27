// Build the office display HTML page.
// Pulls live HCP data and renders the "TODAY" dashboard.

import fs from "fs";
import path from "path";
import { buildOfficeData } from "../src/build-office-data.js";
import { renderOfficeToday } from "../src/render-office-today.js";

const OUTPUT_DIR = "./output";
const OUTPUT_FILE = "GoldenRule_OfficeDisplay_CURRENT.html";

async function main() {
  // ─── TEMPORARY DIAGNOSTIC: peek at estimates endpoint shape ───
  // Remove this block once we've verified the response structure
  try {
    const { getEstimates } = await import("../src/hcp.js");
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 60);
    console.log("[diagnostic] Fetching estimates from last 60 days...");
    const resp = await getEstimates({
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      pageSize: 5,
      page: 1,
    });
    console.log("[diagnostic] Estimates response keys:", Object.keys(resp || {}));
    console.log("[diagnostic] total_pages:", resp?.total_pages);
    console.log("[diagnostic] page:", resp?.page);

    // The array of records is probably keyed as "estimates", "data", or "results"
    // Print whichever array we find
    const recordArrays = ["estimates", "data", "results", "items"];
    let arrayKey = null;
    for (const k of recordArrays) {
      if (Array.isArray(resp?.[k])) {
        arrayKey = k;
        break;
      }
    }
    if (arrayKey) {
      console.log(`[diagnostic] Found array at key "${arrayKey}", length: ${resp[arrayKey].length}`);
      if (resp[arrayKey].length > 0) {
        const sample = resp[arrayKey][0];
        console.log("[diagnostic] First estimate keys:", Object.keys(sample));
        console.log("[diagnostic] First estimate (full):");
        console.log(JSON.stringify(sample, null, 2));
      }
    } else {
      console.log("[diagnostic] No standard array key found. Full response:");
      console.log(JSON.stringify(resp, null, 2).slice(0, 4000));
    }
  } catch (e) {
    console.warn(`[diagnostic] Estimates fetch failed: ${e.message}`);
  }
  // ─── END DIAGNOSTIC ───

  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    console.warn("[build-office] GOOGLE_CALENDAR_ID not set — out-of-office detection disabled");
  }

  console.log("[build-office] Fetching office data...");
  // ... (rest of existing main() body stays unchanged)
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
