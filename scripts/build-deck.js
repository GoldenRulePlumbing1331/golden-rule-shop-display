import { buildData } from "../src/build-data.js";
import { renderDeck } from "../src/render-deck.js";
import { publishToCurrentRelease } from "../src/github-release.js";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const SKIP_PUBLISH = process.env.SKIP_PUBLISH === "true";

(async () => {
  if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID env var not set");
  if (!CALENDAR_ID) throw new Error("GOOGLE_CALENDAR_ID env var not set");

  console.log("Fetching data...");
  const data = await buildData({ sheetId: SHEET_ID, calendarId: CALENDAR_ID });
  console.log(`Data fetched. Errors during build: ${data.errors.length}`);
  if (data.errors.length > 0) {
    for (const e of data.errors) console.warn("  -", e);
  }

  const filename = "GoldenRule_ShopBriefing_CURRENT.pptx";
  const outputPath = `./output/${filename}`;

  console.log(`Rendering deck → ${outputPath}`);
  const result = await renderDeck(data, outputPath);
  console.log(`\nDeck written. ${result.slideCount} slides:`);
  result.plan.forEach((k, i) => console.log(`  ${i + 1}. ${k}`));

  if (SKIP_PUBLISH) {
    console.log("\nSkipping release publish (SKIP_PUBLISH=true)");
    return;
  }

  console.log("\nPublishing to GitHub release 'current'...");
  const pub = await publishToCurrentRelease({
    filePath: outputPath,
    displayName: filename,
    weekHumanLabel: data.weekOf.humanLabel,
  });
  console.log(`\n✓ Download URL (stable bookmark for the shop TV):`);
  console.log(`  ${pub.downloadUrl}`);
  console.log(`\n  Release page: ${pub.releaseUrl}`);
})().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
