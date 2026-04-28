// Renders the weekly Golden Rule shop briefing as a standalone HTML file.
// Designed to be opened on a tablet in kiosk mode. Auto-advances each slide,
// loops continuously, and reloads itself daily to pick up fresh data.

import fs from "fs";
import path from "path";

// ---------- Brand palette ----------
const COLORS = {
  NAVY_DARK:   "#0F1E3A",
  NAVY:        "#1B3358",
  STEEL:       "#2C4A6B",
  STEEL_LIGHT: "#E8EEF5",
  WHITE:       "#FFFFFF",
  YELLOW:      "#FFD000",
  RED_ALERT:   "#D32F2F",
  GREEN_OK:    "#2E7D32",
  GRAY_TEXT:   "#4A5A70",
  GRAY_MUTED:  "#7A8599",
  GRAY_LINE:   "#D1D8E2",
};

// ---------- Per-slide auto-advance timings (seconds) ----------
const SLIDE_TIMINGS = {
  cover:        8,
  oncall:       12,
  events:       15,
  newitems:     15,
  moveditems:   15,
  jobboard:     20,
  tagdurations: 20,
  hygiene:      25,
  safety:       18,
  shoutout:     12,
  kpis:         20,
};

// ---------- Logo as base64 (inlined) ----------
let logoDataUri = null;
try {
  const logoPath = path.resolve("assets/logo.png");
  const buf = fs.readFileSync(logoPath);
  logoDataUri = "data:image/png;base64," + buf.toString("base64");
} catch (e) {
  console.warn("[render-html] Could not load assets/logo.png — Error:", e.message);
}

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

