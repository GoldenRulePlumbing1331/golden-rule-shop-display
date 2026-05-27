// Renders the office display "TODAY" dashboard as a single HTML page.
// Designed for a TV mounted near dispatch — viewed from ~4 feet away.

const COLORS = {
  NAVY_DARK:   "#0F1E3A",
  NAVY:        "#1B3358",
  STEEL:       "#2C4A6B",
  STEEL_LIGHT: "#E8EEF5",
  WHITE:       "#FFFFFF",
  YELLOW:      "#FFD000",
  RED_ALERT:   "#D32F2F",
  RED_SOFT:    "#FFCDD2",
  GREEN_OK:    "#2E7D32",
  GREEN_SOFT:  "#C8E6C9",
  AMBER:       "#F9A825",
  AMBER_SOFT:  "#FFF9C4",
  GRAY_TEXT:   "#4A5A70",
  GRAY_MUTED:  "#7A8599",
  GRAY_LINE:   "#D1D8E2",
};

const REFRESH_MS = 5 * 60 * 1000; // page reloads itself every 5 minutes

// ---------- Helpers ----------

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmtTime(d) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function fmtFullDate(d) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(d);
}

function statusBadgeClass(statusKey) {
  const map = {
    on_site: "on-site",
    en_route: "en-route",
    late: "late",
    available: "available",
    idle: "idle",
    done: "done",
    no_jobs: "no-jobs",
    out: "out",
  };
  return map[statusKey] || "idle";
}

// ---------- CSS ----------

