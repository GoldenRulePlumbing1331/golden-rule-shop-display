import { readSheet } from "../src/google.js";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

(async () => {
  if (!SHEET_ID) {
    throw new Error("GOOGLE_SHEET_ID env var not set");
  }

  console.log("=== Google Sheet connection test ===\n");

  for (const tab of ["on_call_rotation", "events", "new_items"]) {
    console.log(`--- Tab: ${tab} ---`);
    try {
      const rows = await readSheet(SHEET_ID, tab);
      console.log(`Rows: ${rows.length}`);
      if (rows.length > 0) {
        console.log("Headers found:", Object.keys(rows[0]));
        console.log("First row:");
        console.log(rows[0]);
      } else {
        console.log("(empty — make sure row 1 has headers and at least one data row)");
      }
    } catch (e) {
      console.error(`FAILED on ${tab}: ${e.message}`);
    }
    console.log();
  }
})().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
