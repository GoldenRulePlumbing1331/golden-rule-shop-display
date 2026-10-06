// Helpers for reading the plain-text export of a Google Sheet
// ("## Sheet name: Dashboard" followed by CSV lines), used by the offline
// test and preview scripts so they don't need Google access.

// Minimal CSV line splitter (handles "quoted, cells").
export function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// Pulls the Dashboard tab out of the text export as rows of cells.
export function dashboardRowsFromExport(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => /^## Sheet name: Dashboard/i.test(l));
  if (start === -1) throw new Error("No Dashboard tab found in export");
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## Sheet name:/i.test(lines[i])) break;
    rows.push(splitCsvLine(lines[i]));
  }
  return rows;
}
