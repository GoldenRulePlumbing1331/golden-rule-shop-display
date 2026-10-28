// Renders the office display as a rotating slideshow — same 16:9 deck,
// header/footer bars and timing engine as the shop board, but with live
// dispatch data. Built for a TV read from across the office, so everything
// is one topic per slide at large type.
//
// Slides (a slide with nothing to show is still rendered with a clear
// "nothing here" message, so the office knows the list is empty rather
// than wondering whether it failed):
//   1. CREW STATUS   — every tech, where they are, plus today's job counts
//   2. TODAY         — Google Calendar events for the day
//   3. OPEN ESTIMATES — estimates still missing a price
//   4. PAST DUE      — completed jobs with a balance
// A HOT strip (late starts, stale estimates, aging invoices) sits above the
// footer on every slide whenever there is something urgent.

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
  BLUE:        "#1565C0",
  BLUE_SOFT:   "#BBDEFB",
  GRAY_TEXT:   "#4A5A70",
  GRAY_MUTED:  "#7A8599",
  GRAY_LINE:   "#D1D8E2",
};

// Seconds per slide.
const SLIDE_TIMINGS = {
  crew:      25,
  events:    15,
  estimates: 18,
  invoices:  15,
};

// The board rebuilds every ~10 minutes. Once the page is older than this,
// the next end-of-rotation triggers a hard reload.
const REFRESH_MS = 8 * 60 * 1000;

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
    multi_day: "multi-day",
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

function ageClass(days, warningAt = 7, criticalAt = 14) {
  if (days >= criticalAt) return "critical";
  if (days >= warningAt) return "warning";
  return "";
}

// ---------- CSS ----------