function buildCSS() {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      min-height: 100vh;
      background: ${COLORS.STEEL_LIGHT};
      font-family: 'Arial', 'Helvetica', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      color: ${COLORS.NAVY_DARK};
    }

    .dashboard {
      max-width: 1920px;
      margin: 0 auto;
      padding: 0.4vw;
    }

    /* Top banner */
    .top-banner {
      background: ${COLORS.NAVY_DARK};
      color: ${COLORS.WHITE};
      padding: 0.35vw 1.2vw;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: relative;
      margin-bottom: 0.6vw;
    }
    .top-banner::before {
      content: "";
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 5px;
      background: ${COLORS.YELLOW};
    }
    .top-banner .title {
      font-family: 'Arial Black', sans-serif;
      font-size: 1.6vw;
      font-weight: 900;
      letter-spacing: 0.05em;
    }
    .top-banner .meta {
      text-align: right;
      font-size: 0.9vw;
      color: ${COLORS.STEEL_LIGHT};
      font-weight: bold;
      letter-spacing: 0.06em;
    }
    .top-banner .meta .date {
      color: ${COLORS.YELLOW};
      font-size: 1.1vw;
    }

    /* Layout grid */
    .row {
      display: grid;
      gap: 0.6vw;
      margin-bottom: 0.6vw;
    }
    .row.top {
      grid-template-columns: 2.5fr 1fr;
    }
    .row.mid {
      grid-template-columns: 1.5fr 1fr;
    }
    .row.bottom {
      grid-template-columns: 1fr;
    }

    /* Cards */
    .card {
      background: ${COLORS.WHITE};
      border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
      overflow: hidden;
    }
    .card-header {
      background: ${COLORS.NAVY};
      color: ${COLORS.WHITE};
      padding: 0.45vw 0.9vw;
      font-family: 'Arial Black', sans-serif;
      font-size: 1vw;
      font-weight: 900;
      letter-spacing: 0.1em;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-header .sub {
      color: ${COLORS.YELLOW};
      font-size: 0.75vw;
      letter-spacing: 0.12em;
    }
    .card-body {
      padding: 0.6vw 0.8vw;
    }

    /* Crew status table */
    .crew-table {
      width: 100%;
      border-collapse: collapse;
    }
    .crew-table tr {
      border-bottom: 1px solid ${COLORS.GRAY_LINE};
    }
    .crew-table tr:last-child {
      border-bottom: none;
    }
    .crew-table td {
      padding: 0.18vw 0.6vw;
      font-size: 0.95vw;
      vertical-align: middle;
    }
    .crew-table .name {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-weight: 900;
      font-size: 1vw;
      width: 16%;
    }
    .crew-table .badge-cell {
      width: 22%;
    }
    .crew-table .detail-cell {
      color: ${COLORS.GRAY_TEXT};
      font-size: 0.9vw;
    }
    .crew-table .time-cell {
      width: 18%;
      text-align: right;
      color: ${COLORS.GRAY_MUTED};
      font-size: 0.85vw;
      font-weight: bold;
    }

    .badge {
      display: inline-block;
      padding: 0.15vw 0.6vw;
      font-family: 'Arial Black', sans-serif;
      font-size: 0.8vw;
      font-weight: 900;
      letter-spacing: 0.1em;
      border-radius: 0.2vw;
      min-width: 6.5vw;
      text-align: center;
    }
    .badge.on-site { background: ${COLORS.GREEN_SOFT}; color: ${COLORS.GREEN_OK}; }
    .badge.en-route { background: ${COLORS.AMBER_SOFT}; color: ${COLORS.AMBER}; }
    .badge.late { background: ${COLORS.RED_SOFT}; color: ${COLORS.RED_ALERT}; }
    .badge.available { background: ${COLORS.STEEL_LIGHT}; color: ${COLORS.STEEL}; }
    .badge.idle { background: ${COLORS.STEEL_LIGHT}; color: ${COLORS.STEEL}; }
    .badge.done { background: ${COLORS.NAVY_DARK}; color: ${COLORS.STEEL_LIGHT}; }
    .badge.no-jobs { background: ${COLORS.STEEL_LIGHT}; color: ${COLORS.GRAY_MUTED}; }
    .badge.out { background: ${COLORS.RED_ALERT}; color: ${COLORS.WHITE}; }

    /* Today at a glance — single column, no wrapping */
    .glance-section {
      margin-bottom: 0.5vw;
    }
    .glance-section:last-child {
      margin-bottom: 0;
    }
    .glance-section-title {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY};
      font-size: 0.8vw;
      letter-spacing: 0.14em;
      margin-bottom: 0.25vw;
      padding-bottom: 0.2vw;
      border-bottom: 2px solid ${COLORS.YELLOW};
    }
    .glance-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.15vw 1vw;
    }
    .glance-item {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 0.2vw 0;
      border-bottom: 1px solid ${COLORS.GRAY_LINE};
    }
    .glance-item:last-child {
      border-bottom: none;
    }
    .glance-item .label {
      color: ${COLORS.GRAY_TEXT};
      font-size: 0.8vw;
      font-weight: bold;
      letter-spacing: 0.06em;
    }
    .glance-item .value {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 1.3vw;
      font-weight: 900;
    }
    /* Pipeline items get a single column so $ values don't wrap */
    .glance-stack .glance-item {
      padding: 0.25vw 0;
    }
    .glance-stack .glance-item .value {
      font-size: 1.2vw;
    }

    /* List tables (estimates and invoices) */
    .list-table {
      width: 100%;
      border-collapse: collapse;
    }
    .list-table tr {
      border-bottom: 1px solid ${COLORS.GRAY_LINE};
    }
    .list-table tr:last-child {
      border-bottom: none;
    }
    .list-table tr.aged-warning {
      background: ${COLORS.AMBER_SOFT};
    }
    .list-table tr.aged-critical {
      background: ${COLORS.RED_SOFT};
    }
    .list-table td {
      padding: 0.25vw 0.6vw;
      font-size: 0.9vw;
    }
    .list-table .age {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-weight: 900;
      width: 14%;
      text-align: right;
    }
    .list-table .age.warning {
      color: ${COLORS.AMBER};
    }
    .list-table .age.critical {
      color: ${COLORS.RED_ALERT};
    }
    .list-table .amount {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-weight: 900;
      width: 18%;
      text-align: right;
    }
    .list-table .customer {
      color: ${COLORS.NAVY_DARK};
      font-weight: bold;
    }
    .list-table .tech-tag {
      color: ${COLORS.GRAY_MUTED};
      font-size: 0.8vw;
      font-weight: bold;
      letter-spacing: 0.08em;
      width: 14%;
    }

    .list-footer {
      background: ${COLORS.NAVY_DARK};
      color: ${COLORS.YELLOW};
      padding: 0.4vw 0.9vw;
      font-family: 'Arial Black', sans-serif;
      font-size: 0.85vw;
      font-weight: 900;
      letter-spacing: 0.1em;
      text-align: center;
    }
    .list-footer .red {
      color: ${COLORS.RED_SOFT};
    }

    .empty-state {
      padding: 1vw;
      text-align: center;
      color: ${COLORS.GRAY_MUTED};
      font-style: italic;
      font-size: 0.9vw;
    }

    /* Hot list */
    .hot-card {
      background: ${COLORS.YELLOW};
      border: 1px solid ${COLORS.AMBER};
    }
    .hot-card .card-header {
      background: ${COLORS.NAVY_DARK};
    }
    .hot-list {
      padding: 0.3vw;
      display: flex;
      gap: 0.4vw;
    }
    .hot-item {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 0.6vw;
      padding: 0.5vw 0.8vw;
      background: ${COLORS.WHITE};
      border-left: 5px solid;
      min-height: 2.4vw;
    }
    .hot-item.high {
      border-left-color: ${COLORS.RED_ALERT};
    }
    .hot-item.medium {
      border-left-color: ${COLORS.AMBER};
    }
    .hot-item .icon {
      font-size: 1.3vw;
      flex-shrink: 0;
    }
    .hot-item .text {
      flex: 1;
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 0.95vw;
      font-weight: 900;
      line-height: 1.25;
    }
    .hot-empty {
      flex: 1;
      padding: 0.6vw;
      text-align: center;
      color: ${COLORS.NAVY_DARK};
      font-style: italic;
      font-size: 0.95vw;
      font-weight: bold;
    }

    /* Footer */
    .page-footer {
      text-align: center;
      padding: 0.4vw;
      color: ${COLORS.GRAY_MUTED};
      font-size: 0.75vw;
      letter-spacing: 0.08em;
      font-weight: bold;
    }
    .page-footer .live {
      color: ${COLORS.GREEN_OK};
    }
  `;
}

// ---------- Section renderers ----------

function renderCrewTable(crew) {
  const rows = crew.map(c => {
    const s = c.status;
    const badgeClass = statusBadgeClass(s.status);
    let detailText = "";
    let timeText = "";

    if (s.status === "on_site") {
      detailText = s.detail || "";
      timeText = s.elapsed ? `${s.elapsed} on site` : "";
    } else if (s.status === "en_route") {
      detailText = s.detail || "";
      timeText = s.etaTime ? `sched ${s.etaTime}` : "";
    } else if (s.status === "late") {
      detailText = s.detail || "";
      timeText = s.etaTime ? `was ${s.etaTime}` : "";
    } else if (s.status === "available") {
      detailText = `Next: ${s.detail || ""}`.trim();
      timeText = s.etaTime || "";
    } else if (s.status === "done") {
      detailText = `${c.jobCount} jobs complete`;
    } else if (s.status === "no_jobs") {
      detailText = "—";
    } else if (s.status === "out") {
      detailText = "Out of office";
    }

    return `
      <tr>
        <td class="name">${escapeHtml(c.tech.display)}</td>
        <td class="badge-cell"><span class="badge ${badgeClass}">${escapeHtml(s.label)}</span></td>
        <td class="detail-cell">${escapeHtml(detailText)}</td>
        <td class="time-cell">${escapeHtml(timeText)}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="card">
      <div class="card-header">
        <span>CREW STATUS</span>
        <span class="sub">${crew.length} TECHNICIANS</span>
      </div>
      <div class="card-body" style="padding: 0;">
        <table class="crew-table">${rows}</table>
      </div>
    </div>
  `;
}

function renderTodayGlance(todaySummary, openEstimates, pastDueInvoices) {
  return `
    <div class="card">
      <div class="card-header">
        <span>TODAY AT A GLANCE</span>
      </div>
      <div class="card-body">
        <div class="glance-section">
          <div class="glance-section-title">JOBS</div>
          <div class="glance-grid">
            <div class="glance-item"><span class="label">SCHEDULED</span><span class="value">${todaySummary.scheduled}</span></div>
            <div class="glance-item"><span class="label">COMPLETED</span><span class="value">${todaySummary.completed}</span></div>
            <div class="glance-item"><span class="label">IN PROGRESS</span><span class="value">${todaySummary.inProgress}</span></div>
            <div class="glance-item"><span class="label">NOT STARTED</span><span class="value">${todaySummary.notStarted}</span></div>
          </div>
        </div>
        <div class="glance-section">
          <div class="glance-section-title">REVENUE TODAY</div>
          <div class="glance-item"><span class="label">CLOSED</span><span class="value">${escapeHtml(todaySummary.revenueDisplay)}</span></div>
        </div>
        <div class="glance-section">
          <div class="glance-section-title">PIPELINE</div>
          <div class="glance-stack">
            <div class="glance-item"><span class="label">MISSING PRICING</span><span class="value">${openEstimates.totalCount}</span></div>
            <div class="glance-item"><span class="label">UNPAID INV.</span><span class="value">${pastDueInvoices.totalCount}</span></div>
            <div class="glance-item"><span class="label">UNPAID $</span><span class="value">${escapeHtml(pastDueInvoices.totalValue)}</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function ageClass(days, warningAt = 7, criticalAt = 14) {
  if (days >= criticalAt) return "critical";
  if (days >= warningAt) return "warning";
  return "";
}

