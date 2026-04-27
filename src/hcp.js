// Thin wrapper around the Housecall Pro public API.
// Docs: https://docs.housecallpro.com/

const HCP_BASE = "https://api.housecallpro.com";

function requireApiKey() {
  const key = process.env.HCP_API_KEY;
  if (!key) {
    throw new Error(
      "HCP_API_KEY env var is not set. " +
      "In GitHub Actions this comes from the repository secret. " +
      "Locally, set it before running: `export HCP_API_KEY=...`"
    );
  }
  return key;
}

async function hcpFetch(path, params = {}) {
  const apiKey = requireApiKey();
  const url = new URL(HCP_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    headers: {
      "Authorization": `Token ${apiKey}`,
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `HCP API ${res.status} ${res.statusText} on ${path}\n${body}`
    );
  }
  return res.json();
}

// Returns jobs scheduled between two ISO dates.
export async function getScheduledJobs({ startISO, endISO, pageSize = 100, page = 1 }) {
  return hcpFetch("/jobs", {
    scheduled_start_min: startISO,
    scheduled_start_max: endISO,
    page_size: pageSize,
    page,
  });
}

// Returns jobs whose work_status indicates completion, scheduled within a date range.
// We filter by scheduled_start (not completion date) because HCP's API is cleaner that way —
// any job scheduled in the window that ended up complete will be picked up.
export async function getJobsInRange({ startISO, endISO, pageSize = 100, page = 1 }) {
  return hcpFetch("/jobs", {
    scheduled_start_min: startISO,
    scheduled_start_max: endISO,
    page_size: pageSize,
    page,
  });
}

// Lists all employees on the account.
// Returns one page; HCP accounts rarely have 100+ employees so pagination is unlikely.
export async function getEmployees({ pageSize = 100, page = 1 } = {}) {
  return hcpFetch("/employees", {
    page_size: pageSize,
    page,
  });
}
// Simple connection test — just pulls a couple of jobs.
export async function ping() {
  return hcpFetch("/jobs", { page_size: 1 });
}
