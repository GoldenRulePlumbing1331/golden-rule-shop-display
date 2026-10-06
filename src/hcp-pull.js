// Paginated pull of HCP jobs for a window. HCP filters on the job's SCHEDULED
// start, so callers pad their window and bucket on completion day themselves.

import { getJobsInRange } from "./hcp.js";

export async function pullAllJobs(startISO, endISO, { maxPages = 30 } = {}) {
  const all = [];
  let page = 1;
  while (true) {
    const resp = await getJobsInRange({ startISO, endISO, pageSize: 100, page });
    all.push(...(resp?.jobs || []));
    const totalPages = resp?.total_pages || 1;
    if (page >= totalPages) break;
    page += 1;
    if (page > maxPages) {
      // Silent truncation would put wrong numbers on the TV. Fail loudly instead
      // so the slide is hidden rather than quietly under-counting.
      throw new Error(`HCP returned more than ${maxPages} pages of jobs for ${startISO} → ${endISO}`);
    }
  }
  return all;
}

export const COMPLETE_STATUSES = new Set(["complete", "complete unrated", "complete rated"]);
export const CANCELED_STATUSES = new Set(["user canceled", "pro canceled", "canceled", "deleted"]);

// The day a job counts as done: completion stamp, else its scheduled end/start.
export function jobDoneAt(j) {
  return j.work_timestamps?.completed_at
    || j.schedule?.scheduled_end
    || j.schedule?.scheduled_start
    || null;
}
