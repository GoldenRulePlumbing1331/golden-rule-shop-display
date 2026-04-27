import { buildData } from "../src/build-data.js";
import { renderDeck } from "../src/render-deck.js";
import { uploadFileToDrive } from "../src/google.js";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const SKIP_UPLOAD = process.env.SKIP_DRIVE_UPLOAD === "true";

(async () => {
  if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID env var not set");
  if (!CALENDAR_ID) throw new Error("GOOGLE_CALENDAR_ID env var not set");

  console.log("Fetching data...");
  const data = await buildData({ sheetId: SHEET_ID, calendarId: CALENDAR_ID });
  console.log(`Data fetched. Errors during build: ${data.errors.length}`);
  if (data.errors.length > 0) {
    for (const e of data.errors) console.warn("  -", e);
  }

  // Build under a stable filename so the Drive upload overwrites consistently.
  const stableFilename = "GoldenRule_ShopBriefing_CURRENT.pptx";
  const datedFilename = `GoldenRule_ShopBriefing_${data.weekOf.mondayISO}.pptx`;
  const outputPath = `./output/${stableFilename}`;

  console.log(`Rendering deck → ${outputPath}`);
  const result = await renderDeck(data, outputPath);

  console.log(`\nDeck written. ${result.slideCount} slides:`);
  result.plan.forEach((k, i) => console.log(`  ${i + 1}. ${k}`));

  // Drive upload — skip if explicitly disabled or if folder ID isn't set.
  if (SKIP_UPLOAD) {
    console.log("\nSkipping Drive upload (SKIP_DRIVE_UPLOAD=true)");
    return;
  }
  if (!DRIVE_FOLDER_ID) {
    console.warn("\nGOOGLE_DRIVE_FOLDER_ID not set — skipping Drive upload.");
    return;
  }

  console.log(`\nUploading to Drive folder ${DRIVE_FOLDER_ID}...`);

  // Upload "CURRENT" — this is the file the shop TV reads from
  const currentResult = await uploadFileToDrive({
    filePath: outputPath,
    folderId: DRIVE_FOLDER_ID,
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    displayName: stableFilename,
  });
  console.log(`  CURRENT → ${currentResult.action}: ${currentResult.webViewLink}`);

  // Also upload a dated archive copy so we keep a history
  const archiveResult = await uploadFileToDrive({
    filePath: outputPath,
    folderId: DRIVE_FOLDER_ID,
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    displayName: datedFilename,
  });
  console.log(`  ARCHIVE → ${archiveResult.action}: ${archiveResult.webViewLink}`);
})().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
