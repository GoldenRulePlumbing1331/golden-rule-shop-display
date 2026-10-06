// Builds the shop slideshow HTML (output/GoldenRule_ShopBriefing_CURRENT.html)
// and, unless SKIP_PUBLISH=true, uploads it to the "current" GitHub release.

import fs from "fs";
import { buildData } from "../src/build-data.js";
import { renderHTML } from "../src/render-html.js";
import { publishToCurrentRelease } from "../src/github-release.js";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SKIP_PUBLISH = process.env.SKIP_PUBLISH === "true";

(async () => {
  if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID env var not set");

  fs.mkdirSync("./output", { recursive: true });

  console.log("Fetching data...");
  const data = await buildData({ sheetId: SHEET_ID });
  console.log(`Data fetched. Errors during build: ${data.errors.length}`);
  for (const e of data.errors) console.warn("  -", e);

  const htmlFilename = "GoldenRule_ShopBriefing_CURRENT.html";
  const htmlPath = `./output/${htmlFilename}`;
  console.log(`\nRendering HTML → ${htmlPath}`);
  const htmlResult = await renderHTML(data, htmlPath);
  console.log(`  HTML written. ${htmlResult.slideCount} slides: ${htmlResult.plan.join(", ")}`);

  if (SKIP_PUBLISH) {
    console.log("\nSkipping release publish (SKIP_PUBLISH=true)");
    return;
  }

  console.log("\nPublishing to GitHub release 'current'...");
  const htmlPub = await publishToCurrentRelease({
    filePath: htmlPath,
    displayName: htmlFilename,
    weekHumanLabel: data.weekOf.humanLabel,
    contentType: "text/html",
  });
  console.log(`\n✓ HTML release URL (backup):\n  ${htmlPub.downloadUrl}`);
  console.log(`  Release page: ${htmlPub.releaseUrl}`);
})().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
