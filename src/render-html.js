// Renders the weekly Golden Rule shop briefing as a standalone HTML file.

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

const SLIDE_TIMINGS = {
  oncall:       12,
  kpis:         20,
  revenue:      22,
  buttons:      22,
  areas:        22,
  tagdurations: 18,
  techyear:     25,
};

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

function buildCSS() {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%; overflow: hidden;
      background: ${COLORS.NAVY_DARK};
      font-family: 'Arial', 'Helvetica', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    body { user-select: none; -webkit-user-select: none; }

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
      font-size: 2.4vw; font-weight: 900; color: ${COLORS.WHITE};
      letter-spacing: 0.04em; flex: 1; padding-left: 1.5%;
    }
    .header-bar .brand { font-size: 1vw; letter-spacing: 0.1em; text-align: right; flex-shrink: 0; }
    .header-bar .brand .gr { color: ${COLORS.YELLOW}; font-weight: bold; }
    .header-bar .brand .pc { color: ${COLORS.WHITE}; }

    .footer-bar {
      position: absolute; left: 0; right: 0; bottom: 0; height: 4.7%;
      background: ${COLORS.NAVY_DARK};
      display: flex; align-items: center; padding: 0 3%; z-index: 5;
    }
    .footer-bar .left { flex: 1; color: ${COLORS.WHITE}; font-size: 0.9vw; font-weight: bold; letter-spacing: 0.1em; }
    .footer-bar .right { color: ${COLORS.YELLOW}; font-size: 0.9vw; font-weight: bold; letter-spacing: 0.1em; }

    .cover {
      position: absolute; inset: 0; width: 100%; height: 100%;
      background: ${COLORS.NAVY_DARK}; overflow: hidden;
    }
    .cover .top-stripe {
      position: absolute; top: 0; left: 0; right: 0; height: 1.6%;
      background: ${COLORS.YELLOW}; z-index: 2;
    }
    .cover .bottom-bar {
      position: absolute; left: 0; right: 0; bottom: 0; height: 14.7%;
      background: ${COLORS.YELLOW};
      display: flex; align-items: center; justify-content: center;
      font-family: 'Arial Black', sans-serif;
      font-size: 2.5vw; font-weight: 900; color: ${COLORS.NAVY_DARK};
      letter-spacing: 0.04em; z-index: 2;
    }
    .cover .corp-tag {
      position: absolute; top: 12%; left: 4.5%;
      color: ${COLORS.STEEL_LIGHT}; font-size: 1.4vw;
      font-weight: bold; letter-spacing: 0.16em; z-index: 3;
    }
    .cover .logo {
      position: absolute; top: 24%; left: 4.5%;
      width: 27%; height: 28.4%;
      background-size: contain; background-repeat: no-repeat; background-position: center;
      z-index: 3;
    }
    .cover .headline {
      position: absolute; top: 17.3%; left: 33.75%;
      width: 62.25%;
      font-family: 'Arial Black', sans-serif;
      font-size: 8vw; font-weight: 900; letter-spacing: 0.04em;
      line-height: 1.0; z-index: 3;
    }
    .cover .headline .shop { color: ${COLORS.WHITE}; }
    .cover .headline .briefing { color: ${COLORS.YELLOW}; margin-top: 0.6%; }
    .cover .week-of {
      position: absolute; top: 49.3%; left: 33.75%;
      color: ${COLORS.STEEL_LIGHT}; font-size: 2vw;
      font-weight: bold; letter-spacing: 0.12em; z-index: 3;
    }
    .cover .city {
      position: absolute; top: 58.6%; left: 33.75%;
      color: ${COLORS.GRAY_MUTED}; font-size: 1.3vw;
      font-weight: bold; letter-spacing: 0.12em; z-index: 3;
    }

    .slide-body {
      position: absolute; top: 11.3%; left: 0; right: 0; bottom: 4.7%;
    }

    .oncall .card {
      position: absolute; top: 1.2%; width: 45%; height: 87%;
      padding: 3%; overflow: hidden;
    }
    .oncall .card.this-week { left: 3.75%; background: ${COLORS.NAVY_DARK}; }
    .oncall .card.next-week { right: 3.75%; background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE}; }
    .oncall .card .top-stripe { position: absolute; top: 0; left: 0; right: 0; height: 3%; }
    .oncall .card.this-week .top-stripe { background: ${COLORS.YELLOW}; }
    .oncall .card.next-week .top-stripe { background: ${COLORS.NAVY_DARK}; }
    .oncall .card.this-week::before {
      content: ""; position: absolute; left: 0; top: 0; bottom: 0;
      width: 2.3%; background: ${COLORS.YELLOW};
    }
    .oncall .week-label {
      font-size: 1.2vw; font-weight: bold; letter-spacing: 0.16em;
      margin-bottom: 2%; margin-top: 1.5%;
    }
    .oncall .card.this-week .week-label { color: ${COLORS.YELLOW}; }
    .oncall .card.next-week .week-label { color: ${COLORS.NAVY}; }
    .oncall .role-label {
      font-size: 0.9vw; font-weight: bold; letter-spacing: 0.16em; margin-bottom: 0.5%;
    }
    .oncall .card.this-week .role-label { color: ${COLORS.STEEL_LIGHT}; }
    .oncall .card.next-week .role-label { color: ${COLORS.GRAY_TEXT}; }
    .oncall .name {
      font-family: 'Arial Black', sans-serif;
      font-size: 3vw; font-weight: 900; line-height: 1.05; margin-bottom: 4%;
    }
    .oncall .card.this-week .name { color: ${COLORS.WHITE}; }
    .oncall .card.next-week .name { color: ${COLORS.NAVY_DARK}; }
    .oncall .contact-row { font-size: 1.2vw; font-weight: bold; margin-bottom: 0.8%; }
    .oncall .email-row { font-size: 1vw; margin-bottom: 4%; }
    .oncall .card.this-week .contact-row, .oncall .card.this-week .email-row { color: ${COLORS.WHITE}; }
    .oncall .card.next-week .contact-row, .oncall .card.next-week .email-row { color: ${COLORS.NAVY_DARK}; }
    .oncall .divider { margin: 2% 0; }
    .oncall .card.this-week .divider { border-top: 1px solid ${COLORS.STEEL}; }
    .oncall .card.next-week .divider { border-top: 1px solid ${COLORS.GRAY_LINE}; }
    .oncall .field-label {
      font-size: 0.85vw; font-weight: bold; letter-spacing: 0.16em;
      margin-bottom: 0.4%; margin-top: 2.5%;
    }
    .oncall .card.this-week .field-label { color: ${COLORS.YELLOW}; }
    .oncall .card.next-week .field-label { color: ${COLORS.NAVY}; }
    .oncall .field-value {
      font-family: 'Arial Black', sans-serif;
      font-size: 1.8vw; font-weight: 900;
    }
    .oncall .card.this-week .field-value { color: ${COLORS.WHITE}; }
    .oncall .card.next-week .field-value { color: ${COLORS.NAVY_DARK}; }
    .oncall .placeholder {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 70%; text-align: center;
    }
    .oncall .placeholder-text {
      font-family: 'Arial Black', sans-serif;
      font-size: 2.2vw; font-weight: 900; letter-spacing: 0.06em; margin-bottom: 1%;
    }
    .oncall .card.this-week .placeholder-text { color: ${COLORS.STEEL_LIGHT}; }
    .oncall .card.next-week .placeholder-text { color: ${COLORS.GRAY_MUTED}; }
    .oncall .placeholder-sub { font-size: 1vw; font-style: italic; }
    .oncall .card.this-week .placeholder-sub { color: ${COLORS.STEEL_LIGHT}; }
    .oncall .card.next-week .placeholder-sub { color: ${COLORS.GRAY_MUTED}; }

    .events-grid {
      position: absolute;
      top: 1.5%; left: 3.75%; right: 3.75%; bottom: 1.5%;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 1.2%;
    }
    .event-card {
      background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: flex; flex-direction: column;
      overflow: hidden;
    }
    .event-card .date-block {
      height: 45%;
      background: ${COLORS.NAVY_DARK};
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      flex-shrink: 0; padding: 4%;
    }
    .event-card .date-block .day {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.YELLOW}; font-size: 1.1vw; font-weight: 900; letter-spacing: 0.14em;
      margin-bottom: 2%;
    }
    .event-card .date-block .date {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.WHITE}; font-size: 2.6vw; font-weight: 900; line-height: 1;
    }
    .event-card .info {
      flex: 1; padding: 4% 6%;
      display: flex; flex-direction: column;
      align-items: center; justify-content: space-between;
      text-align: center;
      overflow: hidden;
    }
    .event-card .title {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK}; font-size: 0.95vw; font-weight: 900;
      line-height: 1.25;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }
    .event-card .time {
      color: ${COLORS.GRAY_TEXT}; font-size: 0.75vw; font-weight: bold;
      margin-top: auto;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .subhead {
      position: absolute; top: 1.5%; left: 3.75%;
      color: ${COLORS.GRAY_MUTED}; font-size: 1vw; font-weight: bold; letter-spacing: 0.12em;
    }
    .new-items-grid {
      position: absolute; top: 7%; left: 3.75%; right: 3.75%; bottom: 1.5%;
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.65%;
    }
    .new-item-card {
      background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      position: relative; overflow: hidden;
      display: flex; flex-direction: column;
    }
    .new-item-card .photo-area {
      height: 38%; background: ${COLORS.YELLOW};
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; position: relative;
    }
    .new-item-card .photo-area::after {
      content: "[ PHOTO ]";
      color: ${COLORS.NAVY_DARK}; font-size: 0.8vw; font-weight: bold;
      letter-spacing: 0.18em; margin-top: 5%;
    }
    .new-item-card .new-badge {
      position: absolute; top: 4%; right: 4%;
      background: ${COLORS.NAVY_DARK}; color: ${COLORS.YELLOW};
      font-family: 'Arial Black', sans-serif;
      font-size: 0.85vw; font-weight: 900; letter-spacing: 0.18em;
      padding: 0.5% 1.5%;
    }
    .new-item-card .body { padding: 4%; flex: 1; display: flex; flex-direction: column; }
    .new-item-card .name {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK}; font-size: 1.2vw; font-weight: 900; margin-bottom: 0.8%;
    }
    .new-item-card .category {
      color: ${COLORS.GRAY_MUTED}; font-size: 0.8vw; font-weight: bold; letter-spacing: 0.12em;
      margin-bottom: 4%; padding-bottom: 4%; border-bottom: 1px solid ${COLORS.GRAY_LINE};
    }
    .new-item-card .location-label {
      color: ${COLORS.GRAY_MUTED}; font-size: 0.75vw; font-weight: bold;
      letter-spacing: 0.14em; margin-bottom: 0.4%;
    }
    .new-item-card .location {
      color: ${COLORS.NAVY_DARK}; font-size: 1vw; font-weight: bold; margin-bottom: 4%;
    }
    .new-item-card .notes {
      color: ${COLORS.GRAY_TEXT}; font-size: 0.85vw; line-height: 1.4; flex: 1;
    }

    .reviews-list {
      position: absolute; top: 1%; left: 3.75%; right: 3.75%; bottom: 9%;
      display: flex; flex-direction: column; gap: 1.4%;
    }
    .review-card {
      flex: 1;
      background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      position: relative; padding: 2% 3% 2% 4%;
      display: flex; flex-direction: column; justify-content: space-between;
      overflow: hidden;
    }
    .review-card::before {
      content: ""; position: absolute; left: 0; top: 0; bottom: 0;
      width: 1.1%; background: ${COLORS.YELLOW};
    }
    .review-card .top-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 2%; }
    .review-card .quote-icon {
      color: ${COLORS.NAVY_DARK}; font-size: 2.2vw;
      flex-shrink: 0; line-height: 1; margin-top: 0.3%;
    }
    .review-card .text {
      flex: 1; color: ${COLORS.NAVY_DARK};
      font-size: 1.15vw; line-height: 1.4; font-style: italic; padding: 0 2%;
    }
    .review-card .stars {
      flex-shrink: 0; font-size: 1.3vw; letter-spacing: 0.08em; color: ${COLORS.YELLOW};
    }
    .review-card .stars .gray { color: ${COLORS.GRAY_LINE}; }
    .review-card .bottom-row {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 1.5%; padding-left: 2.5%;
    }
    .review-card .customer {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.GRAY_TEXT}; font-size: 0.95vw; font-weight: 900;
    }
    .review-card .tech-praise {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.GREEN_OK}; font-size: 0.9vw; font-weight: 900; letter-spacing: 0.14em;
    }
    .reviews-banner {
      position: absolute; left: 3.75%; right: 3.75%; bottom: 1%;
      height: 6%; background: ${COLORS.YELLOW};
      display: flex; align-items: center; justify-content: center;
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK}; font-size: 1vw; font-weight: 900; letter-spacing: 0.18em;
    }

    .jobboard-left {
      position: absolute; top: 1%; left: 3.75%; bottom: 1%;
      width: 62%;
      background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      padding: 2.5%;
      display: flex; flex-direction: column;
    }
    .jobboard-left .header {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK}; font-size: 1.4vw; font-weight: 900; letter-spacing: 0.1em;
      padding-bottom: 1.5%; border-bottom: 3px solid ${COLORS.YELLOW};
      flex-shrink: 0;
    }
    .jobboard-rows { flex: 1; display: flex; flex-direction: column; padding-top: 1%; }
    .job-row {
      flex: 1; display: flex; align-items: center;
      gap: 2%; padding: 0 1%; min-height: 0;
    }
    .job-row.alt { background: ${COLORS.STEEL_LIGHT}; }
    .job-row .day-pill {
      width: 8%; background: ${COLORS.NAVY_DARK}; color: ${COLORS.YELLOW};
      font-family: 'Arial Black', sans-serif;
      font-size: 1.1vw; font-weight: 900; letter-spacing: 0.12em;
      text-align: center; padding: 1.5% 0; flex-shrink: 0;
    }
    .job-row .desc { flex: 1; min-width: 0; }
    .job-row .desc .label {
      color: ${COLORS.GRAY_MUTED}; font-size: 0.85vw; font-weight: bold;
      letter-spacing: 0.08em; margin-bottom: 0.3%;
    }
    .job-row .desc .text {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK}; font-size: 1.2vw; font-weight: 900;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .job-row .tech {
      width: 14%; color: ${COLORS.GRAY_TEXT};
      font-size: 1vw; font-weight: bold; text-align: center;
    }
    .job-row .duration {
      width: 12%; color: ${COLORS.NAVY_DARK};
      font-size: 1.1vw; font-weight: bold; text-align: right;
    }
    .jobboard-totals {
      flex-shrink: 0; background: ${COLORS.NAVY_DARK};
      display: grid; grid-template-columns: 1fr 1fr 1fr 1fr;
      padding: 1.5% 0; margin-top: 1.5%;
    }
    .jobboard-totals .cell {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      border-right: 1px solid ${COLORS.STEEL}; padding: 0.5% 0;
    }
    .jobboard-totals .cell:last-child { border-right: none; }
    .jobboard-totals .cell .label {
      color: ${COLORS.YELLOW}; font-size: 0.85vw; font-weight: bold;
      letter-spacing: 0.16em; margin-bottom: 0.6%;
    }
    .jobboard-totals .cell .value {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.WHITE}; font-size: 2vw; font-weight: 900;
    }
    .jobboard-right {
      position: absolute; top: 1%; right: 3.75%; bottom: 1%;
      width: 28.7%;
      display: flex; flex-direction: column; gap: 2%;
    }
    .stat-card {
      flex: 1; background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
      padding: 4%; position: relative;
      display: flex; flex-direction: column; justify-content: center;
    }
    .stat-card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 6%; }
    .stat-card.yellow::before { background: ${COLORS.YELLOW}; }
    .stat-card.navy::before { background: ${COLORS.NAVY_DARK}; }
    .stat-card.red::before { background: ${COLORS.RED_ALERT}; }
    .stat-card .label {
      color: ${COLORS.GRAY_MUTED}; font-size: 0.85vw; font-weight: bold;
      letter-spacing: 0.16em; margin-bottom: 4%;
    }
    .stat-card .value {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK}; font-size: 4.5vw; font-weight: 900; line-height: 1;
    }

    .tag-grid {
      position: absolute; top: 7%; left: 3.75%; right: 3.75%; bottom: 9%;
      display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(4, 1fr);
      gap: 1.2%;
    }
    .tag-card {
      background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
      padding: 1.2% 2%; position: relative;
      display: flex; align-items: center; gap: 4%;
    }
    .tag-card::before {
      content: ""; position: absolute; left: 0; top: 0; bottom: 0;
      width: 1.1%; background: ${COLORS.YELLOW};
    }
    .tag-card .tag-name {
      flex: 1;
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK}; font-size: 1.4vw; font-weight: 900;
      letter-spacing: 0.04em; padding-left: 2%;
    }
    .tag-card .median {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK}; font-size: 1.8vw; font-weight: 900; text-align: right;
    }
    .tag-card .sample {
      color: ${COLORS.GRAY_MUTED}; font-size: 0.75vw; font-weight: bold;
      letter-spacing: 0.08em; text-align: right; margin-top: 0.2%;
    }
    .tag-card .right-block { display: flex; flex-direction: column; align-items: flex-end; }
    .footer-banner {
      position: absolute; left: 3.75%; right: 3.75%; bottom: 1%;
      height: 6%; background: ${COLORS.NAVY_DARK};
      display: flex; align-items: center; justify-content: center;
      color: ${COLORS.YELLOW};
      font-family: 'Arial Black', sans-serif;
      font-size: 1vw; font-weight: 900; letter-spacing: 0.16em;
    }

    /* Time Tracking — TECH | LAST 30 | LAST 7 | LED | ASSIGNED */
    .tt-table {
      position: absolute; top: 6%; left: 3.75%; right: 3.75%; bottom: 9%;
      display: flex; flex-direction: column;
    }
    .tt-row {
      display: grid;
      grid-template-columns: 16% 31% 31% 11% 11%;
      align-items: stretch;
    }
    .tt-row.head { height: 5%; flex-shrink: 0; }
    .tt-row.head .tt-cell {
      background: ${COLORS.NAVY_DARK}; color: ${COLORS.YELLOW};
      font-family: 'Arial Black', sans-serif;
      font-size: 0.9vw; font-weight: 900; letter-spacing: 0.14em;
      display: flex; align-items: center; padding: 0 1%;
    }
    .tt-row.head .tt-cell.center { justify-content: center; }
    .tt-row.head .tt-cell.banner-30 { background: ${COLORS.NAVY}; }
    .tt-row.head .tt-cell.banner-7 { background: ${COLORS.STEEL}; }
    .tt-row.subhead {
      height: 3.5%; flex-shrink: 0;
      background: ${COLORS.STEEL_LIGHT};
      font-size: 0.7vw; color: ${COLORS.GRAY_TEXT};
      font-weight: bold; letter-spacing: 0.14em;
      border-top: 1px solid ${COLORS.GRAY_LINE};
      border-bottom: 1px solid ${COLORS.GRAY_LINE};
    }
    .tt-subhead-empty {
      width: 100%; height: 100%;
    }
    .tt-subhead-label {
      width: 100%; height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tt-row.subhead .tt-subblock {
      width: 100%; height: 100%;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      align-items: stretch;
    }
    .tt-row.subhead .tt-subcell {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tt-row.body { flex: 1; min-height: 0; font-size: 0.95vw; }
    .tt-row.body.alt { background: ${COLORS.STEEL_LIGHT}; }
    .tt-row.body:not(.alt) { background: ${COLORS.WHITE}; }
    .tt-row.body .tt-name {
      display: flex; align-items: center; padding: 0 1%;
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK}; font-weight: 900;
      border-left: 1px solid ${COLORS.GRAY_LINE};
      border-right: 1px solid ${COLORS.GRAY_LINE};
    }
    .tt-row.body .tt-led {
      display: flex; align-items: center; justify-content: center;
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK}; font-weight: 900;
      border-right: 1px solid ${COLORS.GRAY_LINE};
    }
    .tt-row.body .tt-assigned {
      display: flex; align-items: center; justify-content: center;
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.STEEL}; font-weight: 900;
      border-right: 1px solid ${COLORS.GRAY_LINE};
    }
    .tt-row.body .tt-block {
      display: grid; grid-template-columns: 1fr 1fr 1fr;
      border-right: 1px solid ${COLORS.GRAY_LINE};
    }
    .tt-row.body:last-child .tt-name,
    .tt-row.body:last-child .tt-led,
    .tt-row.body:last-child .tt-assigned,
    .tt-row.body:last-child .tt-block {
      border-bottom: 1px solid ${COLORS.GRAY_LINE};
    }
    .tt-cell.pct {
      display: flex; align-items: center; justify-content: center;
      font-family: 'Arial Black', sans-serif;
      font-weight: 900; margin: 0.15%;
    }
    .pct.green { background: #C8E6C9; color: ${COLORS.NAVY_DARK}; }
    .pct.yellow { background: #FFF9C4; color: ${COLORS.NAVY_DARK}; }
    .pct.red { background: #FFCDD2; color: ${COLORS.RED_ALERT}; }
    .pct.empty { background: ${COLORS.STEEL_LIGHT}; color: ${COLORS.GRAY_MUTED}; }
    .tt-leader {
      position: absolute; left: 3.75%; right: 3.75%; bottom: 1%;
      height: 6%;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Arial Black', sans-serif;
      font-size: 1vw; font-weight: 900; letter-spacing: 0.16em;
    }
    .tt-leader.has-leader { background: ${COLORS.YELLOW}; color: ${COLORS.NAVY_DARK}; }
    .tt-leader.no-leader { background: ${COLORS.NAVY_DARK}; color: ${COLORS.YELLOW}; }

    .safety-left {
      position: absolute; top: 1%; left: 3.75%; bottom: 1%;
      width: 45%; background: ${COLORS.NAVY_DARK}; padding: 3%;
    }
    .safety-left::before {
      content: ""; position: absolute; left: 0; top: 0; bottom: 0;
      width: 2.3%; background: ${COLORS.YELLOW};
    }
    .safety-tag {
      color: ${COLORS.YELLOW}; font-size: 0.95vw; font-weight: bold;
      letter-spacing: 0.16em; margin-bottom: 0.6%;
    }
    .safety-headline {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.WHITE}; font-size: 1.65vw; font-weight: 900;
      margin-bottom: 4%; padding-bottom: 4%;
      border-bottom: 1px solid ${COLORS.STEEL};
    }
    .safety-bullets {
      color: ${COLORS.WHITE}; font-size: 1.1vw; line-height: 1.6;
      list-style-type: disc; padding-left: 1.2em;
    }
    .safety-bullets li { margin-bottom: 1%; }
    .safety-banner {
      position: absolute; left: 3%; right: 3%; bottom: 3%;
      height: 8%; background: ${COLORS.YELLOW};
      display: flex; align-items: center; justify-content: center;
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK};
      font-size: 0.85vw; font-weight: 900; letter-spacing: 0.14em;
      padding: 0 2%; text-align: center;
    }
    .safety-right {
      position: absolute; top: 1%; right: 3.75%; bottom: 1%;
      width: 45%;
      display: flex; flex-direction: column; gap: 1.4%;
    }
    .safety-tile {
      flex: 1; background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
      display: flex; align-items: center; gap: 2%; padding-right: 2.5%;
    }
    .safety-tile .accent { width: 18%; align-self: stretch; background: ${COLORS.YELLOW}; }
    .safety-tile .body { flex: 1; }
    .safety-tile .label {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK}; font-size: 1.2vw; font-weight: 900;
      letter-spacing: 0.1em; margin-bottom: 1%;
    }
    .safety-tile .text { color: ${COLORS.GRAY_TEXT}; font-size: 0.9vw; line-height: 1.4; }

    .shoutout-card {
      position: absolute; top: 1%; left: 3.75%; right: 3.75%; bottom: 1%;
      background: ${COLORS.NAVY_DARK};
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 3%;
    }
    .shoutout-card::before {
      content: ""; position: absolute; top: 0; left: 0; right: 0;
      height: 2.3%; background: ${COLORS.YELLOW};
    }
    .shoutout-tag {
      color: ${COLORS.YELLOW}; font-size: 1.1vw; font-weight: bold;
      letter-spacing: 0.18em; margin-bottom: 2%;
    }
    .shoutout-stars {
      font-size: 3vw; letter-spacing: 0.05em; color: ${COLORS.YELLOW}; margin-bottom: 2%;
    }
    .shoutout-name {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.WHITE}; font-size: 4vw; font-weight: 900;
      margin-bottom: 2%; text-align: center;
    }
    .shoutout-divider {
      width: 30%; border-top: 2px solid ${COLORS.YELLOW}; margin: 0 auto 2%;
    }
    .shoutout-why {
      color: ${COLORS.YELLOW}; font-size: 0.9vw; font-weight: bold;
      letter-spacing: 0.16em; margin-bottom: 1.5%;
    }
    .shoutout-reason {
      color: ${COLORS.WHITE}; font-style: italic; font-size: 1.5vw;
      text-align: center; max-width: 75%; line-height: 1.4;
    }

    .areas-list {
      position: absolute; top: 7%; left: 3.75%; right: 3.75%; bottom: 9%;
      display: flex; flex-direction: column; gap: 1%;
    }
    .area-row {
      flex: 1;
      background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      display: grid; grid-template-columns: 5% 30% 1fr 12%;
      align-items: stretch; overflow: hidden;
    }
    .area-row .rank {
      display: flex; align-items: center; justify-content: center;
      font-family: 'Arial Black', sans-serif;
      font-size: 1.4vw; font-weight: 900;
      background: ${COLORS.NAVY_DARK}; color: ${COLORS.YELLOW};
    }
    .area-row.leader .rank { background: ${COLORS.YELLOW}; color: ${COLORS.NAVY_DARK}; }
    .area-row .city {
      display: flex; align-items: center; padding-left: 2%;
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK}; font-size: 1.5vw; font-weight: 900;
    }
    .area-row .bar-track { display: flex; align-items: center; padding: 0 2%; }
    .area-row .bar-bg {
      flex: 1; height: 50%;
      background: ${COLORS.STEEL_LIGHT}; border: 1px solid ${COLORS.GRAY_LINE};
      position: relative; overflow: hidden;
    }
    .area-row .bar-fill {
      position: absolute; left: 0; top: 0; bottom: 0; background: ${COLORS.NAVY};
    }
    .area-row.leader .bar-fill { background: ${COLORS.YELLOW}; }
    .area-row .count {
      display: flex; align-items: center; justify-content: flex-end;
      padding-right: 3%;
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK}; font-size: 1.5vw; font-weight: 900;
    }

    .kpi-tiles {
      position: absolute; top: 1.5%; left: 3.75%; right: 3.75%;
      height: 27%;
      display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 1.2%;
    }
    .kpi-tile {
      background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      padding: 2.5% 2%; position: relative;
      display: flex; flex-direction: column;
      align-items: center; justify-content: space-between;
    }
    .kpi-tile::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 8%; }
    .kpi-tile.yellow::before { background: ${COLORS.YELLOW}; }
    .kpi-tile.green::before { background: ${COLORS.GREEN_OK}; }
    .kpi-tile.red::before { background: ${COLORS.RED_ALERT}; }
    .kpi-tile.navy::before { background: ${COLORS.NAVY_DARK}; }
    .kpi-tile .label {
      color: ${COLORS.GRAY_MUTED}; font-size: 0.85vw; font-weight: bold;
      letter-spacing: 0.18em; margin-top: 4%;
    }
    .kpi-tile .value {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK}; font-size: 3.2vw; font-weight: 900;
    }
    .kpi-tile .sub {
      color: ${COLORS.GRAY_MUTED}; font-size: 0.75vw; font-weight: bold; letter-spacing: 0.14em;
    }
    .chart-card {
      position: absolute; top: 30.5%; left: 3.75%; right: 3.75%; bottom: 1.5%;
      background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      padding: 0; overflow: hidden;
      display: flex; flex-direction: column;
    }
    .chart-card .top-stripe { height: 4%; background: ${COLORS.YELLOW}; flex-shrink: 0; }
    .chart-card .title {
      font-family: 'Arial Black', sans-serif;
      color: ${COLORS.NAVY_DARK}; font-size: 1.1vw; font-weight: 900; letter-spacing: 0.1em;
      padding: 1.5% 2% 1.5% 2%; flex-shrink: 0;
    }
    .chart-area { flex: 1; min-height: 0; padding: 0 2% 2% 2%; position: relative; }
    .chart-area canvas { width: 100%; height: 100%; display: block; }

    /* ---- Data slides: HCP buttons, revenue by truck, estimate win rate ---- */
    .dt {
      position: absolute; display: flex; flex-direction: column;
      border: 1px solid ${COLORS.GRAY_LINE};
    }
    .dt-row {
      display: grid; grid-template-columns: var(--cols);
      align-items: stretch; flex: 1; min-height: 0;
    }
    .dt-row.head { flex: 0 0 5.6%; }
    .dt-row.head .dt-cell {
      background: ${COLORS.NAVY_DARK}; color: ${COLORS.YELLOW};
      font-size: 0.85vw; letter-spacing: 0.12em; border-right: none;
    }
    .dt-row.body.alt { background: ${COLORS.STEEL_LIGHT}; }
    .dt-row.body:not(.alt) { background: ${COLORS.WHITE}; }
    .dt-cell {
      display: flex; align-items: center; justify-content: center; min-width: 0;
      font-family: 'Arial Black', sans-serif; font-weight: 900;
      color: ${COLORS.NAVY_DARK}; font-size: 1.2vw;
      border-right: 1px solid ${COLORS.GRAY_LINE};
    }
    .dt-cell:last-child { border-right: none; }
    .dt-cell.left { justify-content: flex-start; padding-left: 4%; }
    .dt-cell.muted { color: ${COLORS.STEEL}; }
    .dt-cell.pct { margin: 0.12%; }
    .dt-cell.strong { font-size: 1.35vw; }
    .dt-cell.bar { justify-content: flex-start; padding: 0 1.5% 0 1%; }
    .bar-wrap { display: flex; align-items: center; width: 100%; height: 100%; gap: 1.5%; }
    .bar-fill { height: 58%; background: ${COLORS.NAVY_DARK}; flex: 0 0 auto; min-width: 3px; }
    .bar-fill.top { background: ${COLORS.YELLOW}; box-shadow: inset 0 0 0 2px ${COLORS.NAVY_DARK}; }
    .bar-label { font-size: 1.25vw; color: ${COLORS.NAVY_DARK}; white-space: nowrap; }

    .data-tiles {
      position: absolute; top: 6%; left: 3.75%; right: 3.75%; height: 17.5%;
      display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 1.2%;
    }
    .data-tile, .hb-tile {
      background: ${COLORS.WHITE}; border: 1px solid ${COLORS.GRAY_LINE};
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      position: relative; padding: 2% 3%;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    }
    .data-tile::before, .hb-tile::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 7%; }
    .data-tile.yellow::before, .hb-tile.yellow::before { background: ${COLORS.YELLOW}; }
    .data-tile.green::before, .hb-tile.green::before { background: ${COLORS.GREEN_OK}; }
    .data-tile.red::before, .hb-tile.red::before { background: ${COLORS.RED_ALERT}; }
    .data-tile.navy::before, .hb-tile.navy::before { background: ${COLORS.NAVY_DARK}; }
    .data-tile .label, .hb-tile .label {
      color: ${COLORS.GRAY_MUTED}; font-size: 0.8vw; font-weight: bold; letter-spacing: 0.16em;
    }
    .data-tile .value {
      font-family: 'Arial Black', sans-serif; color: ${COLORS.NAVY_DARK};
      font-size: 2.7vw; font-weight: 900; line-height: 1.15;
    }
    .data-tile .sub, .hb-tile .sub {
      color: ${COLORS.GRAY_MUTED}; font-size: 0.7vw; font-weight: bold;
      letter-spacing: 0.1em; text-align: center;
    }
    .data-tile.red .sub { color: ${COLORS.RED_ALERT}; }
    .data-tile.green .sub { color: ${COLORS.GREEN_OK}; }

    .hb-table { top: 6%; left: 3.75%; width: 62.5%; bottom: 9%; }
    .hb-side {
      position: absolute; top: 6%; bottom: 9%; left: 67.5%; right: 3.75%;
      display: flex; flex-direction: column; gap: 2.2%;
    }
    .hb-tile { flex: 0 0 22%; }
    .hb-tile .value {
      font-family: 'Arial Black', sans-serif; color: ${COLORS.NAVY_DARK};
      font-size: 3.4vw; font-weight: 900; line-height: 1.1;
    }
    .hb-fix {
      flex: 1; min-height: 0; background: ${COLORS.WHITE};
      border: 1px solid ${COLORS.GRAY_LINE}; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: flex; flex-direction: column; overflow: hidden;
    }
    .hb-fix-head {
      background: ${COLORS.NAVY_DARK}; color: ${COLORS.YELLOW}; flex: 0 0 auto;
      font-family: 'Arial Black', sans-serif; font-size: 0.85vw; font-weight: 900;
      letter-spacing: 0.12em; padding: 2.5% 4%;
    }
    .hb-fix-body { flex: 1; min-height: 0; padding: 1.5% 4%; display: flex; flex-direction: column; justify-content: space-evenly; }
    .hb-fix-row { display: flex; gap: 3%; align-items: baseline; font-size: 0.95vw; line-height: 1.25; }
    .hb-fix-row .who { font-family: 'Arial Black', sans-serif; font-weight: 900; color: ${COLORS.NAVY_DARK}; flex: 0 0 18%; }
    .hb-fix-row .what { color: ${COLORS.GRAY_TEXT}; font-weight: bold; }
    .hb-fix-empty { text-align: center; color: ${COLORS.GREEN_OK}; font-weight: bold; font-size: 1.1vw; margin: auto 0; }

    .dt-wide { top: 26%; left: 3.75%; right: 3.75%; bottom: 9%; }
    .data-empty {
      position: absolute; top: 40%; left: 0; right: 0; text-align: center;
      color: ${COLORS.GRAY_MUTED}; font-size: 1.5vw;
    }

    /* ---- Extra table styling for the comparison / stats slides ---- */
    .dt-row.group { flex: 0 0 4.4%; }
    .dt-row.group .dt-cell {
      background: ${COLORS.NAVY}; color: ${COLORS.WHITE};
      font-size: 0.85vw; letter-spacing: 0.14em;
      border-right: 1px solid ${COLORS.NAVY_DARK};
    }
    .dt-row.group .dt-cell.g30 { background: ${COLORS.STEEL}; }
    .dt-row.total { background: ${COLORS.STEEL_LIGHT}; border-top: 3px solid ${COLORS.NAVY_DARK}; }
    .dt-cell.up { color: ${COLORS.GREEN_OK}; }
    .dt-cell.down { color: ${COLORS.RED_ALERT}; }
    .dt-cell.flat { color: ${COLORS.GRAY_MUTED}; }
    .dt-cell.dim { color: ${COLORS.GRAY_MUTED}; }
    .dt-cell.lead { background: ${COLORS.YELLOW}; margin: 0.12%; }
    .tt-leader.stale { background: ${COLORS.RED_ALERT}; color: ${COLORS.WHITE}; }
    .subhead .flag { color: ${COLORS.RED_ALERT}; }
    .hb-note {
      flex: 1; min-height: 0; background: ${COLORS.WHITE};
      border: 1px solid ${COLORS.GRAY_LINE}; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      padding: 4%; display: flex; flex-direction: column; justify-content: center; gap: 4%;
    }
    .hb-note .label { color: ${COLORS.GRAY_MUTED}; font-size: 0.8vw; font-weight: bold; letter-spacing: 0.14em; }
    .hb-note .text { font-family: 'Arial Black', sans-serif; font-weight: 900; color: ${COLORS.NAVY_DARK}; font-size: 1.15vw; line-height: 1.3; }

    .progress {
      position: fixed; top: 0; left: 0; right: 0; height: 3px;
      background: rgba(255,208,0,0.2); z-index: 100;
    }
    .progress .bar {
      height: 100%; background: ${COLORS.YELLOW};
      width: 0; transition: width 0.1s linear;
    }
  `;
}

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

// ---------------------------------------------------------------------------
// Data slides: HCP buttons (from the HCP Buttons sheet), revenue, estimates
// ---------------------------------------------------------------------------

function moneyFromCents(cents) {
  if (!cents || cents < 0) return "$0";
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

function btnPctClass(p) {
  if (p == null) return "empty";
  if (p >= 95) return "green";
  if (p >= 80) return "yellow";
  return "red";
}

function fmtPctCell(p) {
  return p == null ? "—" : `${p}%`;
}

// Up/down cell for a change in count: ▲ +3 (green), ▼ −2 (red), — (flat).
function deltaCell(n) {
  if (n > 0) return { text: `▲ +${n}`, cls: "up" };
  if (n < 0) return { text: `▼ −${Math.abs(n)}`, cls: "down" };
  return { text: "—", cls: "flat" };
}

function shortRange(label) {
  // "Sep 30 – Oct 6" -> "SEP 30 – OCT 6"
  return String(label || "").toUpperCase();
}

function buildRevenueSlideHTML({ revenue }, slideLabel) {
  const rv = revenue;
  const p = rv.periods;
  const delta = rv.monthDeltaPct;
  const monthSub = delta == null
    ? `${p.month.jobs} JOBS CLOSED`
    : `${delta >= 0 ? "UP" : "DOWN"} ${Math.abs(delta)}% VS SAME POINT LAST MONTH`;

  const tiles = [
    { label: "TODAY",      value: rv.display.today,  sub: `${p.today.jobs} JOBS CLOSED`, cls: "yellow" },
    { label: "THIS WEEK",  value: rv.display.week,   sub: `${p.week.jobs} JOBS CLOSED`, cls: "navy" },
    { label: `${rv.monthLabel} TO DATE`, value: rv.display.month, sub: monthSub, cls: delta != null && delta < 0 ? "red" : "green" },
    { label: `${rv.lastMonthLabel} (FULL MONTH)`, value: rv.display.lastMonth, sub: `${p.lastMonth.jobs} JOBS CLOSED`, cls: "navy" },
  ];
  const tilesHTML = tiles.map(t => `
    <div class="data-tile ${t.cls}">
      <div class="label">${escapeHtml(t.label)}</div>
      <div class="value">${escapeHtml(t.value)}</div>
      <div class="sub">${escapeHtml(t.sub)}</div>
    </div>
  `).join("");

  const rows = rv.byTech;
  const BAR_SPACE = 70; // % of the bar column the longest bar may fill; the rest holds the $ label
  const bodyRows = rows.map((r, i) => {
    const w = Math.max(0, (r.month.cents / rv.maxMonthCents) * BAR_SPACE);
    const isTop = i === 0 && r.month.cents > 0;
    return `
      <div class="dt-row body ${i % 2 ? "alt" : ""}">
        <div class="dt-cell left strong">${escapeHtml(r.name)}</div>
        <div class="dt-cell bar">
          <div class="bar-wrap">
            <div class="bar-fill ${isTop ? "top" : ""}" style="width:${w.toFixed(1)}%"></div>
            <div class="bar-label">${escapeHtml(r.monthDisplay)}</div>
          </div>
        </div>
        <div class="dt-cell">${r.month.jobs}</div>
        <div class="dt-cell">${escapeHtml(r.avgTicketDisplay)}</div>
        <div class="dt-cell muted strong">${escapeHtml(r.lastMonthDisplay)}</div>
        <div class="dt-cell muted">${r.lastMonth.jobs}</div>
        <div class="dt-cell muted">${escapeHtml(r.lastMonthAvgTicketDisplay)}</div>
      </div>
    `;
  }).join("");

  const top = rows[0];
  let bannerText;
  let bannerClass;
  if (top && top.month.cents > 0) {
    bannerClass = "has-leader";
    bannerText = `★ TOP TRUCK IN ${rv.monthLabel}:  ${top.name.toUpperCase()}  —  ${top.monthDisplay}`;
  } else {
    bannerClass = "no-leader";
    bannerText = "REVENUE POSTS WHEN THE JOB IS FINISHED — HIT FINISH";
  }

  return `
    ${htmlHeader("REVENUE BY TRUCK")}
    <div class="slide-body">
      <div class="subhead">COMPLETED JOBS  ·  A JOB COUNTS FOR EVERY TRUCK TECH ON IT  ·  TOP TILES COUNT EACH JOB ONCE</div>
      <div class="data-tiles">${tilesHTML}</div>
      <div class="dt dt-wide" style="--cols: 11% 33% 7% 12% 15% 8% 14%;">
        <div class="dt-row head">
          <div class="dt-cell left">TRUCK</div>
          <div class="dt-cell">${escapeHtml(rv.monthLabel)} TO DATE</div>
          <div class="dt-cell">JOBS</div>
          <div class="dt-cell">AVG TICKET</div>
          <div class="dt-cell">${escapeHtml(rv.lastMonthLabel)}</div>
          <div class="dt-cell">JOBS</div>
          <div class="dt-cell">AVG TICKET</div>
        </div>
        ${bodyRows}
      </div>
      <div class="tt-leader ${bannerClass}">${escapeHtml(bannerText)}</div>
    </div>
    ${htmlFooter(slideLabel)}
  `;
}

function buildButtonsSlideHTML({ hcpButtons }, slideLabel) {
  const b = hcpButtons;
  const rows = b.rows;

  const bodyRows = rows.map((r, i) => `
    <div class="dt-row body ${i % 2 ? "alt" : ""}">
      <div class="dt-cell left strong">${escapeHtml(r.display)}</div>
      <div class="dt-cell muted">${r.soloJobs}</div>
      <div class="dt-cell pct ${btnPctClass(r.omw)}">${fmtPctCell(r.omw)}</div>
      <div class="dt-cell pct ${btnPctClass(r.start)}">${fmtPctCell(r.start)}</div>
      <div class="dt-cell pct ${btnPctClass(r.finish)}">${fmtPctCell(r.finish)}</div>
      <div class="dt-cell pct strong ${btnPctClass(r.all3)}">${fmtPctCell(r.all3)}</div>
    </div>
  `).join("");

  const t = b.team;
  const noSolo = b.noSoloDisplay.length > 0
    ? b.noSoloDisplay.map(n => n.toUpperCase()).join("  ·  ")
    : "NONE";

  const perfect = rows.filter(r => r.all3 === 100 && r.soloJobs >= 3).map(r => r.display.toUpperCase());
  let bannerText, bannerClass;
  if (b.stale) {
    const days = Math.max(1, Math.round((b.ageHours || 0) / 24));
    bannerClass = "stale";
    bannerText = `⚠ OLD DATA — HCP BUTTONS SHEET LAST UPDATED ${String(b.updatedLabel).toUpperCase()} (${days} DAY${days === 1 ? "" : "S"} AGO)`;
  } else if (perfect.length > 0) {
    bannerClass = "has-leader";
    bannerText = `★ ALL 3 BUTTONS ON EVERY SOLO JOB (3+ JOBS):  ${perfect.join("  ·  ")}`;
  } else {
    bannerClass = "no-leader";
    bannerText = "HIT YOUR BUTTONS — IT'S HOW THIS DATA HAPPENS";
  }

  const subParts = [
    "SOLO JOBS ONLY",
    "% OF JOBS WITH THE BUTTON PRESSED",
    String(b.last7Label || "LAST 7 DAYS").toUpperCase(),
  ];

  return `
    ${htmlHeader("HCP BUTTONS — SOLO JOBS")}
    <div class="slide-body">
      <div class="subhead">${escapeHtml(subParts.join("   ·   "))}</div>
      <div class="dt hb-table" style="--cols: 22% 13% 16% 16% 16% 17%;">
        <div class="dt-row head">
          <div class="dt-cell left">TECH</div>
          <div class="dt-cell">SOLO JOBS</div>
          <div class="dt-cell">ON MY WAY</div>
          <div class="dt-cell">START</div>
          <div class="dt-cell">FINISH</div>
          <div class="dt-cell">ALL 3</div>
        </div>
        ${bodyRows}
      </div>
      <div class="hb-side">
        <div class="hb-tile ${btnPctClass(t.all3)}">
          <div class="label">TEAM  —  ALL 3 BUTTONS</div>
          <div class="value">${fmtPctCell(t.all3)}</div>
          <div class="sub">${t.soloJobs} SOLO JOBS  ·  LAST 7 DAYS</div>
        </div>
        <div class="hb-tile navy">
          <div class="label">SHEET UPDATED</div>
          <div class="value" style="font-size: 1.7vw;">${escapeHtml(String(b.updatedLabel || "—").toUpperCase())}</div>
          <div class="sub">${b.stale ? "OLDER THAN IT SHOULD BE" : "FRESH"}</div>
        </div>
        <div class="hb-note">
          <div class="label">NO SOLO JOBS THIS WEEK</div>
          <div class="text">${escapeHtml(noSolo)}</div>
        </div>
      </div>
      <div class="tt-leader ${bannerClass}">${escapeHtml(bannerText)}</div>
    </div>
    ${htmlFooter(slideLabel)}
  `;
}

function buildServiceAreasSlideHTML({ serviceAreas }, slideLabel) {
  const sa = serviceAreas;
  const L = sa.labels;

  const rowHTML = (r, i, extraClass = "") => {
    const d7 = deltaCell(r.d7);
    const d30 = deltaCell(r.d30);
    return `
      <div class="dt-row body ${extraClass} ${i % 2 ? "alt" : ""}">
        <div class="dt-cell left strong">${escapeHtml(r.city)}</div>
        <div class="dt-cell strong">${r.w7}</div>
        <div class="dt-cell dim">${r.p7}</div>
        <div class="dt-cell strong ${d7.cls}">${d7.text}</div>
        <div class="dt-cell strong">${r.w30}</div>
        <div class="dt-cell dim">${r.p30}</div>
        <div class="dt-cell strong ${d30.cls}">${d30.text}</div>
      </div>
    `;
  };

  const bodyRows = sa.rows.map((r, i) => rowHTML(r, i)).join("");
  const totalRow = rowHTML({ city: "ALL CITIES", ...sa.totals }, 0, "total");

  // Biggest mover in each direction over 30 days.
  const byGain = [...sa.rows].sort((a, b) => b.d30 - a.d30);
  const gain = byGain[0];
  const drop = byGain[byGain.length - 1];
  const parts = [];
  if (gain && gain.d30 > 0) parts.push(`▲ BIGGEST GAIN (30 DAYS):  ${gain.city.toUpperCase()}  +${gain.d30}`);
  if (drop && drop.d30 < 0) parts.push(`▼ BIGGEST DROP:  ${drop.city.toUpperCase()}  −${Math.abs(drop.d30)}`);
  const bannerText = parts.length > 0 ? parts.join("     ·     ") : "WHERE THE WORK IS — COMPLETED JOBS BY CITY";
  const bannerClass = parts.length > 0 ? "has-leader" : "no-leader";

  return `
    ${htmlHeader("SERVICE AREAS — WHERE THE WORK IS")}
    <div class="slide-body">
      <div class="subhead">COMPLETED JOBS PER CITY  ·  EACH PERIOD VS THE PERIOD BEFORE IT  ·  THROUGH YESTERDAY</div>
      <div class="dt" style="--cols: 19% 13.5% 13.5% 13.5% 13.5% 13.5% 13.5%; top: 6%; left: 3.75%; right: 3.75%; bottom: 9%;">
        <div class="dt-row group">
          <div class="dt-cell"></div>
          <div class="dt-cell" style="grid-column: span 3;">7-DAY COMPARISON</div>
          <div class="dt-cell g30" style="grid-column: span 3;">30-DAY COMPARISON</div>
        </div>
        <div class="dt-row head">
          <div class="dt-cell left">CITY</div>
          <div class="dt-cell">${escapeHtml(shortRange(L.w7))}</div>
          <div class="dt-cell">${escapeHtml(shortRange(L.p7))}</div>
          <div class="dt-cell">CHANGE</div>
          <div class="dt-cell">${escapeHtml(shortRange(L.w30))}</div>
          <div class="dt-cell">${escapeHtml(shortRange(L.p30))}</div>
          <div class="dt-cell">CHANGE</div>
        </div>
        ${bodyRows}
        ${totalRow}
      </div>
      <div class="tt-leader ${bannerClass}">${escapeHtml(bannerText)}</div>
    </div>
    ${htmlFooter(slideLabel)}
  `;
}

function buildTechYearSlideHTML({ techYear }, slideLabel) {
  const ty = techYear;
  const rows = ty.techs;

  // Highlight the leader in each column so strengths jump out.
  const maxOf = key => Math.max(...rows.map(r => r[key] ?? -Infinity));
  const lead = { jobs: maxOf("jobs"), avg: maxOf("avgJobCents"), onJob: maxOf("onJobHours"), travel: maxOf("travelHours") };
  const fmtInt = n => Math.round(n).toLocaleString("en-US");

  const bodyRows = rows.map((r, i) => `
    <div class="dt-row body ${i % 2 ? "alt" : ""}">
      <div class="dt-cell left strong">${escapeHtml(r.name)}</div>
      <div class="dt-cell strong ${r.jobs === lead.jobs ? "lead" : ""}">${fmtInt(r.jobs)}</div>
      <div class="dt-cell strong ${r.avgJobCents === lead.avg ? "lead" : ""}">${escapeHtml(r.avgJobDisplay)}</div>
      <div class="dt-cell">${r.hoursPerJob != null ? r.hoursPerJob.toFixed(1) : "—"}</div>
      <div class="dt-cell strong ${r.onJobHours === lead.onJob ? "lead" : ""}">${fmtInt(r.onJobHours)}</div>
      <div class="dt-cell strong ${r.travelHours === lead.travel ? "lead" : ""}">${fmtInt(r.travelHours)}</div>
      <div class="dt-cell strong">${fmtInt(r.callbacks ?? 0)}</div>
    </div>
  `).join("");

  const year = String(ty.asOfDay).slice(0, 4);
  const asOf = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" })
    .format(new Date(`${ty.asOfDay}T12:00:00Z`)).toUpperCase();

  return `
    ${htmlHeader(`TECH STATS — ${year} YEAR TO DATE`)}
    <div class="slide-body">
      <div class="subhead">COMPLETED JOBS  ·  A JOB COUNTS FOR EVERY TECH ON IT  ·  UPDATED WEEKLY  ·  AS OF ${escapeHtml(asOf)}</div>
      <div class="dt dt-wide" style="--cols: 16% 13% 16% 12% 15% 14% 14%; top: 6%;">
        <div class="dt-row head">
          <div class="dt-cell left">TECH</div>
          <div class="dt-cell">JOB COUNT</div>
          <div class="dt-cell">AVG JOB SIZE</div>
          <div class="dt-cell">HRS / JOB</div>
          <div class="dt-cell">ON-JOB HRS</div>
          <div class="dt-cell">TRAVEL HRS</div>
          <div class="dt-cell">CALLBACKS</div>
        </div>
        ${bodyRows}
      </div>
      <div class="footer-banner" style="font-size: 0.8vw;">HOURS COME FROM THE ON MY WAY / START / FINISH BUTTONS  ·  MULTI-DAY JOBS AND MISSED BUTTONS ARE LEFT OUT OF HOURS  ·  CALLBACKS = JOBS TAGGED CALLBACK</div>
    </div>
    ${htmlFooter(slideLabel)}
  `;
}

function buildKPIsSlideHTML({ kpis }, slideLabel) {
  const tiles = [
    { label: "JOBS CLOSED",  value: String(kpis?.jobsClosed ?? 0),    sub: "LAST WEEK", cls: "yellow" },
    { label: "REVENUE",      value: kpis?.revenueDisplay ?? "$0",     sub: "LAST WEEK", cls: "green" },
    { label: "CALLBACKS",    value: String(kpis?.callbackCount ?? 0), sub: "LAST WEEK", cls: "red" },
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
      if (canvas) requestAnimationFrame(() => renderBarChart(canvas));

      const seconds = TIMINGS[idx];
      progressBar.style.transition = 'none';
      progressBar.style.width = '0%';
      progressBar.offsetWidth;
      progressBar.style.transition = 'width ' + seconds + 's linear';
      progressBar.style.width = '100%';

      clearTimeout(currentTimer);
      currentTimer = setTimeout(() => {
        const next = (currentIndex + 1) % slides.length;
        // End of a full rotation and the data is old enough: fetch a fresh page.
        if (next === 0 && Date.now() - LOADED_AT > REFRESH_MS) { hardReload(); return; }
        currentIndex = next;
        showSlide(currentIndex);
      }, seconds * 1000);
    }

    // The board rebuilds every ~10 minutes, so reload at the end of a rotation
    // once the page is older than that. TV browsers (Amazon Silk etc.) cache
    // HTML aggressively, so navigate to a unique URL rather than location.reload().
    const LOADED_AT = Date.now();
    const REFRESH_MS = 8 * 60 * 1000;
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

export async function renderHTML(data, outputPath) {
  // Slide order. A slide whose data failed to load is simply left out, so one
  // broken source never blanks the TV.
  const plan = [];
  plan.push({ key: "oncall", label: "ON CALL" });
  if (data.kpis)         plan.push({ key: "kpis",         label: "GOALS" });
  if (data.revenue)      plan.push({ key: "revenue",      label: "REVENUE BY TRUCK" });
  if (data.hcpButtons)   plan.push({ key: "buttons",      label: "HCP BUTTONS" });
  if (data.serviceAreas) plan.push({ key: "areas",        label: "SERVICE AREAS" });
  if (data.tagDurations && data.tagDurations.length > 0) {
    plan.push({ key: "tagdurations", label: "AVG TIMES" });
  }
  if (data.techYear)     plan.push({ key: "techyear",     label: "TECH STATS" });

  const total = plan.length;
  const labelFor = (i) =>
    `${plan[i].label}  /  ${String(i + 1).padStart(2, "0")}  OF  ${String(total).padStart(2, "0")}`;

  const slidesHTML = plan.map((item, i) => {
    const labelStr = labelFor(i);
    let inner = "";
    switch (item.key) {
      case "oncall":
        inner = buildOnCallSlideHTML({ onCall: data.onCall }, labelStr);
        break;
      case "kpis":
        inner = buildKPIsSlideHTML({ kpis: data.kpis }, labelStr);
        break;
      case "revenue":
        inner = buildRevenueSlideHTML({ revenue: data.revenue }, labelStr);
        break;
      case "buttons":
        inner = buildButtonsSlideHTML({ hcpButtons: data.hcpButtons }, labelStr);
        break;
      case "areas":
        inner = buildServiceAreasSlideHTML({ serviceAreas: data.serviceAreas }, labelStr);
        break;
      case "tagdurations":
        inner = buildTagDurationsSlideHTML({ tagDurations: data.tagDurations }, labelStr);
        break;
      case "techyear":
        inner = buildTechYearSlideHTML({ techYear: data.techYear }, labelStr);
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
  <title>Golden Rule — Shop Board — ${escapeHtml(data.weekOf.humanLabel)}</title>
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