function ageRowClass(days, warningAt = 7, criticalAt = 14) {
  if (days >= criticalAt) return "aged-critical";
  if (days >= warningAt) return "aged-warning";
  return "";
}

function renderOpenEstimates(openEstimates) {
  if (openEstimates.list.length === 0) {
    return `
      <div class="card">
        <div class="card-header"><span>OPEN ESTIMATES — NEEDS FOLLOWUP</span></div>
        <div class="empty-state">No open estimates older than the typical pipeline</div>
      </div>
    `;
  }

  // Sort by age desc (oldest first)
  const sorted = [...openEstimates.list].sort((a, b) => b.ageDays - a.ageDays);
  const rows = sorted.map(e => {
    const rowCls = ageRowClass(e.ageDays);
    const ageCls = ageClass(e.ageDays);
    return `
      <tr class="${rowCls}">
        <td class="age ${ageCls}">${e.ageDays}d</td>
        <td class="amount">${escapeHtml(e.amountDisplay)}</td>
        <td class="customer">${escapeHtml(e.customer)}</td>
        <td class="tech-tag">${escapeHtml(e.techName || "")}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="card">
      <div class="card-header">
        <span>OPEN ESTIMATES — NEEDS FOLLOWUP</span>
        <span class="sub">${openEstimates.totalCount} TOTAL</span>
      </div>
      <table class="list-table">${rows}</table>
      <div class="list-footer">
        TOTAL: ${escapeHtml(openEstimates.totalValue)}
        ${openEstimates.agedCount > 0 ? `  ·  <span class="red">${openEstimates.agedCount} AGED >7 DAYS = ${escapeHtml(openEstimates.agedValue)}</span>` : ""}
      </div>
    </div>
  `;
}

function renderPastDueInvoices(pastDueInvoices) {
  if (pastDueInvoices.list.length === 0) {
    return `
      <div class="card">
        <div class="card-header"><span>PAST-DUE INVOICES</span></div>
        <div class="empty-state">No invoices past due</div>
      </div>
    `;
  }

  const rows = pastDueInvoices.list.map(i => {
    const rowCls = ageRowClass(i.ageDays, 14, 21);
    const ageCls = ageClass(i.ageDays, 14, 21);
    return `
      <tr class="${rowCls}">
        <td class="age ${ageCls}">${i.ageDays}d</td>
        <td class="amount">${escapeHtml(i.amountDisplay)}</td>
        <td class="customer">${escapeHtml(i.customer)}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="card">
      <div class="card-header">
        <span>PAST-DUE INVOICES</span>
        <span class="sub">${pastDueInvoices.totalCount} TOTAL</span>
      </div>
      <table class="list-table">${rows}</table>
      <div class="list-footer">
        TOTAL OUTSTANDING: ${escapeHtml(pastDueInvoices.totalValue)}
      </div>
    </div>
  `;
}

function renderHotList(hotList) {
  let inner;
  if (hotList.length === 0) {
    inner = `<div class="hot-empty">✓ Nothing urgent — all systems looking good</div>`;
  } else {
    inner = hotList.map(h => `
      <div class="hot-item ${h.severity}">
        <span class="icon">${h.icon}</span>
        <span class="text">${escapeHtml(h.text)}</span>
      </div>
    `).join("");
  }

  return `
    <div class="card hot-card">
      <div class="card-header">
        <span>🔥 HOT — NEEDS ATTENTION</span>
      </div>
      <div class="hot-list">${inner}</div>
    </div>
  `;
}

// ---------- Main entry point ----------

export function renderOfficeToday(data) {
  const now = new Date();
  const refreshSec = REFRESH_MS / 1000;
  const generatedAt = new Date(data.generatedAt);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="${refreshSec}">
  <title>Golden Rule — Office Display</title>
  <style>${buildCSS()}</style>
</head>
<body>
  <div class="dashboard">
    <div class="top-banner">
      <div class="title">OFFICE DASHBOARD — TODAY</div>
      <div class="meta">
        <div class="date">${escapeHtml(fmtFullDate(now))}</div>
        <div>UPDATED ${escapeHtml(fmtTime(generatedAt))} ET  ·  AUTO-REFRESH 5 MIN</div>
      </div>
    </div>

    <div class="row top">
      ${renderCrewTable(data.crew)}
      ${renderTodayGlance(data.todaySummary, data.openEstimates, data.pastDueInvoices)}
    </div>

    <div class="row mid">
      ${renderOpenEstimates(data.openEstimates)}
      ${renderPastDueInvoices(data.pastDueInvoices)}
    </div>

    <div class="row bottom">
      ${renderHotList(data.hotList)}
    </div>

    <div class="page-footer">
      GOLDEN RULE PLUMBING & CONTRACTING  ·  GOLDENRULEPH.COM
      <span class="live">  ·  LIVE</span>
    </div>
  </div>
</body>
</html>`;
}
