// Recomputes data/tech-year-stats.json from Housecall Pro. Run weekly by the
// "Refresh yearly tech stats" workflow; safe to run by hand (needs HCP_API_KEY).
//
//   npm run refresh-year-stats

import { computeTechYearStats, writeTechYearStats, DATA_FILE } from "../src/tech-year-stats.js";

const stats = await computeTechYearStats();
if (stats.techs.length === 0) {
  throw new Error("No tech stats computed — refusing to overwrite the cached file with an empty one");
}
writeTechYearStats(stats);
console.log(`Wrote ${DATA_FILE} (as of ${stats.asOfDay}, ${stats.techs.length} techs)`);