function formatPhone(raw) {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

function fmtEventDate(isoOrDateStr) {
  if (!isoOrDateStr) return { day: "", date: "" };
  const isoDay = isoOrDateStr.slice(0, 10);
  const [y, m, d] = isoDay.split("-").map(Number);
  const local = new Date(y, m - 1, d);
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(local).toUpperCase();
  const date = String(d);
  return { day, date };
}

function eventTagColor(category) {
  const map = {
    MEETING:   COLORS.NAVY,
    OPS:       COLORS.STEEL,
    REQUIRED:  COLORS.RED_ALERT,
    COMMUNITY: COLORS.GREEN_OK,
  };
  return map[(category || "").toUpperCase()] || COLORS.NAVY;
}

// ---------- CSS ----------
function buildCSS() {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: ${COLORS.NAVY_DARK};
      font-family: 'Arial', 'Helvetica', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    body { user-select: none; -webkit-user-select: none; }

    .stage {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
    }
    .deck {
      position: relative;
      width: 100vw;
      height: 56.25vw;
      max-height: 100vh;
      max-width: 177.78vh;
      background: ${COLORS.STEEL_LIGHT};
      overflow: hidden;
    }

    .slide {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      transition: opacity 0.5s ease-in-out;
      pointer-events: none;
    }
    .slide.active { opacity: 1; pointer-events: auto; z-index: 2; }

    /* Header bar */
    .header-bar {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 11.3%;
      background: ${COLORS.NAVY_DARK};
      display: flex;
      align-items: center;
      padding: 0 3% 0 1.5%;
      z-index: 5;
    }
    .header-bar::before {
      content: "";
      position: absolute;
      top: 0; left: 0; bottom: 0;
      width: 1.35%;
      background: ${COLORS.YELLOW};
    }
    .header-bar .title {
      font-family: 'Arial Black', 'Arial', sans-serif;
      font-size: 2.6vw;
      font-weight: 900;
      color: ${COLORS.WHITE};
      letter-spacing: 0.04em;
      flex: 1;
      padding-left: 1.5%;
    }
    .header-bar .brand {
      font-size: 1vw;
      letter-spacing: 0.1em;
      text-align: right;
      flex-shrink: 0;
    }
    .header-bar .brand .gr { color: ${COLORS.YELLOW}; font-weight: bold; }
    .header-bar .brand .pc { color: ${COLORS.WHITE}; }

    /* Footer bar */
    .footer-bar {
      position: absolute;
      left: 0; right: 0; bottom: 0;
      height: 4.7%;
      background: ${COLORS.NAVY_DARK};
      display: flex;
      align-items: center;
      padding: 0 3%;
      z-index: 5;
    }
    .footer-bar .left {
      flex: 1;
      color: ${COLORS.WHITE};
      font-size: 0.9vw;
      font-weight: bold;
      letter-spacing: 0.1em;
    }
    .footer-bar .right {
      color: ${COLORS.YELLOW};
      font-size: 0.9vw;
      font-weight: bold;
      letter-spacing: 0.1em;
    }

    /* Cover slide */
    .cover {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      background: ${COLORS.NAVY_DARK};
      overflow: hidden;
    }
    .cover .top-stripe {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1.6%;
      background: ${COLORS.YELLOW};
      z-index: 2;
    }
    .cover .bottom-bar {
      position: absolute;
      left: 0; right: 0; bottom: 0;
      height: 14.7%;
      background: ${COLORS.YELLOW};
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Arial Black', sans-serif;
      font-size: 2.5vw;
      font-weight: 900;
      color: ${COLORS.NAVY_DARK};
      letter-spacing: 0.04em;
      z-index: 2;
    }
    .cover .corp-tag {
      position: absolute;
      top: 12%; left: 4.5%;
      color: ${COLORS.STEEL_LIGHT};
      font-size: 1.4vw;
      font-weight: bold;
      letter-spacing: 0.16em;
      z-index: 3;
    }
    .cover .logo {
      position: absolute;
      top: 24%; left: 4.5%;
      width: 27%;
      height: 28.4%;
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      z-index: 3;
    }
    .cover .headline {
      position: absolute;
      top: 17.3%; left: 33.75%;
      width: 62.25%;
      font-family: 'Arial Black', sans-serif;
      font-size: 8vw;
      font-weight: 900;
      letter-spacing: 0.04em;
      line-height: 1.0;
      z-index: 3;
    }
    .cover .headline .shop { color: ${COLORS.WHITE}; }
    .cover .headline .briefing { color: ${COLORS.YELLOW}; margin-top: 0.6%; }
    .cover .week-of {
      position: absolute;
      top: 49.3%; left: 33.75%;
      color: ${COLORS.STEEL_LIGHT};
      font-size: 2vw;
      font-weight: bold;
      letter-spacing: 0.12em;
      z-index: 3;
    }
    .cover .city {
      position: absolute;
      top: 58.6%; left: 33.75%;
      color: ${COLORS.GRAY_MUTED};
      font-size: 1.3vw;
      font-weight: bold;
      letter-spacing: 0.12em;
      z-index: 3;
    }

    .slide-body {
      position: absolute;
      top: 11.3%; left: 0; right: 0; bottom: 4.7%;
    }

    /* On Call — split into THIS WEEK / NEXT WEEK */
    .oncall .card {
      position: absolute;
      top: 1.2%;
      width: 45%;
      height: 87%;
      padding: 3%;
      overflow: hidden;
    }
    .oncall .card.this-week {
      left: 3.75%;
      background: ${COLORS.NAVY_DARK};
    }
    .oncall .card.next-week {
      right: 3.75%;
      background: ${COLORS.WHITE};
      border: 1px solid ${COLORS.GRAY_LINE};
    }
    .oncall .card .top-stripe {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3%;
    }
    .oncall .card.this-week .top-stripe { background: ${COLORS.YELLOW}; }
    .oncall .card.next-week .top-stripe { background: ${COLORS.NAVY_DARK}; }
    .oncall .card.this-week::before {
      content: "";
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 2.3%;
      background: ${COLORS.YELLOW};
    }
    .oncall .week-label {
      font-size: 1.2vw;
      font-weight: bold;
      letter-spacing: 0.16em;
      margin-bottom: 2%;
      margin-top: 1.5%;
    }
    .oncall .card.this-week .week-label { color: ${COLORS.YELLOW}; }
    .oncall .card.next-week .week-label { color: ${COLORS.NAVY}; }

    .oncall .role-label {
      font-size: 0.9vw;
      font-weight: bold;
      letter-spacing: 0.16em;
      margin-bottom: 0.5%;
    }
    .oncall .card.this-week .role-label { color: ${COLORS.STEEL_LIGHT}; }
    .oncall .card.next-week .role-label { color: ${COLORS.GRAY_TEXT}; }

    .oncall .name {
      font-family: 'Arial Black', sans-serif;
      font-size: 3vw;
      font-weight: 900;
      line-height: 1.05;
      margin-bottom: 4%;
    }
    .oncall .card.this-week .name { color: ${COLORS.WHITE}; }
    .oncall .card.next-week .name { color: ${COLORS.NAVY_DARK}; }

    .oncall .contact-row {
      font-size: 1.2vw;
      font-weight: bold;
      margin-bottom: 0.8%;
    }
    .oncall .email-row {
      font-size: 1vw;
      margin-bottom: 4%;
    }
    .oncall .card.this-week .contact-row,
    .oncall .card.this-week .email-row { color: ${COLORS.WHITE}; }
    .oncall .card.next-week .contact-row,
    .oncall .card.next-week .email-row { color: ${COLORS.NAVY_DARK}; }

    .oncall .divider {
      margin: 2% 0;
    }
    .oncall .card.this-week .divider { border-top: 1px solid ${COLORS.STEEL}; }
    .oncall .card.next-week .divider { border-top: 1px solid ${COLORS.GRAY_LINE}; }

    .oncall .field-label {
      font-size: 0.85vw;
      font-weight: bold;
      letter-spacing: 0.16em;
      margin-bottom: 0.4%;
      margin-top: 2.5%;
    }
    .oncall .card.this-week .field-label { color: ${COLORS.YELLOW}; }
    .oncall .card.next-week .field-label { color: ${COLORS.NAVY}; }

    .oncall .field-value {
      font-family: 'Arial Black', sans-serif;
      font-size: 1.8vw;
      font-weight: 900;
    }
    .oncall .card.this-week .field-value { color: ${COLORS.WHITE}; }
    .oncall .card.next-week .field-value { color: ${COLORS.NAVY_DARK}; }

    .oncall .placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 70%;
      text-align: center;
    }
    .oncall .placeholder-text {
      font-family: 'Arial Black', sans-serif;
      font-size: 2.2vw;
      font-weight: 900;
      letter-spacing: 0.06em;
      margin-bottom: 1%;
    }
    .oncall .card.this-week .placeholder-text { color: ${COLORS.STEEL_LIGHT}; }
    .oncall .card.next-week .placeholder-text { color: ${COLORS.GRAY_MUTED}; }
    .oncall .placeholder-sub {
      font-size: 1vw;
      font-style: italic;
    }
    .oncall .card.this-week .placeholder-sub { color: ${COLORS.STEEL_LIGHT}; }
    .oncall .card.next-week .placeholder-sub { color: ${COLORS.GRAY_MUTED}; }

    /* Events grid */
    .events-grid {
      position: absolute;
      top: 1.5%; left: 3.75%; right: 3.75%; bottom: 1.5%;
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 1.5%;
    }
    .event-card {
      background: ${COLORS.WHITE};
      border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: flex;
      overflow: hidden;
    }
    .event-card .date-block {
      width: 24%;
      background: ${COLORS.NAVY_DARK};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding: 6%;
    }
    .event-card .date-block .day {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.YELLOW};
      font-size: 1.8vw;
      font-weight: 900;
      letter-spacing: 0.12em;
    }
    .event-card .date-block .date {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.WHITE};
      font-size: 4vw;
      font-weight: 900;
      line-height: 1;
    }
    .event-card .info {
      flex: 1;
      padding: 3% 4%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .event-card .tag {
      align-self: flex-start;
      padding: 0.4% 1.4%;
      color: ${COLORS.WHITE};
      font-size: 0.75vw;
      font-weight: bold;
      letter-spacing: 0.12em;
    }
    .event-card .title {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 1.35vw;
      font-weight: 900;
      line-height: 1.2;
      margin: 4% 0;
    }
    .event-card .time {
      color: ${COLORS.GRAY_TEXT};
      font-size: 1vw;
      font-weight: bold;
    }

    /* Items slides */
    .subhead {
      position: absolute;
      top: 1.5%; left: 3.75%;
      color: ${COLORS.GRAY_MUTED};
      font-size: 1vw;
      font-weight: bold;
      letter-spacing: 0.12em;
    }
    .new-items-grid {
      position: absolute;
      top: 7%; left: 3.75%; right: 3.75%; bottom: 1.5%;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1.65%;
    }
    .new-item-card {
      background: ${COLORS.WHITE};
      border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .new-item-card .photo-area {
      height: 38%;
      background: ${COLORS.YELLOW};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .new-item-card .photo-area::after {
      content: "[ PHOTO ]";
      color: ${COLORS.NAVY_DARK};
      font-size: 0.8vw;
      font-weight: bold;
      letter-spacing: 0.18em;
      margin-top: 5%;
    }
    .new-item-card .new-badge {
      position: absolute;
      top: 4%; right: 4%;
      background: ${COLORS.NAVY_DARK};
      color: ${COLORS.YELLOW};
      font-family: 'Arial Black', sans-serif;
      font-size: 0.85vw;
      font-weight: 900;
      letter-spacing: 0.18em;
      padding: 0.5% 1.5%;
    }
    .new-item-card .body {
      padding: 4%;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .new-item-card .name {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 1.2vw;
      font-weight: 900;
      margin-bottom: 0.8%;
    }
    .new-item-card .category {
      color: ${COLORS.GRAY_MUTED};
      font-size: 0.8vw;
      font-weight: bold;
      letter-spacing: 0.12em;
      margin-bottom: 4%;
      padding-bottom: 4%;
      border-bottom: 1px solid ${COLORS.GRAY_LINE};
    }
    .new-item-card .location-label {
      color: ${COLORS.GRAY_MUTED};
      font-size: 0.75vw;
      font-weight: bold;
      letter-spacing: 0.14em;
      margin-bottom: 0.4%;
    }
    .new-item-card .location {
      color: ${COLORS.NAVY_DARK};
      font-size: 1vw;
      font-weight: bold;
      margin-bottom: 4%;
    }
    .new-item-card .notes {
      color: ${COLORS.GRAY_TEXT};
      font-size: 0.85vw;
      line-height: 1.4;
      flex: 1;
    }

    /* Moved items list */
    .moved-list {
      position: absolute;
      top: 7%; left: 3.75%; right: 3.75%; bottom: 9%;
      display: flex;
      flex-direction: column;
      gap: 1.8%;
    }
    .moved-row {
      flex: 1;
      background: ${COLORS.WHITE};
      border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
      position: relative;
      display: flex;
      align-items: center;
      padding: 0 2.5%;
      gap: 2%;
    }
    .moved-row::before {
      content: "";
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 1.1%;
      background: ${COLORS.YELLOW};
    }
    .moved-row .name {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 1.4vw;
      font-weight: 900;
      width: 25%;
    }
    .moved-row .old-block, .moved-row .new-block {
      padding: 1.5% 2%;
      flex: 1;
    }
    .moved-row .old-block {
      background: ${COLORS.STEEL_LIGHT};
      border: 1px solid ${COLORS.GRAY_LINE};
    }
    .moved-row .arrow {
      color: ${COLORS.YELLOW};
      font-size: 2.5vw;
      flex-shrink: 0;
    }
    .moved-row .new-block {
      background: ${COLORS.NAVY_DARK};
    }
    .moved-row .block-label {
      font-size: 0.7vw;
      font-weight: bold;
      letter-spacing: 0.14em;
      margin-bottom: 0.3%;
    }
    .moved-row .old-block .block-label { color: ${COLORS.GRAY_MUTED}; }
    .moved-row .new-block .block-label { color: ${COLORS.YELLOW}; }
    .moved-row .block-value {
      font-size: 1.1vw;
      font-weight: bold;
    }
    .moved-row .old-block .block-value { color: ${COLORS.GRAY_TEXT}; }
    .moved-row .new-block .block-value { color: ${COLORS.WHITE}; }
    .moved-banner {
      position: absolute;
      left: 3.75%; right: 3.75%; bottom: 1%;
      height: 6%;
      background: ${COLORS.YELLOW};
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 1vw;
      font-weight: 900;
      letter-spacing: 0.16em;
    }

    /* Job Board — stretched rows + totals strip */
    .jobboard-left {
      position: absolute;
      top: 1%; left: 3.75%; bottom: 1%;
      width: 62%;
      background: ${COLORS.WHITE};
      border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      padding: 2.5%;
      display: flex;
      flex-direction: column;
    }
    .jobboard-left .header {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 1.4vw;
      font-weight: 900;
      letter-spacing: 0.1em;
      padding-bottom: 1.5%;
      border-bottom: 3px solid ${COLORS.YELLOW};
      flex-shrink: 0;
    }
    .jobboard-rows {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding-top: 1%;
    }
    .job-row {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 2%;
      padding: 0 1%;
      min-height: 0;
    }
    .job-row.alt {
      background: ${COLORS.STEEL_LIGHT};
    }
    .job-row .day-pill {
      width: 8%;
      background: ${COLORS.NAVY_DARK};
      color: ${COLORS.YELLOW};
      font-family: 'Arial Black', sans-serif;
      font-size: 1.1vw;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-align: center;
      padding: 1.5% 0;
      flex-shrink: 0;
    }
    .job-row .desc {
      flex: 1;
      min-width: 0;
    }
    .job-row .desc .label {
      color: ${COLORS.GRAY_MUTED};
      font-size: 0.85vw;
      font-weight: bold;
      letter-spacing: 0.08em;
      margin-bottom: 0.3%;
    }
    .job-row .desc .text {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 1.2vw;
      font-weight: 900;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .job-row .tech {
      width: 14%;
      color: ${COLORS.GRAY_TEXT};
      font-size: 1vw;
      font-weight: bold;
      text-align: center;
    }
    .job-row .duration {
      width: 12%;
      color: ${COLORS.NAVY_DARK};
      font-size: 1.1vw;
      font-weight: bold;
      text-align: right;
    }
    .jobboard-totals {
      flex-shrink: 0;
      background: ${COLORS.NAVY_DARK};
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      padding: 1.5% 0;
      margin-top: 1.5%;
    }
    .jobboard-totals .cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-right: 1px solid ${COLORS.STEEL};
      padding: 0.5% 0;
    }
    .jobboard-totals .cell:last-child {
      border-right: none;
    }
    .jobboard-totals .cell .label {
      color: ${COLORS.YELLOW};
      font-size: 0.85vw;
      font-weight: bold;
      letter-spacing: 0.16em;
      margin-bottom: 0.6%;
    }
    .jobboard-totals .cell .value {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.WHITE};
      font-size: 2vw;
      font-weight: 900;
    }

    .jobboard-right {
      position: absolute;
      top: 1%; right: 3.75%; bottom: 1%;
      width: 28.7%;
      display: flex;
      flex-direction: column;
      gap: 2%;
    }
    .stat-card {
      flex: 1;
      background: ${COLORS.WHITE};
      border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
      padding: 4%;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .stat-card::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 6%;
    }
    .stat-card.yellow::before { background: ${COLORS.YELLOW}; }
    .stat-card.navy::before { background: ${COLORS.NAVY_DARK}; }
    .stat-card.red::before { background: ${COLORS.RED_ALERT}; }
    .stat-card .label {
      color: ${COLORS.GRAY_MUTED};
      font-size: 0.85vw;
      font-weight: bold;
      letter-spacing: 0.16em;
      margin-bottom: 4%;
    }
    .stat-card .value {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 4.5vw;
      font-weight: 900;
      line-height: 1;
    }

    /* Tag Durations */
    .tag-grid {
      position: absolute;
      top: 7%; left: 3.75%; right: 3.75%; bottom: 9%;
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: repeat(4, 1fr);
      gap: 1.2%;
    }
    .tag-card {
      background: ${COLORS.WHITE};
      border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
      padding: 1.2% 2%;
      position: relative;
      display: flex;
      align-items: center;
      gap: 4%;
    }
    .tag-card::before {
      content: "";
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 1.1%;
      background: ${COLORS.YELLOW};
    }
    .tag-card .tag-name {
      flex: 1;
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 1.4vw;
      font-weight: 900;
      letter-spacing: 0.04em;
      padding-left: 2%;
    }
    .tag-card .median {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 1.8vw;
      font-weight: 900;
      text-align: right;
    }
    .tag-card .sample {
      color: ${COLORS.GRAY_MUTED};
      font-size: 0.75vw;
      font-weight: bold;
      letter-spacing: 0.08em;
      text-align: right;
      margin-top: 0.2%;
    }
    .tag-card .right-block {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .footer-banner {
      position: absolute;
      left: 3.75%; right: 3.75%; bottom: 1%;
      height: 6%;
      background: ${COLORS.NAVY_DARK};
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${COLORS.YELLOW};
      font-family: 'Arial Black', sans-serif;
      font-size: 1vw;
      font-weight: 900;
      letter-spacing: 0.16em;
    }

    /* Time Tracking */
    .tt-table {
      position: absolute;
      top: 6%; left: 3.75%; right: 3.75%; bottom: 9%;
      display: flex;
      flex-direction: column;
    }
    .tt-row {
      display: grid;
      grid-template-columns: 18% 33% 33% 8% 8%;
      align-items: stretch;
    }
    .tt-row.head {
      height: 5%;
      flex-shrink: 0;
    }
    .tt-row.head .tt-cell {
      background: ${COLORS.NAVY_DARK};
      color: ${COLORS.YELLOW};
      font-family: 'Arial Black', sans-serif;
      font-size: 0.9vw;
      font-weight: 900;
      letter-spacing: 0.14em;
      display: flex;
      align-items: center;
      padding: 0 1.5%;
    }
    .tt-row.head .tt-cell.center {
      justify-content: center;
    }
    .tt-row.head .tt-cell.banner-30 { background: ${COLORS.NAVY}; }
    .tt-row.head .tt-cell.banner-7 { background: ${COLORS.STEEL}; }
    .tt-row.subhead {
      height: 3.5%;
      flex-shrink: 0;
      background: ${COLORS.STEEL_LIGHT};
      font-size: 0.75vw;
      color: ${COLORS.GRAY_TEXT};
      font-weight: bold;
      letter-spacing: 0.14em;
      border-top: 1px solid ${COLORS.GRAY_LINE};
      border-bottom: 1px solid ${COLORS.GRAY_LINE};
    }
    .tt-row.subhead > div {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
    }
    .tt-row.subhead .tt-subblock {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      align-items: stretch;
      height: 100%;
    }
    .tt-row.subhead .tt-subcell {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tt-row.body {
      flex: 1;
      min-height: 0;
      font-size: 0.95vw;
    }
    .tt-row.body.alt { background: ${COLORS.STEEL_LIGHT}; }
    .tt-row.body:not(.alt) { background: ${COLORS.WHITE}; }
    .tt-row.body .tt-name {
      display: flex;
      align-items: center;
      padding: 0 1.5%;
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-weight: 900;
      border-left: 1px solid ${COLORS.GRAY_LINE};
      border-right: 1px solid ${COLORS.GRAY_LINE};
    }
    .tt-row.body .tt-jobs {
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${COLORS.GRAY_TEXT};
      font-weight: bold;
      border-right: 1px solid ${COLORS.GRAY_LINE};
    }
    .tt-row.body .tt-block {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      border-right: 1px solid ${COLORS.GRAY_LINE};
    }
    .tt-row.body:last-child .tt-name,
    .tt-row.body:last-child .tt-jobs,
    .tt-row.body:last-child .tt-block {
      border-bottom: 1px solid ${COLORS.GRAY_LINE};
    }
    .tt-cell.pct {
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Arial Black', sans-serif;
      font-weight: 900;
      margin: 0.15%;
    }
    .pct.green { background: #C8E6C9; color: ${COLORS.NAVY_DARK}; }
    .pct.yellow { background: #FFF9C4; color: ${COLORS.NAVY_DARK}; }
    .pct.red { background: #FFCDD2; color: ${COLORS.RED_ALERT}; }
    .pct.empty { background: ${COLORS.STEEL_LIGHT}; color: ${COLORS.GRAY_MUTED}; }

    .tt-leader {
      position: absolute;
      left: 3.75%; right: 3.75%; bottom: 1%;
      height: 6%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Arial Black', sans-serif;
      font-size: 1vw;
      font-weight: 900;
      letter-spacing: 0.16em;
    }
    .tt-leader.has-leader {
      background: ${COLORS.YELLOW};
      color: ${COLORS.NAVY_DARK};
    }
    .tt-leader.no-leader {
      background: ${COLORS.NAVY_DARK};
      color: ${COLORS.YELLOW};
    }

    /* Safety slide */
    .safety-left {
      position: absolute;
      top: 1%; left: 3.75%; bottom: 1%;
      width: 45%;
      background: ${COLORS.NAVY_DARK};
      padding: 3%;
    }
    .safety-left::before {
      content: "";
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 2.3%;
      background: ${COLORS.YELLOW};
    }
    .safety-tag {
      color: ${COLORS.YELLOW};
      font-size: 0.95vw;
      font-weight: bold;
      letter-spacing: 0.16em;
      margin-bottom: 0.6%;
    }
    .safety-headline {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.WHITE};
      font-size: 1.65vw;
      font-weight: 900;
      margin-bottom: 4%;
      padding-bottom: 4%;
      border-bottom: 1px solid ${COLORS.STEEL};
    }
    .safety-bullets {
      color: ${COLORS.WHITE};
      font-size: 1.1vw;
      line-height: 1.6;
      list-style-type: disc;
      padding-left: 1.2em;
    }
    .safety-bullets li {
      margin-bottom: 1%;
    }
    .safety-banner {
      position: absolute;
      left: 3%; right: 3%; bottom: 3%;
      height: 8%;
      background: ${COLORS.YELLOW};
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 0.85vw;
      font-weight: 900;
      letter-spacing: 0.14em;
      padding: 0 2%;
      text-align: center;
    }
    .safety-right {
      position: absolute;
      top: 1%; right: 3.75%; bottom: 1%;
      width: 45%;
      display: flex;
      flex-direction: column;
      gap: 1.4%;
    }
    .safety-tile {
      flex: 1;
      background: ${COLORS.WHITE};
      border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
      display: flex;
      align-items: center;
      gap: 2%;
      padding-right: 2.5%;
    }
    .safety-tile .accent {
      width: 18%;
      align-self: stretch;
      background: ${COLORS.YELLOW};
    }
    .safety-tile .body {
      flex: 1;
    }
    .safety-tile .label {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 1.2vw;
      font-weight: 900;
      letter-spacing: 0.1em;
      margin-bottom: 1%;
    }
    .safety-tile .text {
      color: ${COLORS.GRAY_TEXT};
      font-size: 0.9vw;
      line-height: 1.4;
    }

    /* Shoutout */
    .shoutout-card {
      position: absolute;
      top: 1%; left: 3.75%; right: 3.75%; bottom: 1%;
      background: ${COLORS.NAVY_DARK};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3%;
    }
    .shoutout-card::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2.3%;
      background: ${COLORS.YELLOW};
    }
    .shoutout-tag {
      color: ${COLORS.YELLOW};
      font-size: 1.1vw;
      font-weight: bold;
      letter-spacing: 0.18em;
      margin-bottom: 2%;
    }
    .shoutout-stars {
      font-size: 3vw;
      letter-spacing: 0.05em;
      color: ${COLORS.YELLOW};
      margin-bottom: 2%;
    }
    .shoutout-name {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.WHITE};
      font-size: 4vw;
      font-weight: 900;
      margin-bottom: 2%;
      text-align: center;
    }
    .shoutout-divider {
      width: 30%;
      border-top: 2px solid ${COLORS.YELLOW};
      margin: 0 auto 2%;
    }
    .shoutout-why {
      color: ${COLORS.YELLOW};
      font-size: 0.9vw;
      font-weight: bold;
      letter-spacing: 0.16em;
      margin-bottom: 1.5%;
    }
    .shoutout-reason {
      color: ${COLORS.WHITE};
      font-style: italic;
      font-size: 1.5vw;
      text-align: center;
      max-width: 75%;
      line-height: 1.4;
    }

    /* KPIs / Goals */
    .kpi-tiles {
      position: absolute;
      top: 1.5%; left: 3.75%; right: 3.75%;
      height: 27%;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      gap: 1.2%;
    }
    .kpi-tile {
      background: ${COLORS.WHITE};
      border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      padding: 2.5% 2%;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
    }
    .kpi-tile::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 8%;
    }
    .kpi-tile.yellow::before { background: ${COLORS.YELLOW}; }
    .kpi-tile.green::before { background: ${COLORS.GREEN_OK}; }
    .kpi-tile.red::before { background: ${COLORS.RED_ALERT}; }
    .kpi-tile.navy::before { background: ${COLORS.NAVY_DARK}; }
    .kpi-tile .label {
      color: ${COLORS.GRAY_MUTED};
      font-size: 0.85vw;
      font-weight: bold;
      letter-spacing: 0.18em;
      margin-top: 4%;
    }
    .kpi-tile .value {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 3.2vw;
      font-weight: 900;
    }
    .kpi-tile .sub {
      color: ${COLORS.GRAY_MUTED};
      font-size: 0.75vw;
      font-weight: bold;
      letter-spacing: 0.14em;
    }
    .chart-card {
      position: absolute;
      top: 30.5%; left: 3.75%; right: 3.75%; bottom: 1.5%;
      background: ${COLORS.WHITE};
      border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      padding: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .chart-card .top-stripe {
      height: 4%;
      background: ${COLORS.YELLOW};
      flex-shrink: 0;
    }
    .chart-card .title {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 1.1vw;
      font-weight: 900;
      letter-spacing: 0.1em;
      padding: 1.5% 2% 1.5% 2%;
      flex-shrink: 0;
    }
    .chart-area {
      flex: 1;
      min-height: 0;
      padding: 0 2% 2% 2%;
      position: relative;
    }
    .chart-area canvas {
      width: 100%;
      height: 100%;
      display: block;
    }

    /* Progress indicator */
    .progress {
      position: fixed;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: rgba(255,208,0,0.2);
      z-index: 100;
    }
    .progress .bar {
      height: 100%;
      background: ${COLORS.YELLOW};
      width: 0;
      transition: width 0.1s linear;
    }
  `;
}

// ---------- Slide HTML builders ----------

function htmlHeader(title) {
  return `
    <div class="header-bar">
      <div class="title">${escapeHtml(title)}</div>
      <div class="brand">
        <span class="gr">GOLDEN RULE</span><span class="pc">  PLUMBING & CONTRACTING</span>
      </div>
    </div>
  `;
}

function htmlFooter(slideLabel) {
  return `
    <div class="footer-bar">
      <div class="left">GOLDENRULEPH.COM  •  1331 POTTSTOWN PIKE, WEST CHESTER PA</div>
      <div class="right">${escapeHtml(slideLabel)}</div>
    </div>
  `;
}

function buildCoverSlideHTML({ weekHumanLabel, onCall }) {
  const dispatcher = onCall?.current?.dispatcher || "[ NOT SET ]";
  const materialRuns = onCall?.current?.materialRuns || "[ NOT SET ]";
  const logoBg = logoDataUri ? `style="background-image: url('${logoDataUri}');"` : "";
  return `
    <div class="cover">
      <div class="top-stripe"></div>
      <div class="corp-tag">GOLDEN RULE PLUMBING & CONTRACTING</div>
      <div class="logo" ${logoBg}></div>
      <div class="headline">
        <div class="shop">SHOP</div>
        <div class="briefing">BRIEFING</div>
      </div>
      <div class="week-of">WEEK OF  ${escapeHtml(weekHumanLabel.toUpperCase())}</div>
      <div class="city">WEST CHESTER, PA</div>
      <div class="bottom-bar">
        DISPATCH:&nbsp;&nbsp;${escapeHtml(dispatcher.toUpperCase())}&nbsp;&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;&nbsp;MATERIAL RUNS:&nbsp;&nbsp;${escapeHtml(materialRuns.toUpperCase())}
      </div>
    </div>
  `;
}

// On Call slide — split into THIS WEEK / NEXT WEEK
function buildOnCallSlideHTML({ onCall }, slideLabel) {
  const renderCardBody = (entry) => {
    if (!entry) {
      return `
        <div class="placeholder">
          <div class="placeholder-text">NOT YET<br>SCHEDULED</div>
          <div class="placeholder-sub">Add to the on_call_rotation sheet</div>
        </div>
      `;
    }
    const phone = formatPhone(entry.primaryMobile) || "(no number on file)";
    const email = entry.primaryEmail || "(no email on file)";
    return `
      <div class="role-label">PRIMARY TECH</div>
      <div class="name">${escapeHtml(entry.primaryName)}</div>
      <div class="contact-row">📞 ${escapeHtml(phone)}</div>
      <div class="email-row">✉ ${escapeHtml(email)}</div>
      <div class="divider"></div>
      <div class="field-label">DISPATCH / OFFICE</div>
      <div class="field-value">${escapeHtml(entry.dispatcher || "—")}</div>
      <div class="field-label">MATERIAL RUNS</div>
      <div class="field-value">${escapeHtml(entry.materialRuns || "—")}</div>
    `;
  };

  return `
    ${htmlHeader("ON CALL")}
    <div class="slide-body oncall">
      <div class="card this-week">
        <div class="top-stripe"></div>
        <div class="week-label">THIS WEEK</div>
        ${renderCardBody(onCall?.current)}
      </div>
      <div class="card next-week">
        <div class="top-stripe"></div>
        <div class="week-label">NEXT WEEK  —  HEADS UP</div>
        ${renderCardBody(onCall?.next)}
      </div>
    </div>
    ${htmlFooter(slideLabel)}
  `;
}

function buildEventsSlideHTML({ events }, slideLabel) {
  const cards = events.slice(0, 4).map(e => {
    const { day, date } = fmtEventDate(e.startISO);
    return {
      day, date,
      title: (e.title || "").toUpperCase(),
      time: e.location || "",
      tag: (e.category || "MEETING").toUpperCase(),
      tagColor: eventTagColor(e.category),
    };
  });
  while (cards.length < 4) {
    cards.push({ day: "—", date: "", title: "(no event)", time: "", tag: "—", tagColor: COLORS.GRAY_MUTED });
  }
  const cardHTML = cards.map(c => `
    <div class="event-card">
      <div class="date-block">
        <div class="day">${escapeHtml(c.day)}</div>
        <div class="date">${escapeHtml(c.date)}</div>
      </div>
      <div class="info">
        <div class="tag" style="background: ${c.tagColor}">${escapeHtml(c.tag)}</div>
        <div class="title">${escapeHtml(c.title)}</div>
        <div class="time">${escapeHtml(c.time)}</div>
      </div>
    </div>
  `).join("");
  return `
    ${htmlHeader("UPCOMING EVENTS & DEADLINES")}
    <div class="slide-body">
      <div class="events-grid">${cardHTML}</div>
    </div>
    ${htmlFooter(slideLabel)}
  `;
}

function buildNewItemsSlideHTML({ newItems }, slideLabel) {
  const cards = [...newItems];
  while (cards.length < 3) cards.push(null);
  const cardHTML = cards.slice(0, 3).map(it => {
    if (!it) {
      return `
        <div class="new-item-card">
          <div class="photo-area"></div>
          <div class="body">
            <div class="name">(no new item)</div>
          </div>
        </div>
      `;
    }
    return `
      <div class="new-item-card">
        <div class="photo-area">
          <div class="new-badge">NEW</div>
        </div>
        <div class="body">
          <div class="name">${escapeHtml(it.name.toUpperCase())}</div>
          <div class="category">${escapeHtml(it.category || "")}</div>
          <div class="location-label">📍 LOCATION</div>
          <div class="location">${escapeHtml(it.location || "—")}</div>
          <div class="notes">${escapeHtml(it.notes || "")}</div>
        </div>
      </div>
    `;
  }).join("");
  return `
    ${htmlHeader("NEW IN THE SHOP")}
    <div class="slide-body">
      <div class="subhead">RECENTLY ADDED — KNOW WHERE TO FIND IT, KNOW HOW TO USE IT</div>
      <div class="new-items-grid">${cardHTML}</div>
    </div>
    ${htmlFooter(slideLabel)}
  `;
}

function buildMovedItemsSlideHTML({ movedItems }, slideLabel) {
  const rows = [...movedItems];
  while (rows.length < 3) rows.push(null);
  const rowHTML = rows.slice(0, 3).map(m => `
    <div class="moved-row">
      <div class="name">${escapeHtml(m ? m.name.toUpperCase() : "(no moved item)")}</div>
      <div class="old-block">
        <div class="block-label">OLD LOCATION</div>
        <div class="block-value">${escapeHtml(m ? m.oldLocation : "—")}</div>
      </div>
      <div class="arrow">→</div>
      <div class="new-block">
        <div class="block-label">NEW LOCATION</div>
        <div class="block-value">${escapeHtml(m ? m.newLocation : "—")}</div>
      </div>
    </div>
  `).join("");
  return `
    ${htmlHeader("MOVED & REARRANGED")}
    <div class="slide-body">
      <div class="subhead">IF YOU CAN'T FIND SOMETHING — CHECK HERE FIRST</div>
      <div class="moved-list">${rowHTML}</div>
      <div class="moved-banner">UPDATE HCP INVENTORY LOCATIONS WHEN ITEMS MOVE</div>
    </div>
    ${htmlFooter(slideLabel)}
  `;
}

function buildJobBoardSlideHTML({ jobBoard }, slideLabel) {
  const days = ["MON", "TUE", "WED", "THU", "FRI"];
  const counts = jobBoard?.counts || { open: 0, inProgress: 0, total: 0 };
  const breakdown = jobBoard?.breakdown || { service: 0, install: 0, estimate: 0, other: 0 };

  const rowHTML = days.map((day, i) => {
    const j = jobBoard?.majors?.[day] || null;
    const altClass = i % 2 === 0 ? "alt" : "";
    return `
      <div class="job-row ${altClass}">
        <div class="day-pill">${day}</div>
        <div class="desc">
          <div class="label">${j ? "TOP JOB" : ""}</div>
          <div class="text">${escapeHtml(j ? j.description.slice(0, 60) : "(no scheduled work)")}</div>
        </div>
        <div class="tech">${escapeHtml(j ? j.techDisplay : "")}</div>
        <div class="duration">${escapeHtml(j ? j.durationLabel : "")}</div>
      </div>
    `;
  }).join("");

  return `
    ${htmlHeader("THIS WEEK'S JOB BOARD")}
    <div class="slide-body">
      <div class="jobboard-left">
        <div class="header">MAJOR JOBS — THIS WEEK</div>
        <div class="jobboard-rows">${rowHTML}</div>
        <div class="jobboard-totals">
          <div class="cell">
            <div class="label">SERVICE</div>
            <div class="value">${breakdown.service}</div>
          </div>
          <div class="cell">
            <div class="label">INSTALLS</div>
            <div class="value">${breakdown.install}</div>
          </div>
          <div class="cell">
            <div class="label">ESTIMATES</div>
            <div class="value">${breakdown.estimate}</div>
          </div>
          <div class="cell">
            <div class="label">OTHER</div>
            <div class="value">${breakdown.other}</div>
          </div>
        </div>
      </div>
      <div class="jobboard-right">
        <div class="stat-card yellow">
          <div class="label">OPEN JOBS</div>
          <div class="value">${counts.open}</div>
        </div>
        <div class="stat-card navy">
          <div class="label">IN PROGRESS</div>
          <div class="value">${counts.inProgress}</div>
        </div>
        <div class="stat-card red">
          <div class="label">TOTAL THIS WK</div>
          <div class="value">${counts.total}</div>
        </div>
      </div>
    </div>
    ${htmlFooter(slideLabel)}
  `;
}

function buildTagDurationsSlideHTML({ tagDurations }, slideLabel) {
  const rows = (tagDurations || []).slice(0, 8);
  while (rows.length < 8) rows.push(null);
  const cardHTML = rows.map(r => {
    if (!r) {
      return `<div class="tag-card"><div class="tag-name" style="color: ${COLORS.GRAY_MUTED};">—</div></div>`;
    }
    return `
      <div class="tag-card">
        <div class="tag-name">${escapeHtml(r.tag.toUpperCase())}</div>
        <div class="right-block">
          <div class="median">${escapeHtml(r.medianLabel)}</div>
          <div class="sample">n = ${r.sampleCount}</div>
        </div>
      </div>
    `;
  }).join("");
  return `
    ${htmlHeader("AVERAGE JOB TIME — BY CATEGORY")}
    <div class="slide-body">
      <div class="subhead">MEDIAN DURATION OF COMPLETED JOBS — LAST 30 DAYS</div>
      <div class="tag-grid">${cardHTML}</div>
      <div class="footer-banner">HITTING START + FINISH IN HCP IS WHAT MAKES THIS DATA POSSIBLE</div>
    </div>
    ${htmlFooter(slideLabel)}
  `;
}

function buildTimeTrackingSlideHTML({ hygiene }, slideLabel) {
  if (!hygiene || !hygiene.last7 || hygiene.last7.length === 0) {
    return `
      ${htmlHeader("TIME TRACKING — HCP BUTTONS")}
      <div class="slide-body">
        <div style="text-align:center; margin-top: 30%; color: ${COLORS.GRAY_MUTED}; font-size: 1.5vw;">
          (no compliance data available)
        </div>
      </div>
      ${htmlFooter(slideLabel)}
    `;
  }

  const techMap = new Map();
  for (const r of hygiene.last30) techMap.set(r.employeeId, { d30: r, d7: null });
  for (const r of hygiene.last7) {
    if (techMap.has(r.employeeId)) {
      techMap.get(r.employeeId).d7 = r;
    } else {
      techMap.set(r.employeeId, { d30: null, d7: r });
    }
  }
  const allRows = [...techMap.values()];
  allRows.sort((a, b) => {
    const aPct = a.d30?.overallPct ?? -1;
    const bPct = b.d30?.overallPct ?? -1;
    return bPct - aPct;
  });

  const pctClass = (pct) => {
    if (pct === null) return "empty";
    if (pct >= 95) return "green";
    if (pct >= 80) return "yellow";
    return "red";
  };
  const fmtPct = (pct) => pct === null ? "—" : `${pct}%`;

  const drawTriple = (stats) => {
    const pcts = stats ? [stats.omwPct, stats.startPct, stats.finishPct] : [null, null, null];
    return pcts.map(p => `<div class="tt-cell pct ${pctClass(p)}">${fmtPct(p)}</div>`).join("");
  };

  const bodyRows = allRows.slice(0, 11).map((row, i) => {
    const altClass = i % 2 ? "alt" : "";
    const displayName = row.d30?.displayName || row.d7?.displayName || "—";
    return `
      <div class="tt-row body ${altClass}">
        <div class="tt-name">${escapeHtml(displayName)}</div>
        <div class="tt-block">${drawTriple(row.d30)}</div>
        <div class="tt-block">${drawTriple(row.d7)}</div>
        <div class="tt-jobs">${row.d30?.totalJobs ?? "—"}</div>
        <div class="tt-jobs"></div>
      </div>
    `;
  }).join("");

  const leader = hygiene.leader;
  const flagged = hygiene.flagged || [];
  let leaderText, leaderClass;
  if (leader) {
    leaderClass = "has-leader";
    leaderText = `★ THIS WEEK'S LEADER:  ${leader.displayName.toUpperCase()}  —  ${leader.overallPct}%  OVERALL`;
    if (flagged.length > 0) {
      leaderText += `     ·     ${flagged.length} TECH${flagged.length > 1 ? "S" : ""} BELOW 80% (30-DAY)`;
    }
  } else {
    leaderClass = "no-leader";
    leaderText = "HIT YOUR BUTTONS — IT'S HOW THIS DATA HAPPENS";
  }

  return `
    ${htmlHeader("TIME TRACKING — HCP BUTTONS")}
    <div class="slide-body">
      <div class="subhead">ON MY WAY  /  START  /  FINISH  —  COMPLIANCE BY TECH</div>
      <div class="tt-table">
        <div class="tt-row head">
          <div class="tt-cell">TECH</div>
          <div class="tt-cell center banner-30">LAST 30 DAYS</div>
          <div class="tt-cell center banner-7">LAST 7 DAYS</div>
          <div class="tt-cell center"># JOBS</div>
          <div class="tt-cell"></div>
        </div>
        <div class="tt-row subhead">
          <div></div>
          <div class="tt-subblock">
            <div class="tt-subcell">OMW</div>
            <div class="tt-subcell">START</div>
            <div class="tt-subcell">FINISH</div>
          </div>
          <div class="tt-subblock">
            <div class="tt-subcell">OMW</div>
            <div class="tt-subcell">START</div>
            <div class="tt-subcell">FINISH</div>
          </div>
          <div></div>
          <div></div>
        </div>
        ${bodyRows}
      </div>
      <div class="tt-leader ${leaderClass}">${escapeHtml(leaderText)}</div>
    </div>
    ${htmlFooter(slideLabel)}
  `;
}

function buildSafetySlideHTML({ safetyTopic }, slideLabel) {
  const bullets = (safetyTopic.bullets || []);
  const bulletHTML = bullets.length > 0
    ? bullets.map(b => `<li>${escapeHtml(b)}</li>`).join("")
    : "<li>(no bullets provided)</li>";
  return `
    ${htmlHeader("SAFETY & SHOP REMINDERS")}
    <div class="slide-body">
      <div class="safety-left">
        <div class="safety-tag">⚠ SAFETY TOPIC OF THE WEEK</div>
        <div class="safety-headline">${escapeHtml((safetyTopic.headline || "").toUpperCase())}</div>
        <ul class="safety-bullets">${bulletHTML}</ul>
        <div class="safety-banner">QUESTIONS?  ASK YOUR LEAD BEFORE YOU START THE JOB</div>
      </div>
      <div class="safety-right">
        <div class="safety-tile">
          <div class="accent"></div>
          <div class="body">
            <div class="label">VAN CHECK</div>
            <div class="text">Walk-around + fluids — every Monday AM</div>
          </div>
        </div>
        <div class="safety-tile">
          <div class="accent"></div>
          <div class="body">
            <div class="label">PPE</div>
            <div class="text">Boots, eyes, gloves, hard hat on every job</div>
          </div>
        </div>
        <div class="safety-tile">
          <div class="accent"></div>
          <div class="body">
            <div class="label">HCP UPDATES</div>
            <div class="text">Close job + notes before leaving the site</div>
          </div>
        </div>
        <div class="safety-tile">
          <div class="accent"></div>
          <div class="body">
            <div class="label">TOOL ACCOUNTABILITY</div>
            <div class="text">Scan in/out of the crib — no exceptions</div>
          </div>
        </div>
      </div>
    </div>
    ${htmlFooter(slideLabel)}
  `;
}

function buildShoutoutSlideHTML({ shoutout }, slideLabel) {
  const stars = "★ ★ ★ ★ ★";
  return `
    ${htmlHeader("SHOUTOUTS")}
    <div class="slide-body">
      <div class="shoutout-card">
        <div class="shoutout-tag">TECH OF THE WEEK</div>
        <div class="shoutout-stars">${stars}</div>
        <div class="shoutout-name">${escapeHtml(shoutout.techName.toUpperCase())}</div>
        <div class="shoutout-divider"></div>
        <div class="shoutout-why">WHY THEY'RE GETTING RECOGNIZED</div>
        <div class="shoutout-reason">${escapeHtml(shoutout.reason || "")}</div>
      </div>
    </div>
    ${htmlFooter(slideLabel)}
  `;
}

function buildKPIsSlideHTML({ kpis }, slideLabel) {
  const tiles = [
    { label: "JOBS CLOSED",  value: String(kpis?.jobsClosed ?? 0),     sub: "LAST WEEK", cls: "yellow" },
    { label: "REVENUE",      value: kpis?.revenueDisplay ?? "$0",      sub: "LAST WEEK", cls: "green" },
    { label: "CALLBACKS",    value: String(kpis?.callbackCount ?? 0),  sub: "LAST WEEK", cls: "red" },
    { label: "UNCOLLECTED",  value: kpis?.uncollected?.display ?? "$0",
      sub: `${kpis?.uncollected?.count ?? 0} JOBS`, cls: "navy" },
  ];
  const tilesHTML = tiles.map(t => `
    <div class="kpi-tile ${t.cls}">
      <div class="label">${escapeHtml(t.label)}</div>
      <div class="value">${escapeHtml(t.value)}</div>
      <div class="sub">${escapeHtml(t.sub)}</div>
    </div>
  `).join("");

  const byTech = kpis?.byTech || [];
  const chartData = JSON.stringify({
    labels: byTech.map(r => r.name),
    values: byTech.map(r => r.count),
  });

  return `
    ${htmlHeader("WEEKLY GOALS & NUMBERS")}
    <div class="slide-body">
      <div class="kpi-tiles">${tilesHTML}</div>
      <div class="chart-card">
        <div class="top-stripe"></div>
        <div class="title">JOBS COMPLETED BY TECHNICIAN  —  LAST WEEK</div>
        <div class="chart-area">
          <canvas data-chart='${chartData}'></canvas>
        </div>
      </div>
    </div>
    ${htmlFooter(slideLabel)}
  `;
}

// ---------- Slideshow JS ----------
function buildSlideshowJS(slidePlan, slideTimings) {
  const timings = slidePlan.map(p => slideTimings[p.key] || 15);
  return `
    const TIMINGS = ${JSON.stringify(timings)};
    const slides = document.querySelectorAll('.slide');
    let currentIndex = 0;
    let currentTimer = null;
    const progressBar = document.querySelector('.progress .bar');

    function showSlide(idx) {
      slides.forEach((s, i) => s.classList.toggle('active', i === idx));

      const slide = slides[idx];
      const canvas = slide.querySelector('canvas[data-chart]');
      if (canvas) {
        requestAnimationFrame(() => renderBarChart(canvas));
      }

      const seconds = TIMINGS[idx];
      progressBar.style.transition = 'none';
      progressBar.style.width = '0%';
      progressBar.offsetWidth;
      progressBar.style.transition = 'width ' + seconds + 's linear';
      progressBar.style.width = '100%';

      clearTimeout(currentTimer);
      currentTimer = setTimeout(() => {
        currentIndex = (currentIndex + 1) % slides.length;
        showSlide(currentIndex);
      }, seconds * 1000);
    }

    setTimeout(() => location.reload(), 12 * 60 * 60 * 1000);

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

    window.addEventListener('resize', () => {
      const activeCanvas = document.querySelector('.slide.active canvas[data-chart]');
      if (activeCanvas) renderBarChart(activeCanvas);
    });

    function renderBarChart(canvas) {
      const data = JSON.parse(canvas.dataset.chart);
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const W = rect.width, H = rect.height;
      const padL = 40, padR = 12, padT = 14, padB = 36;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;

      const values = data.values;
      const labels = data.labels;
      if (values.length === 0) return;
      const maxVal = Math.max(...values, 1);
      const yMax = Math.max(5, Math.ceil(maxVal / 5) * 5);

      ctx.strokeStyle = '${COLORS.GRAY_LINE}';
      ctx.fillStyle = '${COLORS.GRAY_TEXT}';
      ctx.lineWidth = 1;
      ctx.font = '11px Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const gridSteps = 5;
      for (let i = 0; i <= gridSteps; i++) {
        const v = Math.round((yMax / gridSteps) * i);
        const y = padT + plotH - (v / yMax) * plotH;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(W - padR, y);
        ctx.stroke();
        ctx.fillText(String(v), padL - 8, y);
      }

      const slot = plotW / values.length;
      const barW = slot * 0.7;
      const barOffset = slot * 0.15;
      ctx.fillStyle = '${COLORS.NAVY_DARK}';
      for (let i = 0; i < values.length; i++) {
        const x = padL + i * slot + barOffset;
        const h = (values[i] / yMax) * plotH;
        const y = padT + plotH - h;
        ctx.fillRect(x, y, barW, h);

        if (h > 22) {
          ctx.fillStyle = '${COLORS.WHITE}';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.font = 'bold 12px Arial';
          ctx.fillText(String(values[i]), x + barW / 2, y + 5);
          ctx.fillStyle = '${COLORS.NAVY_DARK}';
        } else {
          ctx.fillStyle = '${COLORS.NAVY_DARK}';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.font = 'bold 12px Arial';
          ctx.fillText(String(values[i]), x + barW / 2, y - 4);
        }
      }

      ctx.fillStyle = '${COLORS.GRAY_TEXT}';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let i = 0; i < labels.length; i++) {
        const x = padL + i * slot + slot / 2;
        ctx.fillText(labels[i], x, padT + plotH + 8);
      }
    }

    showSlide(0);
  `;
}

// ---------- Main entry point ----------

export async function renderHTML(data, outputPath) {
  const plan = [];
  plan.push({ key: "cover",        label: "COVER" });
  plan.push({ key: "oncall",       label: "ON CALL" });
  plan.push({ key: "events",       label: "EVENTS" });
  plan.push({ key: "newitems",     label: "NEW ITEMS" });
  plan.push({ key: "moveditems",   label: "MOVED" });
  plan.push({ key: "jobboard",     label: "JOB BOARD" });
  plan.push({ key: "tagdurations", label: "AVG TIMES" });
  plan.push({ key: "hygiene",      label: "TIME TRACKING" });
  if (data.safetyTopic) plan.push({ key: "safety",   label: "SAFETY" });
  if (data.shoutout)    plan.push({ key: "shoutout", label: "SHOUTOUT" });
  plan.push({ key: "kpis",         label: "GOALS" });

  const totalNumbered = plan.length - 1;
  let numberedIndex = 0;
  const labelFor = (i) => {
    if (plan[i].key === "cover") return "";
    numberedIndex += 1;
    return `${plan[i].label}  /  ${String(numberedIndex).padStart(2, "0")}  OF  ${String(totalNumbered).padStart(2, "0")}`;
  };

  const slidesHTML = plan.map((item, i) => {
    const labelStr = labelFor(i);
    let inner = "";
    switch (item.key) {
      case "cover":
        inner = buildCoverSlideHTML({
          weekHumanLabel: data.weekOf.humanLabel,
          onCall: data.onCall,
        });
        break;
      case "oncall":
        inner = buildOnCallSlideHTML({ onCall: data.onCall }, labelStr);
        break;
      case "events":
        inner = buildEventsSlideHTML({ events: data.events }, labelStr);
        break;
      case "newitems":
        inner = buildNewItemsSlideHTML({ newItems: data.newItems }, labelStr);
        break;
      case "moveditems":
        inner = buildMovedItemsSlideHTML({ movedItems: data.movedItems }, labelStr);
        break;
      case "jobboard":
        inner = buildJobBoardSlideHTML({ jobBoard: data.jobBoard }, labelStr);
        break;
      case "tagdurations":
        inner = buildTagDurationsSlideHTML({ tagDurations: data.tagDurations }, labelStr);
        break;
      case "hygiene":
        inner = buildTimeTrackingSlideHTML({ hygiene: data.hygiene }, labelStr);
        break;
      case "safety":
        inner = buildSafetySlideHTML({ safetyTopic: data.safetyTopic }, labelStr);
        break;
      case "shoutout":
        inner = buildShoutoutSlideHTML({ shoutout: data.shoutout }, labelStr);
        break;
      case "kpis":
        inner = buildKPIsSlideHTML({ kpis: data.kpis }, labelStr);
        break;
    }
    return `<div class="slide" data-key="${item.key}">${inner}</div>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Golden Rule — Shop Briefing — ${escapeHtml(data.weekOf.humanLabel)}</title>
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
${buildSlideshowJS(plan, SLIDE_TIMINGS)}
  </script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, "utf8");
  return {
    slideCount: plan.length,
    outputPath,
    plan: plan.map(p => p.key),
  };
}