function buildCSS() {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%; overflow: hidden;
      background: ${COLORS.NAVY_DARK};
      font-family: 'Arial', 'Helvetica', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      color: ${COLORS.NAVY_DARK};
    }
    body { user-select: none; -webkit-user-select: none; }

    /* ---- Deck chassis (matches the shop board) ---- */
    .stage { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: #000; }
    .deck {
      position: relative; width: 100vw; height: 56.25vw;
      max-height: 100vh; max-width: 177.78vh;
      background: ${COLORS.STEEL_LIGHT}; overflow: hidden;
    }
    .slide {
      position: absolute; inset: 0; width: 100%; height: 100%;
      opacity: 0; transition: opacity 0.5s ease-in-out; pointer-events: none;
    }
    .slide.active { opacity: 1; pointer-events: auto; z-index: 2; }

    .header-bar {
      position: absolute; top: 0; left: 0; right: 0; height: 11.3%;
      background: ${COLORS.NAVY_DARK};
      display: flex; align-items: center; padding: 0 3% 0 1.5%; z-index: 5;
    }
    .header-bar::before {
      content: ""; position: absolute; top: 0; left: 0; bottom: 0;
      width: 1.35%; background: ${COLORS.YELLOW};
    }
    .header-bar .title {
      font-family: 'Arial Black', 'Arial', sans-serif;
      font-size: 2.6vw; font-weight: 900; color: ${COLORS.WHITE};
      letter-spacing: 0.04em; flex: 1; padding-left: 1.5%;
    }
    .header-bar .title .sub {
      font-family: 'Arial', sans-serif; font-size: 1.1vw; font-weight: bold;
      color: ${COLORS.YELLOW}; letter-spacing: 0.14em; margin-left: 2%;
      vertical-align: middle;
    }
    .header-bar .when { text-align: right; flex-shrink: 0; line-height: 1.15; }
    .header-bar .when .date {
      color: ${COLORS.YELLOW}; font-size: 1.3vw; font-weight: bold; letter-spacing: 0.08em;
    }
    .header-bar .when .clock {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.WHITE}; font-size: 2.2vw; font-weight: 900; letter-spacing: 0.04em;
    }

    .footer-bar {
      position: absolute; left: 0; right: 0; bottom: 0; height: 4.7%;
      background: ${COLORS.NAVY_DARK};
      display: flex; align-items: center; padding: 0 3%; z-index: 5;
    }
    .footer-bar .left { flex: 1; color: ${COLORS.WHITE}; font-size: 0.9vw; font-weight: bold; letter-spacing: 0.1em; }
    .footer-bar .left .live { color: ${COLORS.GREEN_OK}; }
    .footer-bar .right { color: ${COLORS.YELLOW}; font-size: 0.9vw; font-weight: bold; letter-spacing: 0.1em; }

    .progress {
      position: fixed; top: 0; left: 0; right: 0; height: 3px;
      background: rgba(255,208,0,0.2); z-index: 100;
    }
    .progress .bar { height: 100%; background: ${COLORS.YELLOW}; width: 0; transition: width 0.1s linear; }

    /* Slide body: between header and footer. When the HOT strip is shown the
       body is shortened so the strip never covers content. */
    .slide-body { position: absolute; top: 11.3%; left: 0; right: 0; bottom: 4.7%; }
    .has-hot .slide-body { bottom: 13.2%; }

    /* ---- HOT strip ---- */
    .hot-strip {
      position: absolute; left: 0; right: 0; bottom: 4.7%; height: 8.5%;
      background: ${COLORS.YELLOW}; border-top: 0.25vw solid ${COLORS.NAVY_DARK};
      display: flex; align-items: stretch; z-index: 4;
    }
    .hot-strip .hot-label {
      flex-shrink: 0; width: 9%;
      background: ${COLORS.NAVY_DARK}; color: ${COLORS.YELLOW};
      font-family: 'Arial Black', sans-serif; font-size: 1.2vw; font-weight: 900;
      letter-spacing: 0.14em; display: flex; align-items: center; justify-content: center;
      text-align: center; line-height: 1.1;
    }
    .hot-strip .hot-items { flex: 1; display: flex; gap: 0.5%; padding: 0.5%; }
    .hot-item {
      flex: 1; min-width: 0;
      background: ${COLORS.WHITE}; border-left: 0.45vw solid;
      display: flex; align-items: center; gap: 0.8vw; padding: 0 1vw;
    }
    .hot-item.high { border-left-color: ${COLORS.RED_ALERT}; }
    .hot-item.medium { border-left-color: ${COLORS.AMBER}; }
    .hot-item .icon { font-size: 1.5vw; flex-shrink: 0; }
    .hot-item .text {
      flex: 1; min-width: 0;
      font-family: 'Arial Black', sans-serif; font-size: 1.05vw; font-weight: 900;
      color: ${COLORS.NAVY_DARK}; line-height: 1.2;
      overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    }

    /* ---- Shared ---- */
    .empty-state {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; padding: 0 10%;
    }
    .empty-state .big {
      font-family: 'Arial Black', sans-serif; font-size: 4vw; font-weight: 900;
      color: ${COLORS.GREEN_OK}; letter-spacing: 0.04em; line-height: 1.1;
    }
    .empty-state .small {
      margin-top: 1.5%; font-size: 1.4vw; font-weight: bold; color: ${COLORS.GRAY_MUTED};
      letter-spacing: 0.1em;
    }
    .count-pill {
      display: inline-block; vertical-align: middle; margin-left: 2%;
      background: ${COLORS.YELLOW}; color: ${COLORS.NAVY_DARK};
      font-family: 'Arial Black', sans-serif; font-size: 1.5vw; font-weight: 900;
      padding: 0.1vw 1vw; border-radius: 0.3vw; letter-spacing: 0.04em;
    }
    .count-pill.red { background: ${COLORS.RED_ALERT}; color: ${COLORS.WHITE}; }

    /* ---- CREW slide ---- */
    .crew-layout {
      position: absolute; top: 2%; left: 2.5%; right: 2.5%; bottom: 2%;
      display: grid; grid-template-columns: 1fr 22%; gap: 1.5%;
    }
    .crew-table-wrap {
      background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden;
    }
    .crew-table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; }
    .crew-table tr { border-bottom: 1px solid ${COLORS.GRAY_LINE}; }
    .crew-table tr:last-child { border-bottom: none; }
    .crew-table tr.late { background: ${COLORS.RED_SOFT}; }
    .crew-table td {
      padding: 0 1vw; vertical-align: middle;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .crew-table .name {
      font-family: 'Arial Black', sans-serif; font-weight: 900;
      font-size: 2vw; width: 18%;
    }
    .crew-table .badge-cell { width: 25%; }
    .crew-table .detail-cell { font-size: 1.6vw; font-weight: bold; color: ${COLORS.NAVY_DARK}; }
    .crew-table .detail-cell .dim { color: ${COLORS.GRAY_MUTED}; font-weight: bold; }
    .crew-table .time-cell {
      width: 19%; text-align: right; color: ${COLORS.GRAY_TEXT};
      font-size: 1.35vw; font-weight: bold;
    }
    .crew-table tr.late .time-cell { color: ${COLORS.RED_ALERT}; }

    .badge {
      display: inline-block; width: 100%;
      padding: 0.25vw 0; text-align: center;
      font-family: 'Arial Black', sans-serif; font-size: 1.25vw; font-weight: 900;
      letter-spacing: 0.1em; border-radius: 0.3vw;
    }
    .badge.on-site   { background: ${COLORS.GREEN_SOFT}; color: ${COLORS.GREEN_OK}; }
    .badge.multi-day { background: ${COLORS.BLUE_SOFT};  color: ${COLORS.BLUE}; }
    .badge.en-route  { background: ${COLORS.AMBER_SOFT}; color: ${COLORS.AMBER}; }
    .badge.late      { background: ${COLORS.RED_ALERT};  color: ${COLORS.WHITE}; }
    .badge.available { background: ${COLORS.STEEL_LIGHT}; color: ${COLORS.STEEL}; }
    .badge.idle      { background: ${COLORS.STEEL_LIGHT}; color: ${COLORS.STEEL}; }
    .badge.done      { background: ${COLORS.NAVY_DARK};  color: ${COLORS.STEEL_LIGHT}; }
    .badge.no-jobs   { background: ${COLORS.STEEL_LIGHT}; color: ${COLORS.GRAY_MUTED}; }
    .badge.out       { background: ${COLORS.GRAY_MUTED}; color: ${COLORS.WHITE}; }

    .stat-stack { display: flex; flex-direction: column; gap: 1.5%; }
    .stat-tile {
      flex: 1; background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      position: relative; overflow: hidden;
    }
    .stat-tile::before {
      content: ""; position: absolute; top: 0; left: 0; right: 0; height: 0.45vw;
      background: ${COLORS.NAVY_DARK};
    }
    .stat-tile.gold::before { background: ${COLORS.YELLOW}; }
    .stat-tile.green::before { background: ${COLORS.GREEN_OK}; }
    .stat-tile .label {
      color: ${COLORS.GRAY_TEXT}; font-size: 0.95vw; font-weight: bold; letter-spacing: 0.14em;
      margin-bottom: 2%;
    }
    .stat-tile .value {
      font-family: 'Arial Black', sans-serif; font-size: 3.4vw; font-weight: 900;
      line-height: 1; color: ${COLORS.NAVY_DARK};
    }
    .stat-tile .value.money { font-size: 2.6vw; color: ${COLORS.GREEN_OK}; }
    .stat-tile .split {
      display: flex; gap: 1.5vw; margin-top: 3%;
      color: ${COLORS.GRAY_MUTED}; font-size: 0.95vw; font-weight: bold; letter-spacing: 0.08em;
    }
    .stat-tile .split b { color: ${COLORS.NAVY_DARK}; font-family: 'Arial Black', sans-serif; font-size: 1.2vw; }

    /* ---- EVENTS slide ---- */
    .events-list {
      position: absolute; top: 2%; left: 2.5%; right: 2.5%; bottom: 2%;
      display: grid; grid-auto-rows: minmax(0, 1fr); gap: 1.2%; align-content: start;
    }
    .events-list.two-col { grid-template-columns: 1fr 1fr; grid-auto-flow: row; }
    .event-row { max-height: 8vw; min-height: 5vw; }
    .event-row {
      background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: flex; align-items: stretch; overflow: hidden; min-height: 0;
    }
    .event-row .time-block {
      flex-shrink: 0; width: 22%;
      background: ${COLORS.NAVY_DARK}; color: ${COLORS.WHITE};
      display: flex; align-items: center; justify-content: center; text-align: center;
      font-family: 'Arial Black', sans-serif; font-size: 1.45vw; font-weight: 900;
      letter-spacing: 0.04em; padding: 0 2%; line-height: 1.2;
    }
    .event-row .time-block.all-day { background: ${COLORS.YELLOW}; color: ${COLORS.NAVY_DARK}; font-size: 1.2vw; letter-spacing: 0.14em; }
    .event-row.out .time-block { background: ${COLORS.GRAY_MUTED}; color: ${COLORS.WHITE}; }
    .event-row .info {
      flex: 1; min-width: 0; padding: 0 2%;
      display: flex; flex-direction: column; justify-content: center;
    }
    .event-row .title {
      font-family: 'Arial Black', sans-serif; font-size: 1.7vw; font-weight: 900;
      color: ${COLORS.NAVY_DARK}; line-height: 1.15;
      overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    }
    .events-list.two-col .event-row .title { font-size: 1.4vw; }
    .events-list.two-col .event-row .time-block { font-size: 1.2vw; }
    .event-row .location {
      margin-top: 0.4%; color: ${COLORS.GRAY_TEXT}; font-size: 1.05vw; font-weight: bold;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .event-row.out .title { color: ${COLORS.GRAY_TEXT}; }

    /* ---- LIST slides (estimates, invoices) ---- */
    .list-wrap {
      position: absolute; top: 2%; left: 2.5%; right: 2.5%; bottom: 2%;
      background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: flex; flex-direction: column; overflow: hidden;
    }
    .list-table { width: 100%; flex: 0 0 auto; border-collapse: collapse; table-layout: fixed; }
    .list-table tbody tr { height: 3.5vw; }
    .list-table thead th {
      background: ${COLORS.NAVY}; color: ${COLORS.STEEL_LIGHT};
      font-size: 0.95vw; font-weight: bold; letter-spacing: 0.14em; text-align: left;
      padding: 0.5vw 1vw; height: 2.6vw;
    }
    .list-table thead th.r { text-align: right; }
    .list-table tbody tr { border-bottom: 1px solid ${COLORS.GRAY_LINE}; }
    .list-table tbody tr:last-child { border-bottom: none; }
    .list-table tbody tr.aged-warning { background: ${COLORS.AMBER_SOFT}; }
    .list-table tbody tr.aged-critical { background: ${COLORS.RED_SOFT}; }
    .list-table td {
      padding: 0 1vw; vertical-align: middle; font-size: 1.55vw; font-weight: bold;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .list-table .age {
      font-family: 'Arial Black', sans-serif; font-weight: 900; font-size: 1.9vw;
      text-align: right;
    }
    .list-table .age.warning { color: ${COLORS.AMBER}; }
    .list-table .age.critical { color: ${COLORS.RED_ALERT}; }
    .list-table .est-num { color: ${COLORS.STEEL}; font-family: 'Arial Black', sans-serif; font-size: 1.3vw; }
    .list-table .customer { color: ${COLORS.NAVY_DARK}; }
    .list-table .tech { color: ${COLORS.GRAY_MUTED}; letter-spacing: 0.06em; font-size: 1.3vw; }
    .list-table .amount {
      text-align: right;
      font-family: 'Arial Black', sans-serif; font-weight: 900; font-size: 1.9vw;
    }
    .list-table .amount.none { color: ${COLORS.RED_ALERT}; font-size: 1.3vw; letter-spacing: 0.08em; }
    .list-footer {
      flex-shrink: 0; margin-top: auto; background: ${COLORS.NAVY_DARK}; color: ${COLORS.YELLOW};
      padding: 0.7vw 1.5vw; display: flex; justify-content: space-between; align-items: center;
      font-family: 'Arial Black', sans-serif; font-size: 1.3vw; font-weight: 900; letter-spacing: 0.1em;
    }
    .list-footer .red { color: ${COLORS.RED_SOFT}; }
    .list-footer .more { color: ${COLORS.STEEL_LIGHT}; font-family: 'Arial', sans-serif; font-size: 1vw; font-weight: bold; }
  `;
}

// ---------- Chrome ----------

function htmlHeader(title, extraHTML = "") {
  return `
    <div class="header-bar">
      <div class="title">${escapeHtml(title)}${extraHTML}</div>
      <div class="when">
        <div class="date js-date"></div>
        <div class="clock js-clock"></div>
      </div>
    </div>
  `;
}

function htmlFooter(slideLabel, generatedAt) {
  return `
    <div class="footer-bar">
      <div class="left">GOLDEN RULE PLUMBING & CONTRACTING  •  UPDATED ${escapeHtml(fmtTime(generatedAt))} ET <span class="live">•  LIVE</span></div>
      <div class="right">${escapeHtml(slideLabel)}</div>
    </div>
  `;
}

function renderHotStrip(hotList) {
  if (!hotList || hotList.length === 0) return "";
  const items = hotList.slice(0, 3).map(h => `
    <div class="hot-item ${h.severity}">
      <span class="icon">${h.icon}</span>
      <span class="text">${escapeHtml(h.text)}</span>
    </div>
  `).join("");
  return `
    <div class="hot-strip">
      <div class="hot-label">NEEDS<br>ATTENTION</div>
      <div class="hot-items">${items}</div>
    </div>
  `;
}

// ---------- Slides ----------

function buildCrewSlide(data) {
  const rows = data.crew.map(c => {
    const s = c.status;
    const badgeClass = statusBadgeClass(s.status);
    let detail = "";
    let time = "";

    if (s.status === "on_site") {
      detail = escapeHtml(s.detail || "");
      time = s.elapsed ? `${escapeHtml(s.elapsed)} on site` : "";
    } else if (s.status === "multi_day") {
      detail = escapeHtml(s.detail || "") + (s.dayLabel ? ` <span class="dim">· ${escapeHtml(s.dayLabel)}</span>` : "");
      time = s.etaTime ? `sched ${escapeHtml(s.etaTime)}` : "";
    } else if (s.status === "en_route") {
      detail = escapeHtml(s.detail || "");
      time = s.etaTime ? `sched ${escapeHtml(s.etaTime)}` : "";
    } else if (s.status === "late") {
      detail = escapeHtml(s.detail || "") + ` <span class="dim">· no OMW</span>`;
      time = s.etaTime ? `was ${escapeHtml(s.etaTime)}` : "";
    } else if (s.status === "available") {
      detail = `<span class="dim">Next:</span> ${escapeHtml(s.detail || "")}`;
      time = escapeHtml(s.etaTime || "");
    } else if (s.status === "done") {
      detail = `<span class="dim">${escapeHtml(s.detail || `${c.jobCount} jobs complete`)}</span>`;
    } else if (s.status === "no_jobs") {
      detail = `<span class="dim">—</span>`;
    } else if (s.status === "out") {
      detail = `<span class="dim">Out of office</span>`;
    }

    return `
      <tr class="${s.status === "late" ? "late" : ""}">
        <td class="name">${escapeHtml(c.tech.display)}</td>
        <td class="badge-cell"><span class="badge ${badgeClass}">${escapeHtml(s.label)}</span></td>
        <td class="detail-cell">${detail}</td>
        <td class="time-cell">${time}</td>
      </tr>
    `;
  }).join("");

  const t = data.todaySummary;
  const working = data.crew.filter(c => ["on_site", "multi_day", "en_route", "late", "available"].includes(c.status.status)).length;
  const out = data.crew.filter(c => c.status.status === "out").length;

  return `
    ${htmlHeader("CREW STATUS", `<span class="sub">${working} WORKING${out ? ` · ${out} OUT` : ""}</span>`)}
    <div class="slide-body">
      <div class="crew-layout">
        <div class="crew-table-wrap">
          <table class="crew-table"><tbody>${rows}</tbody></table>
        </div>
        <div class="stat-stack">
          <div class="stat-tile">
            <div class="label">JOBS TODAY</div>
            <div class="value">${t.scheduled}</div>
          </div>
          <div class="stat-tile gold">
            <div class="label">PROGRESS</div>
            <div class="value">${t.completed}<span style="font-size:1.6vw;color:${COLORS.GRAY_MUTED}"> / ${t.scheduled}</span></div>
            <div class="split">
              <span><b>${t.inProgress}</b> IN PROGRESS</span>
              <span><b>${t.notStarted}</b> TO GO</span>
            </div>
          </div>
          <div class="stat-tile green">
            <div class="label">CLOSED TODAY</div>
            <div class="value money">${escapeHtml(t.revenueDisplay)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildEventsSlide(data) {
  const events = data.events || [];
  const MAX = 12;
  const shown = events.slice(0, MAX);

  let body;
  if (shown.length === 0) {
    body = `
      <div class="empty-state">
        <div class="big">NOTHING ON THE CALENDAR</div>
        <div class="small">NO EVENTS SCHEDULED FOR TODAY</div>
      </div>
    `;
  } else {
    const twoCol = shown.length > 6;
    const rows = shown.map(e => `
      <div class="event-row ${e.isOut ? "out" : ""}">
        <div class="time-block ${e.allDay ? "all-day" : ""}">${escapeHtml(e.timeLabel)}</div>
        <div class="info">
          <div class="title">${escapeHtml(e.title)}</div>
          ${e.location ? `<div class="location">${escapeHtml(e.location)}</div>` : ""}
        </div>
      </div>
    `).join("");
    body = `<div class="events-list ${twoCol ? "two-col" : ""}">${rows}</div>`;
  }

  const extra = events.length > MAX ? `<span class="sub">+${events.length - MAX} MORE</span>` : "";
  return `
    ${htmlHeader("TODAY'S EVENTS", extra)}
    <div class="slide-body">${body}</div>
  `;
}

function buildEstimatesSlide(data) {
  const est = data.openEstimates;
  if (est.list.length === 0) {
    return `
      ${htmlHeader("OPEN ESTIMATES")}
      <div class="slide-body">
        <div class="empty-state">
          <div class="big">ALL ESTIMATES PRICED</div>
          <div class="small">NOTHING MISSING A PRICE IN THE LAST 3 WEEKS</div>
        </div>
      </div>
    `;
  }

  const sorted = [...est.list].sort((a, b) => b.ageDays - a.ageDays);
  const rows = sorted.map(e => `
    <tr class="${ageClass(e.ageDays) ? "aged-" + ageClass(e.ageDays) : ""}">
      <td class="age ${ageClass(e.ageDays)}">${e.ageDays}d</td>
      <td class="est-num">${escapeHtml(e.estimateNumber ? `#${e.estimateNumber}` : "")}</td>
      <td class="customer">${escapeHtml(e.customer)}</td>
      <td class="tech">${escapeHtml(e.techName || "")}</td>
      <td class="amount none">${escapeHtml(e.amountDisplay)}</td>
    </tr>
  `).join("");

  const more = est.totalCount > est.list.length ? `<span class="more">SHOWING OLDEST ${est.list.length} OF ${est.totalCount}</span>` : "";
  const aged = est.agedCount > 0 ? `<span class="red">${est.agedCount} OLDER THAN 7 DAYS</span>` : `<span></span>`;

  return `
    ${htmlHeader("OPEN ESTIMATES", `<span class="count-pill ${est.agedCount > 0 ? "red" : ""}">${est.totalCount}</span><span class="sub">NEED PRICING</span>`)}
    <div class="slide-body">
      <div class="list-wrap">
        <table class="list-table">
          <colgroup><col style="width:9%"><col style="width:13%"><col><col style="width:16%"><col style="width:17%"></colgroup>
          <thead><tr><th class="r">AGE</th><th>EST #</th><th>CUSTOMER</th><th>TECH</th><th class="r">PRICE</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="list-footer">${aged}${more}</div>
      </div>
    </div>
  `;
}

function buildInvoicesSlide(data) {
  const inv = data.pastDueInvoices;
  if (inv.list.length === 0) {
    return `
      ${htmlHeader("PAST DUE")}
      <div class="slide-body">
        <div class="empty-state">
          <div class="big">NOTHING PAST DUE</div>
          <div class="small">EVERY COMPLETED JOB IN THE LAST 3 WEEKS IS PAID</div>
        </div>
      </div>
    `;
  }

  const rows = inv.list.map(i => {
    const cls = ageClass(i.ageDays, 14, 21);
    return `
      <tr class="${cls ? "aged-" + cls : ""}">
        <td class="age ${cls}">${i.ageDays}d</td>
        <td class="customer">${escapeHtml(i.customer)}</td>
        <td class="amount">${escapeHtml(i.amountDisplay)}</td>
      </tr>
    `;
  }).join("");

  const more = inv.totalCount > inv.list.length ? `<span class="more">SHOWING OLDEST ${inv.list.length} OF ${inv.totalCount}</span>` : "<span></span>";

  return `
    ${htmlHeader("PAST DUE", `<span class="count-pill">${inv.totalCount}</span><span class="sub">UNPAID INVOICES</span>`)}
    <div class="slide-body">
      <div class="list-wrap">
        <table class="list-table">
          <colgroup><col style="width:9%"><col><col style="width:20%"></colgroup>
          <thead><tr><th class="r">AGE</th><th>CUSTOMER</th><th class="r">BALANCE</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="list-footer"><span>TOTAL OUTSTANDING: ${escapeHtml(inv.totalValue)}</span>${more}</div>
      </div>
    </div>
  `;
}

// ---------- Slideshow JS ----------

function buildSlideshowJS(timings) {
  return `
    const TIMINGS = ${JSON.stringify(timings)};
    const slides = document.querySelectorAll('.slide');
    let currentIndex = 0;
    let currentTimer = null;
    const progressBar = document.querySelector('.progress .bar');

    function showSlide(idx) {
      slides.forEach((s, i) => s.classList.toggle('active', i === idx));
      const seconds = TIMINGS[idx];
      progressBar.style.transition = 'none';
      progressBar.style.width = '0%';
      progressBar.offsetWidth;
      progressBar.style.transition = 'width ' + seconds + 's linear';
      progressBar.style.width = '100%';

      clearTimeout(currentTimer);
      currentTimer = setTimeout(() => {
        const next = (currentIndex + 1) % slides.length;
        if (next === 0 && Date.now() - LOADED_AT > REFRESH_MS) { hardReload(); return; }
        currentIndex = next;
        showSlide(currentIndex);
      }, seconds * 1000);
    }

    // TV browsers (Amazon Silk etc.) cache HTML aggressively, so reload by
    // navigating to a unique URL rather than location.reload().
    const LOADED_AT = Date.now();
    const REFRESH_MS = ${REFRESH_MS};
    function hardReload() {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('_t', Date.now());
        window.location.replace(url.toString());
      } catch (e) {
        const sep = window.location.href.indexOf('?') === -1 ? '?' : '&';
        window.location.replace(window.location.href.split('?')[0] + sep + '_t=' + Date.now());
      }
    }
    // Safety net: even if a timer stalls, never show data older than 20 min.
    setTimeout(hardReload, 20 * 60 * 1000);

    // Live clock in every header
    function tickClock() {
      const now = new Date();
      const date = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' }).format(now);
      const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(now);
      document.querySelectorAll('.js-date').forEach(el => el.textContent = date.toUpperCase());
      document.querySelectorAll('.js-clock').forEach(el => el.textContent = time);
    }
    tickClock();
    setInterval(tickClock, 15000);

    document.addEventListener('click', () => {
      currentIndex = (currentIndex + 1) % slides.length;
      showSlide(currentIndex);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        currentIndex = (currentIndex + 1) % slides.length;
        showSlide(currentIndex);
      } else if (e.key === 'ArrowLeft') {
        currentIndex = (currentIndex - 1 + slides.length) % slides.length;
        showSlide(currentIndex);
      }
    });

    showSlide(0);
  `;
}

// ---------- Main entry point ----------

export function renderOfficeToday(data) {
  const generatedAt = new Date(data.generatedAt);

  const plan = [
    { key: "crew",      label: "CREW STATUS",    build: buildCrewSlide },
    { key: "events",    label: "TODAY'S EVENTS", build: buildEventsSlide },
    { key: "estimates", label: "OPEN ESTIMATES", build: buildEstimatesSlide },
    { key: "invoices",  label: "PAST DUE",       build: buildInvoicesSlide },
  ];
  const total = plan.length;
  const hotStrip = renderHotStrip(data.hotList);
  const hasHot = hotStrip ? "has-hot" : "";

  const slidesHTML = plan.map((item, i) => {
    const label = `${item.label}  /  ${String(i + 1).padStart(2, "0")}  OF  ${String(total).padStart(2, "0")}`;
    return `<div class="slide ${hasHot}" data-key="${item.key}">
      ${item.build(data)}
      ${hotStrip}
      ${htmlFooter(label, generatedAt)}
    </div>`;
  }).join("\n");

  const timings = plan.map(p => SLIDE_TIMINGS[p.key] || 15);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>Golden Rule — Office Display — ${escapeHtml(fmtFullDate(generatedAt))}</title>
  <style>${buildCSS()}</style>
</head>
<body>
  <div class="progress"><div class="bar"></div></div>
  <div class="stage">
    <div class="deck">
${slidesHTML}
    </div>
  </div>
  <script>
${buildSlideshowJS(timings)}
  </script>
</body>
</html>`;
}

export { SLIDE_TIMINGS };
