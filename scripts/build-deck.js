import { buildData } from "../src/build-data.js";
import { renderDeck } from "../src/render-deck.js";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

(async () => {
  if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID env var not set");
  if (!CALENDAR_ID) throw new Error("GOOGLE_CALENDAR_ID env var not set");

  console.log("Fetching data...");
  const data = await buildData({ sheetId: SHEET_ID, calendarId: CALENDAR_ID });
  console.log(`Data fetched. Errors during build: ${data.errors.length}`);
  if (data.errors.length > 0) {
    for (const e of data.errors) console.warn("  -", e);
  }

  const outputName = `GoldenRule_ShopBriefing_${data.weekOf.mondayISO}.pptx`;
  const outputPath = `./output/${outputName}`;

  console.log(`Rendering deck → ${outputPath}`);
  const result = await renderDeck(data, outputPath);

  console.log(`\nDeck written. ${result.slideCount} slides:`);
  result.plan.forEach((k, i) => console.log(`  ${i + 1}. ${k}`));
})().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
