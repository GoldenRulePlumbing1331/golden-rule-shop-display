import { google } from "googleapis";
import fs from "fs";

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
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
  return cachedAuth;
}

// ---- Sheets ----

export async function readSheet(spreadsheetId, tabName) {
  const auth = await getAuth().getClient();
  const sheets = google.sheets({ version: "v4", auth });

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:Z1000`,
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

// ---- Drive ----

// Uploads a file to a Drive folder. If a file with the same name already
// exists in that folder (and was created by this bot), it's overwritten —
// keeping only one "current" deck in the folder week to week.
export async function uploadFileToDrive({ filePath, folderId, mimeType, displayName }) {
  const auth = await getAuth().getClient();
  const drive = google.drive({ version: "v3", auth });

  const name = displayName || filePath.split("/").pop();

  const existing = await drive.files.list({
    q: `name = '${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  const media = {
    mimeType,
    body: fs.createReadStream(filePath),
  };

  if (existing.data.files && existing.data.files.length > 0) {
    const fileId = existing.data.files[0].id;
    const resp = await drive.files.update({
      fileId,
      media,
      fields: "id, name, webViewLink",
    });
    return { ...resp.data, action: "updated" };
  }

  const resp = await drive.files.create({
    requestBody: {
      name,
      parents: [folderId],
    },
    media,
    fields: "id, name, webViewLink",
  });
  return { ...resp.data, action: "created" };
}
