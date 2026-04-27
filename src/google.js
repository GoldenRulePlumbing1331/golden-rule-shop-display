// Google Sheets and Calendar reader.
// Authenticates as the service account using the JSON credential
// stored in the GOOGLE_SERVICE_ACCOUNT_JSON env var.

import { google } from "googleapis";

let cachedAuth = null;

function getAuth() {
  if (cachedAuth) return cachedAuth;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON env var is not set. " +
      "In GitHub Actions this comes from the repository secret. " +
      "Locally, set it to the full JSON contents of the service account key file."
    );
  }

  let creds;
  try {
    creds = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON did not parse as JSON. " +
      "Make sure the entire .json file contents (including curly braces) " +
      "are pasted into the secret. Original error: " + e.message
    );
  }

  cachedAuth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
  });
  return cachedAuth;
}

// ---- Sheets ----

// Read all rows from a tab. Returns an array of objects keyed by row 1 headers.
// Empty rows are skipped.
export async function readSheet(spreadsheetId, tabName) {
  const auth = await getAuth().getClient();
  const sheets = google.sheets({ version: "v4", auth });

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:Z1000`, // generous bound; adjust if a tab ever exceeds this
  });

  const rows = resp.data.values || [];
  if (rows.length === 0) return [];

  const [headers, ...dataRows] = rows;
  return dataRows
    .filter(r => r.some(cell => cell !== "" && cell != null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = (row[i] !== undefined && row[i] !== null) ? String(row[i]).trim() : "";
      });
      return obj;
    });
}

// ---- Calendar ----
// (Stubbed for next round — we'll fill this in once Sheets is verified.)
export async function readCalendarEvents(calendarId, { startISO, endISO } = {}) {
  const auth = await getAuth().getClient();
  const calendar = google.calendar({ version: "v3", auth });

  const resp = await calendar.events.list({
    calendarId,
    timeMin: startISO,
    timeMax: endISO,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  return resp.data.items || [];
}
