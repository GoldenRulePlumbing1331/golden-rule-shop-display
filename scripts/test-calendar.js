import { readCalendarEvents } from "../src/google.js";

const CAL_ID = process.env.GOOGLE_CALENDAR_ID;

function fmtET(iso) {
  if (!iso) return "(no time)";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

(async () => {
  if (!CAL_ID) throw new Error("GOOGLE_CALENDAR_ID env var not set");

  const now = new Date();
  const in14days = new Date(now);
  in14days.setUTCDate(now.getUTCDate() + 14);

  console.log("=== Google Calendar test ===");
  console.log(`Calendar: ${CAL_ID}`);
  console.log(`Range: now → 14 days out\n`);

  const events = await readCalendarEvents(CAL_ID, {
    startISO: now.toISOString(),
    endISO: in14days.toISOString(),
  });

  console.log(`Found ${events.length} event(s).\n`);

  for (const e of events) {
    const start = e.start?.dateTime || e.start?.date || null;
    const summary = e.summary || "(no title)";
    const loc = e.location || "";
    const startLabel = e.start?.dateTime ? fmtET(start) : `${start} (all day)`;
    console.log(`  ${startLabel.padEnd(28)}  ${summary}${loc ? `  •  ${loc}` : ""}`);
  }
})().catch(err => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
