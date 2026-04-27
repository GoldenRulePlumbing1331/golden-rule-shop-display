import { buildData } from "../src/build-data.js";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

(async () => {
  if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID env var not set");
  if (!CALENDAR_ID) throw new Error("GOOGLE_CALENDAR_ID env var not set");

  const data = await buildData({ sheetId: SHEET_ID, calendarId: CALENDAR_ID });

  console.log("\n=========================================================");
  console.log(`  Week of ${data.weekOf.humanLabel}`);
  console.log("=========================================================");

  // ---- Slide 2: On Call ----
  console.log("\n[ Slide 2 — On Call ]");
  if (!data.onCall) {
    console.log("  (no entry for this week — slide will show placeholders)");
  } else {
    console.log(`  Primary:    ${data.onCall.primaryName}`);
    console.log(`  Mobile:     ${data.onCall.primaryMobile || "(none on file)"}`);
    console.log(`  Email:      ${data.onCall.primaryEmail || "(none on file)"}`);
    console.log(`  Dispatcher: ${data.onCall.dispatcher}`);
  }

  // ---- Slide 3: Events ----
  console.log("\n[ Slide 3 — Events ]");
  if (data.events.length === 0) {
    console.log("  (no upcoming events)");
  } else {
    for (const e of data.events) {
      console.log(`  ${e.startISO.slice(0,10)}  [${e.category.padEnd(9)}]  ${e.title}  ${e.location ? "• " + e.location : ""}`);
    }
  }

  // ---- Slide 4: New Items ----
  console.log("\n[ Slide 4 — New Items ]");
  if (data.newItems.length === 0) {
    console.log("  (no new items)");
  } else {
    for (const it of data.newItems) {
      console.log(`  ${it.name}  [${it.category}]  @ ${it.location}  (added ${it.addedDate})`);
    }
  }

  // ---- Slide 5: Moved Items ----
  console.log("\n[ Slide 5 — Moved Items ]");
  if (data.movedItems.length === 0) {
    console.log("  (no moved items)");
  } else {
    for (const it of data.movedItems) {
      console.log(`  ${it.name}:  ${it.oldLocation}  →  ${it.newLocation}  (${it.movedDate})`);
    }
  }

  // ---- Slide 6: Job Board ----
  console.log("\n[ Slide 6 — Job Board ]");
  if (!data.jobBoard) {
    console.log("  (job board fetch failed)");
  } else {
    console.log(`  Counts: open=${data.jobBoard.counts.open}, in-progress=${data.jobBoard.counts.inProgress}, total=${data.jobBoard.counts.total}`);
    for (const day of ["MON","TUE","WED","THU","FRI"]) {
      const j = data.jobBoard.majors[day];
      if (!j) { console.log(`  ${day}:  (no scheduled work)`); continue; }
      console.log(`  ${day}  ${(j.timeLabel||"").padEnd(8)}  ${j.durationLabel.padEnd(9)}  ${j.techDisplay.padEnd(22)}  ${j.description.slice(0, 60)}`);
    }
  }

  // ---- Slide 7: Safety Topic ----
  console.log("\n[ Slide 7 — Safety Topic ]");
  if (!data.safetyTopic) {
    console.log("  (no safety topic for this week — slide will be skipped)");
  } else {
    console.log(`  Headline: ${data.safetyTopic.headline}`);
    for (const b of data.safetyTopic.bullets) console.log(`    • ${b}`);
  }

  // ---- Slide 8: Shoutout ----
  console.log("\n[ Slide 8 — Shoutout / Tech of the Week ]");
  if (!data.shoutout) {
    console.log("  (no shoutout for this week — slide will be skipped)");
  } else {
    console.log(`  Tech:   ${data.shoutout.techName}`);
    console.log(`  Reason: ${data.shoutout.reason}`);
  }


  // ---- Slide 10: KPIs ----
  console.log("\n[ Slide 10 — KPIs ]");
  if (!data.kpis) {
    console.log("  (KPI fetch failed)");
  } else {
    console.log(`  Jobs Closed (last week):  ${data.kpis.jobsClosed}`);
    console.log(`  Revenue (last week):       ${data.kpis.revenueDisplay}`);
  }
  
  // ---- Slide: Tag Durations ----
  console.log("\n[ Slide — Average Job Time by Category ]");
  if (!data.tagDurations || data.tagDurations.length === 0) {
    console.log("  (no tag duration data)");
  } else {
    for (const r of data.tagDurations) {
      console.log(`  ${r.tag.padEnd(28)}  ${r.medianLabel.padStart(8)}  (n=${r.sampleCount})`);
    }
  }
  // ---- Errors ----
  if (data.errors.length > 0) {
    console.log("\n[ Errors during build ]");
    for (const e of data.errors) console.log(`  - ${e}`);
  }

  console.log("\n=== Roster has", data.rosterCount, "employees ===\n");
})().catch(err => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
