import { buildData } from "../src/build-data.js";
import { renderDeck } from "../src/render-deck.js";
import { renderHTML } from "../src/render-html.js";
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

  // ---- Build the .pptx (downloadable backup) ----
  const pptxFilename = "GoldenRule_ShopBriefing_CURRENT.pptx";
  const pptxPath = `./output/${pptxFilename}`;
  console.log(`\nRendering .pptx → ${pptxPath}`);
  const pptxResult = await renderDeck(data, pptxPath);
  console.log(`  Deck written. ${pptxResult.slideCount} slides:`);
  pptxResult.plan.forEach((k, i) => console.log(`    ${i + 1}. ${k}`));

  // ---- Build the HTML (shop TV display) ----
  const htmlFilename = "GoldenRule_ShopBriefing_CURRENT.html";
  const htmlPath = `./output/${htmlFilename}`;
  console.log(`\nRendering HTML → ${htmlPath}`);
  const htmlResult = await renderHTML(data, htmlPath);
  console.log(`  HTML written. ${htmlResult.slideCount} slides.`);

  if (SKIP_PUBLISH) {
    console.log("\nSkipping release publish (SKIP_PUBLISH=true)");
    return;
  }

  console.log("\nPublishing to GitHub release 'current'...");

  // Publish the .pptx (existing behavior)
  const pptxPub = await publishToCurrentRelease({
    filePath: pptxPath,
    displayName: pptxFilename,
    weekHumanLabel: data.weekOf.humanLabel,
  });
  console.log(`\n✓ .pptx download URL:`);
  console.log(`  ${pptxPub.downloadUrl}`);

  // Publish the HTML (new — this is the shop TV bookmark)
  const htmlPub = await publishToCurrentRelease({
    filePath: htmlPath,
    displayName: htmlFilename,
    weekHumanLabel: data.weekOf.humanLabel,
    contentType: "text/html",
  });
  console.log(`\n✓ HTML download URL (shop TV bookmark):`);
  console.log(`  ${htmlPub.downloadUrl}`);

  console.log(`\n  Release page: ${htmlPub.releaseUrl}`);
})().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
