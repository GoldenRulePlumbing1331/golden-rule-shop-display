// Prints a summary of the live board data (needs HCP + Google credentials).
//   npm run build-data-preview
import { buildData } from "../src/build-data.js";

const data = await buildData({ sheetId: process.env.GOOGLE_SHEET_ID });
const has = v => (v ? "yes" : "NO");
console.log("Week of:", data.weekOf.humanLabel);
console.log("On call now:", data.onCall.current?.primaryName ?? "—", "| next:", data.onCall.next?.primaryName ?? "—");
console.log("KPIs:", has(data.kpis), "| tag durations:", data.tagDurations.length);
console.log("Revenue by truck:", has(data.revenue), data.revenue ? `(week $${(data.revenue.periods.week.cents / 100).toFixed(0)})` : "");
console.log("HCP buttons:", has(data.hcpButtons), data.hcpButtons ? `(stale: ${data.hcpButtons.stale})` : "");
console.log("Service areas:", has(data.serviceAreas), data.serviceAreas ? `(${data.serviceAreas.rows.length} cities)` : "");
console.log("Tech year stats:", has(data.techYear), data.techYear ? `(as of ${data.techYear.asOfDay})` : "");
if (data.errors.length) console.log("Errors:\n - " + data.errors.join("\n - "));
