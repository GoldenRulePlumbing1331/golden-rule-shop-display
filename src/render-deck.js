import fs from "fs";
import path from "path";
import pptxgen from "pptxgenjs";
import React from "react";
import ReactDOMServer from "react-dom/server";
import sharp from "sharp";
import {
  FaPhone, FaCalendarAlt, FaBoxOpen, FaExchangeAlt,
  FaExclamationTriangle, FaTrophy, FaClipboardList,
  FaWrench, FaTruck, FaHardHat, FaBell, FaStar, FaArrowRight,
  FaMapMarkerAlt, FaShieldAlt, FaFire, FaEnvelope,
} from "react-icons/fa";

// ---------- Brand palette ----------
const NAVY_DARK   = "0F1E3A";
const NAVY        = "1B3358";
const STEEL       = "2C4A6B";
const STEEL_LIGHT = "E8EEF5";
const WHITE       = "FFFFFF";
const YELLOW      = "FFD000";
const RED_ALERT   = "D32F2F";
const GREEN_OK    = "2E7D32";
const GRAY_TEXT   = "4A5A70";
const GRAY_MUTED  = "7A8599";
const GRAY_LINE   = "D1D8E2";

// ---------- Logo ----------
let logoDataUri = null;
try {
  const logoPath = path.resolve("assets/logo.png");
  const buf = fs.readFileSync(logoPath);
  logoDataUri = "image/png;base64," + buf.toString("base64");
} catch (e) {
  console.warn("[render-deck] Could not load assets/logo.png — cover will skip the logo. Error:", e.message);
}

// ---------- Icon helpers ----------
function renderIconSvg(IconComponent, color, size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}
async function iconPng(IconComponent, color = "#FFFFFF", size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

// ---------- Formatters ----------
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
    MEETING:   NAVY,
    OPS:       STEEL,
    REQUIRED:  RED_ALERT,
    COMMUNITY: GREEN_OK,
  };
  return map[(category || "").toUpperCase()] || NAVY;
}

// ---------- Shared chrome ----------
function addHeaderBar(slide, pres, title, iconImg, accentColor = YELLOW) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.333, h: 0.85,
    fill: { color: NAVY_DARK }, line: { color: NAVY_DARK }
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.18, h: 0.85,
    fill: { color: accentColor }, line: { color: accentColor }
  });
  if (iconImg) {
    slide.addImage({ data: iconImg, x: 0.45, y: 0.22, w: 0.42, h: 0.42 });
  }
  slide.addText(title, {
    x: 1.0, y: 0.12, w: 9.5, h: 0.6,
    fontFace: "Arial Black", fontSize: 26, color: WHITE, bold: true,
    valign: "middle", margin: 0, charSpacing: 1
  });
  slide.addText([
    { text: "GOLDEN RULE", options: { bold: true, color: YELLOW } },
    { text: "  PLUMBING & CONTRACTING", options: { color: WHITE } }
  ], {
    x: 8.3, y: 0.18, w: 4.85, h: 0.5,
    fontFace: "Arial", fontSize: 10, align: "right", valign: "middle",
    margin: 0, charSpacing: 1
  });
}

function addFooter(slide, pres, slideLabel) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 7.15, w: 13.333, h: 0.35,
    fill: { color: NAVY_DARK }, line: { color: NAVY_DARK }
  });
  slide.addText("GOLDENRULEPH.COM  •  1331 POTTSTOWN PIKE, WEST CHESTER PA", {
    x: 0.4, y: 7.15, w: 8, h: 0.35,
    fontFace: "Arial", fontSize: 10, color: WHITE, bold: true,
    valign: "middle", margin: 0, charSpacing: 1
  });
  slide.addText(slideLabel, {
    x: 8.5, y: 7.15, w: 4.5, h: 0.35,
    fontFace: "Arial", fontSize: 10, color: YELLOW, bold: true,
    align: "right", valign: "middle", margin: 0, charSpacing: 1
  });
}

// ---------- Slide builders ----------

function buildCoverSlide(s, _pres, _icons, { weekHumanLabel, onCall }) {
  s.background = { color: NAVY_DARK };

  s.addShape("rect", {
    x: 0, y: 0, w: 13.333, h: 0.12,
    fill: { color: YELLOW }, line: { color: YELLOW }
  });

  s.addShape("rect", {
    x: -1, y: 6.4, w: 15, h: 1.1,
    fill: { color: YELLOW }, line: { color: YELLOW }
  });

  if (logoDataUri) {
    s.addImage({ data: logoDataUri, x: 0.6, y: 1.8, w: 3.6, h: 2.13 });
  } else {
    s.addText("GOLDEN RULE", {
      x: 0.6, y: 2.4, w: 3.6, h: 0.6,
      fontFace: "Arial Black", fontSize: 24, color: YELLOW, bold: true,
      align: "center", valign: "middle", margin: 0
    });
  }

  s.addText("GOLDEN RULE PLUMBING & CONTRACTING", {
    x: 0.6, y: 0.9, w: 12, h: 0.4,
    fontFace: "Arial", fontSize: 14, color: STEEL_LIGHT, bold: true,
    valign: "middle", margin: 0, charSpacing: 4
  });

  s.addText("SHOP", {
    x: 4.5, y: 1.3, w: 8.3, h: 1.2,
    fontFace: "Arial Black", fontSize: 90, color: WHITE, bold: true,
    valign: "middle", margin: 0, charSpacing: 4
  });
  s.addText("BRIEFING", {
    x: 4.5, y: 2.4, w: 8.3, h: 1.2,
    fontFace: "Arial Black", fontSize: 90, color: YELLOW, bold: true,
    valign: "middle", margin: 0, charSpacing: 4
  });

  s.addText(`WEEK OF  ${weekHumanLabel.toUpperCase()}`, {
    x: 4.5, y: 3.7, w: 8.3, h: 0.5,
    fontFace: "Arial", fontSize: 22, color: STEEL_LIGHT, bold: true,
    valign: "middle", margin: 0, charSpacing: 3
  });

  s.addText("WEST CHESTER, PA", {
    x: 4.5, y: 4.4, w: 8.3, h: 0.4,
    fontFace: "Arial", fontSize: 13, color: GRAY_MUTED, bold: true,
    valign: "middle", margin: 0, charSpacing: 3
  });

  const dispatcher = onCall?.dispatcher || "[ NOT SET ]";
  const materialRuns = onCall?.materialRuns || "[ NOT SET ]";
  s.addText(
    `DISPATCH:  ${dispatcher.toUpperCase()}     |     MATERIAL RUNS:  ${materialRuns.toUpperCase()}`,
    {
      x: 0, y: 6.4, w: 13.333, h: 1.1,
      fontFace: "Arial Black", fontSize: 28, color: NAVY_DARK, bold: true,
      align: "center", valign: "middle", margin: 0, charSpacing: 2
    }
  );
}

async function buildOnCallSlide(s, pres, icons, { onCall }, slideLabel) {
  s.background = { color: STEEL_LIGHT };
  addHeaderBar(s, pres, "ON CALL THIS WEEK", icons.phoneYellow);

  s.addShape("rect", { x: 0.5, y: 1.2, w: 6.0, h: 5.6, fill: { color: NAVY_DARK }, line: { color: NAVY_DARK } });
  s.addShape("rect", { x: 0.5, y: 1.2, w: 0.14, h: 5.6, fill: { color: YELLOW }, line: { color: YELLOW } });

  s.addText("PRIMARY TECH", {
    x: 0.85, y: 1.45, w: 5.5, h: 0.4,
    fontFace: "Arial", fontSize: 14, color: YELLOW, bold: true,
    valign: "middle", margin: 0, charSpacing: 3
  });

  const techName = onCall?.primaryName || "[ NOT SET ]";
  s.addText(techName, {
    x: 0.85, y: 1.9, w: 5.5, h: 1.2,
    fontFace: "Arial Black", fontSize: 40, color: WHITE, bold: true,
    valign: "middle", margin: 0
  });

  s.addImage({ data: icons.phoneYellowSm, x: 0.85, y: 3.4, w: 0.32, h: 0.32 });
  s.addText(formatPhone(onCall?.primaryMobile) || "(no number on file)", {
    x: 1.3, y: 3.35, w: 5.0, h: 0.4,
    fontFace: "Arial", fontSize: 18, color: WHITE, bold: true,
    valign: "middle", margin: 0
  });

  s.addImage({ data: icons.envelopeYellow, x: 0.85, y: 3.95, w: 0.32, h: 0.32 });
  s.addText(onCall?.primaryEmail || "(no email on file)", {
    x: 1.3, y: 3.9, w: 5.0, h: 0.4,
    fontFace: "Arial", fontSize: 14, color: WHITE,
    valign: "middle", margin: 0
  });

  s.addShape("line", { x: 0.85, y: 4.7, w: 5.3, h: 0, line: { color: STEEL, width: 1 } });

  s.addText("DISPATCH / OFFICE", {
    x: 0.85, y: 4.9, w: 5.5, h: 0.35,
    fontFace: "Arial", fontSize: 12, color: YELLOW, bold: true,
    valign: "middle", margin: 0, charSpacing: 3
  });
  s.addText(onCall?.dispatcher || "[ NOT SET ]", {
    x: 0.85, y: 5.2, w: 5.5, h: 0.5,
    fontFace: "Arial Black", fontSize: 28, color: WHITE, bold: true,
    valign: "middle", margin: 0
  });

  s.addShape("rect", { x: 6.85, y: 1.2, w: 6.0, h: 5.6, fill: { color: YELLOW }, line: { color: YELLOW } });
  s.addImage({ data: icons.phoneNavy, x: 9.45, y: 1.5, w: 0.8, h: 0.8 });
  s.addText("EMERGENCY LINE", {
    x: 6.85, y: 2.4, w: 6.0, h: 0.5,
    fontFace: "Arial Black", fontSize: 22, color: NAVY_DARK, bold: true,
    align: "center", valign: "middle", margin: 0, charSpacing: 4
  });
  s.addText("(610) 269-0299", {
    x: 6.85, y: 3.0, w: 6.0, h: 1.2,
    fontFace: "Arial Black", fontSize: 48, color: NAVY_DARK, bold: true,
    align: "center", valign: "middle", margin: 0
  });
  s.addText("24 / 7", {
    x: 6.85, y: 4.3, w: 6.0, h: 1.1,
    fontFace: "Arial Black", fontSize: 60, color: NAVY_DARK, bold: true,
    align: "center", valign: "middle", margin: 0, charSpacing: 6
  });
  s.addShape("line", { x: 7.5, y: 5.7, w: 4.7, h: 0, line: { color: NAVY_DARK, width: 2 } });
  s.addText("ANSWER WITHIN 3 RINGS", {
    x: 6.85, y: 5.85, w: 6.0, h: 0.4,
    fontFace: "Arial", fontSize: 16, color: NAVY_DARK, bold: true,
    align: "center", valign: "middle", margin: 0, charSpacing: 2
  });
  s.addText("Log every call in HCP before dispatch", {
    x: 6.85, y: 6.25, w: 6.0, h: 0.4,
    fontFace: "Arial", fontSize: 13, color: NAVY_DARK, italic: true,
    align: "center", valign: "middle", margin: 0
  });

  addFooter(s, pres, slideLabel);
}

function buildEventsSlide(s, pres, icons, { events }, slideLabel) {
  s.background = { color: STEEL_LIGHT };
  addHeaderBar(s, pres, "UPCOMING EVENTS & DEADLINES", icons.calendar);

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
    cards.push({ day: "—", date: "", title: "(no event)", time: "", tag: "—", tagColor: GRAY_MUTED });
  }

  const positions = [
    { x: 0.5,  y: 1.2 },
    { x: 6.92, y: 1.2 },
    { x: 0.5,  y: 4.15 },
    { x: 6.92, y: 4.15 },
  ];

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const p = positions[i];
    const cardW = 5.91, cardH = 2.8;
    s.addShape("rect", {
      x: p.x, y: p.y, w: cardW, h: cardH,
      fill: { color: WHITE }, line: { color: GRAY_LINE, width: 1 },
      shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 90, opacity: 0.08 }
    });
    s.addShape("rect", { x: p.x, y: p.y, w: 1.5, h: cardH, fill: { color: NAVY_DARK }, line: { color: NAVY_DARK } });
    s.addText(c.day, {
      x: p.x, y: p.y + 0.4, w: 1.5, h: 0.5,
      fontFace: "Arial Black", fontSize: 24, color: YELLOW, bold: true,
      align: "center", valign: "middle", margin: 0, charSpacing: 3
    });
    s.addText(c.date, {
      x: p.x, y: p.y + 0.9, w: 1.5, h: 1.4,
      fontFace: "Arial Black", fontSize: 56, color: WHITE, bold: true,
      align: "center", valign: "middle", margin: 0
    });
    s.addShape("rect", {
      x: p.x + 1.75, y: p.y + 0.3, w: 1.6, h: 0.35,
      fill: { color: c.tagColor }, line: { color: c.tagColor }
    });
    s.addText(c.tag, {
      x: p.x + 1.75, y: p.y + 0.3, w: 1.6, h: 0.35,
      fontFace: "Arial", fontSize: 10, color: WHITE, bold: true,
      align: "center", valign: "middle", margin: 0, charSpacing: 2
    });
    s.addText(c.title, {
      x: p.x + 1.75, y: p.y + 0.85, w: 4.0, h: 1.0,
      fontFace: "Arial Black", fontSize: 18, color: NAVY_DARK, bold: true,
      valign: "top", margin: 0
    });
    s.addText(c.time, {
      x: p.x + 1.75, y: p.y + 2.1, w: 4.0, h: 0.45,
      fontFace: "Arial", fontSize: 14, color: GRAY_TEXT, bold: true,
      valign: "middle", margin: 0
    });
  }
  addFooter(s, pres, slideLabel);
}

function buildNewItemsSlide(s, pres, icons, { newItems }, slideLabel) {
  s.background = { color: STEEL_LIGHT };
  addHeaderBar(s, pres, "NEW IN THE SHOP", icons.boxOpen);
  s.addText("RECENTLY ADDED — KNOW WHERE TO FIND IT, KNOW HOW TO USE IT", {
    x: 0.5, y: 1.05, w: 12.3, h: 0.45,
    fontFace: "Arial", fontSize: 13, color: GRAY_MUTED, bold: true,
    valign: "middle", margin: 0, charSpacing: 2
  });

  const cards = [...newItems];
  while (cards.length < 3) cards.push(null);

  const cardW = 4.0, cardH = 5.2, gap = 0.22;
  const startX = 0.5 + (13.333 - 1.0 - (3 * cardW + 2 * gap)) / 2;

  for (let i = 0; i < 3; i++) {
    const it = cards[i];
    const x = startX + i * (cardW + gap);
    const y = 1.6;

    s.addShape("rect", {
      x, y, w: cardW, h: cardH,
      fill: { color: WHITE }, line: { color: GRAY_LINE, width: 1 },
      shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 90, opacity: 0.08 }
    });
    s.addShape("rect", { x, y, w: cardW, h: 2.0, fill: { color: YELLOW }, line: { color: YELLOW } });
    s.addImage({ data: icons.wrenchNavy, x: x + cardW/2 - 0.5, y: y + 0.55, w: 1.0, h: 1.0 });
    s.addText("[ PHOTO ]", {
      x, y: y + 1.55, w: cardW, h: 0.4,
      fontFace: "Arial", fontSize: 11, color: NAVY_DARK, bold: true,
      align: "center", valign: "middle", margin: 0, charSpacing: 3
    });

    if (it) {
      s.addShape("rect", {
        x: x + cardW - 0.95, y: y + 0.2, w: 0.8, h: 0.35,
        fill: { color: NAVY_DARK }, line: { color: NAVY_DARK }
      });
      s.addText("NEW", {
        x: x + cardW - 0.95, y: y + 0.2, w: 0.8, h: 0.35,
        fontFace: "Arial Black", fontSize: 12, color: YELLOW, bold: true,
        align: "center", valign: "middle", margin: 0, charSpacing: 3
      });
    }

    s.addText(it ? it.name.toUpperCase() : "(no new item)", {
      x: x + 0.25, y: y + 2.15, w: cardW - 0.5, h: 0.55,
      fontFace: "Arial Black", fontSize: 16, color: NAVY_DARK, bold: true,
      valign: "middle", margin: 0
    });

    s.addText(it ? (it.category || "") : "", {
      x: x + 0.25, y: y + 2.7, w: cardW - 0.5, h: 0.35,
      fontFace: "Arial", fontSize: 11, color: GRAY_MUTED, bold: true,
      valign: "middle", margin: 0, charSpacing: 2
    });

    s.addShape("line", { x: x + 0.25, y: y + 3.1, w: cardW - 0.5, h: 0, line: { color: GRAY_LINE, width: 1 } });

    s.addImage({ data: icons.mapPinNavy, x: x + 0.25, y: y + 3.25, w: 0.3, h: 0.3 });
    s.addText("LOCATION", {
      x: x + 0.65, y: y + 3.22, w: cardW - 0.9, h: 0.3,
      fontFace: "Arial", fontSize: 10, color: GRAY_MUTED, bold: true,
      valign: "middle", margin: 0, charSpacing: 2
    });
    s.addText(it ? it.location : "—", {
      x: x + 0.25, y: y + 3.55, w: cardW - 0.5, h: 0.4,
      fontFace: "Arial", fontSize: 14, color: NAVY_DARK, bold: true,
      valign: "middle", margin: 0
    });

    s.addText(it ? it.notes : "", {
      x: x + 0.25, y: y + 4.05, w: cardW - 0.5, h: 1.0,
      fontFace: "Arial", fontSize: 11, color: GRAY_TEXT,
      valign: "top", margin: 0
    });
  }

  addFooter(s, pres, slideLabel);
}

function buildMovedItemsSlide(s, pres, icons, { movedItems }, slideLabel) {
  s.background = { color: STEEL_LIGHT };
  addHeaderBar(s, pres, "MOVED & REARRANGED", icons.exchange);
  s.addText("IF YOU CAN'T FIND SOMETHING — CHECK HERE FIRST", {
    x: 0.5, y: 1.05, w: 12.3, h: 0.45,
    fontFace: "Arial", fontSize: 13, color: GRAY_MUTED, bold: true,
    valign: "middle", margin: 0, charSpacing: 2
  });

  const rows = [...movedItems];
  while (rows.length < 3) rows.push(null);

  const rowH = 1.55;
  const startY = 1.7;
  for (let i = 0; i < 3; i++) {
    const m = rows[i];
    const y = startY + i * (rowH + 0.15);
    s.addShape("rect", {
      x: 0.5, y, w: 12.333, h: rowH,
      fill: { color: WHITE }, line: { color: GRAY_LINE, width: 1 },
      shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 90, opacity: 0.06 }
    });
    s.addShape("rect", { x: 0.5, y, w: 0.14, h: rowH, fill: { color: YELLOW }, line: { color: YELLOW } });

    s.addText(m ? m.name.toUpperCase() : "(no moved item)", {
      x: 0.85, y: y + 0.1, w: 3.5, h: rowH - 0.2,
      fontFace: "Arial Black", fontSize: 18, color: NAVY_DARK, bold: true,
      valign: "middle", margin: 0
    });

    s.addShape("rect", { x: 4.5, y: y + 0.25, w: 3.3, h: rowH - 0.5,
      fill: { color: STEEL_LIGHT }, line: { color: GRAY_LINE, width: 1 } });
    s.addText("OLD LOCATION", {
      x: 4.6, y: y + 0.35, w: 3.1, h: 0.3,
      fontFace: "Arial", fontSize: 10, color: GRAY_MUTED, bold: true,
      valign: "middle", margin: 0, charSpacing: 2
    });
    s.addText(m ? m.oldLocation : "—", {
      x: 4.6, y: y + 0.65, w: 3.1, h: 0.5,
      fontFace: "Arial", fontSize: 15, color: GRAY_TEXT, bold: true,
      valign: "middle", margin: 0
    });

    s.addImage({ data: icons.arrowYellow, x: 7.95, y: y + 0.55, w: 0.5, h: 0.5 });

    s.addShape("rect", { x: 8.6, y: y + 0.25, w: 4.1, h: rowH - 0.5,
      fill: { color: NAVY_DARK }, line: { color: NAVY_DARK } });
    s.addText("NEW LOCATION", {
      x: 8.7, y: y + 0.35, w: 3.9, h: 0.3,
      fontFace: "Arial", fontSize: 10, color: YELLOW, bold: true,
      valign: "middle", margin: 0, charSpacing: 2
    });
    s.addText(m ? m.newLocation : "—", {
      x: 8.7, y: y + 0.65, w: 3.9, h: 0.5,
      fontFace: "Arial", fontSize: 15, color: WHITE, bold: true,
      valign: "middle", margin: 0
    });
  }

  s.addShape("rect", { x: 0.5, y: 6.55, w: 12.333, h: 0.5, fill: { color: YELLOW }, line: { color: YELLOW } });
  s.addText("UPDATE HCP INVENTORY LOCATIONS WHEN ITEMS MOVE", {
    x: 0.5, y: 6.55, w: 12.333, h: 0.5,
    fontFace: "Arial Black", fontSize: 14, color: NAVY_DARK, bold: true,
    align: "center", valign: "middle", margin: 0, charSpacing: 3
  });

  addFooter(s, pres, slideLabel);
}

function buildJobBoardSlide(s, pres, icons, { jobBoard }, slideLabel) {
  s.background = { color: STEEL_LIGHT };
  addHeaderBar(s, pres, "THIS WEEK'S JOB BOARD", icons.clipboard);

  const leftX = 0.5, leftW = 8.3;
  const rightX = 9.0, rightW = 3.83;

  s.addShape("rect", { x: leftX, y: 1.15, w: leftW, h: 5.85,
    fill: { color: WHITE }, line: { color: GRAY_LINE, width: 1 },
    shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 90, opacity: 0.08 } });
  s.addText("MAJOR JOBS — THIS WEEK", {
    x: leftX + 0.3, y: 1.35, w: leftW - 0.6, h: 0.45,
    fontFace: "Arial Black", fontSize: 18, color: NAVY_DARK, bold: true,
    valign: "middle", margin: 0, charSpacing: 2
  });
  s.addShape("line", { x: leftX + 0.3, y: 1.85, w: leftW - 0.6, h: 0, line: { color: YELLOW, width: 3 } });

  const days = ["MON", "TUE", "WED", "THU", "FRI"];
  const jobStartY = 2.05;
  const jobRowH = 0.92;

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const j = jobBoard?.majors?.[day] || null;
    const y = jobStartY + i * jobRowH;

    if (i % 2 === 0) {
      s.addShape("rect", {
        x: leftX + 0.3, y, w: leftW - 0.6, h: jobRowH - 0.05,
        fill: { color: STEEL_LIGHT }, line: { color: STEEL_LIGHT }
      });
    }

    s.addShape("rect", { x: leftX + 0.4, y: y + 0.2, w: 0.7, h: 0.45,
      fill: { color: NAVY_DARK }, line: { color: NAVY_DARK } });
    s.addText(day, {
      x: leftX + 0.4, y: y + 0.2, w: 0.7, h: 0.45,
      fontFace: "Arial Black", fontSize: 13, color: YELLOW, bold: true,
      align: "center", valign: "middle", margin: 0, charSpacing: 2
    });

    s.addText(j ? "TOP JOB" : "", {
      x: leftX + 1.25, y: y + 0.08, w: 3.8, h: 0.35,
      fontFace: "Arial", fontSize: 11, color: GRAY_MUTED, bold: true,
      valign: "middle", margin: 0, charSpacing: 1
    });
    s.addText(j ? j.description.slice(0, 60) : "(no scheduled work)", {
      x: leftX + 1.25, y: y + 0.4, w: 3.8, h: 0.4,
      fontFace: "Arial Black", fontSize: 14, color: NAVY_DARK, bold: true,
      valign: "middle", margin: 0
    });

    s.addText(j ? j.techDisplay : "", {
      x: leftX + 5.15, y: y + 0.2, w: 1.5, h: 0.45,
      fontFace: "Arial", fontSize: 12, color: GRAY_TEXT, bold: true,
      align: "center", valign: "middle", margin: 0
    });
    s.addText(j ? j.durationLabel : "", {
      x: leftX + 6.7, y: y + 0.2, w: 1.3, h: 0.45,
      fontFace: "Arial", fontSize: 13, color: NAVY_DARK, bold: true,
      align: "right", valign: "middle", margin: 0
    });
  }

  const statCard = (x, y, label, value, accent = YELLOW) => {
    s.addShape("rect", { x, y, w: rightW, h: 1.8,
      fill: { color: WHITE }, line: { color: GRAY_LINE, width: 1 },
      shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 90, opacity: 0.06 } });
    s.addShape("rect", { x, y, w: rightW, h: 0.12, fill: { color: accent }, line: { color: accent } });
    s.addText(label, {
      x: x + 0.2, y: y + 0.25, w: rightW - 0.4, h: 0.35,
      fontFace: "Arial", fontSize: 11, color: GRAY_MUTED, bold: true,
      valign: "middle", margin: 0, charSpacing: 2
    });
    s.addText(value, {
      x: x + 0.2, y: y + 0.6, w: rightW - 0.4, h: 1.1,
      fontFace: "Arial Black", fontSize: 56, color: NAVY_DARK, bold: true,
      valign: "middle", margin: 0
    });
  };

  const counts = jobBoard?.counts || { open: 0, inProgress: 0, total: 0 };
  statCard(rightX, 1.15, "OPEN JOBS",      String(counts.open),       YELLOW);
  statCard(rightX, 3.10, "IN PROGRESS",    String(counts.inProgress), NAVY_DARK);
  statCard(rightX, 5.05, "TOTAL THIS WK",  String(counts.total),      RED_ALERT);

  s.addText("PULLED LIVE FROM HCP", {
    x: rightX, y: 6.9, w: rightW, h: 0.25,
    fontFace: "Arial", fontSize: 9, color: GRAY_MUTED, italic: true,
    align: "center", valign: "middle", margin: 0
  });

  addFooter(s, pres, slideLabel);
}

function buildTagDurationsSlide(s, pres, icons, { tagDurations }, slideLabel) {
  s.background = { color: STEEL_LIGHT };
  addHeaderBar(s, pres, "AVERAGE JOB TIME — BY CATEGORY", icons.clipboard);

  s.addText("MEDIAN DURATION OF COMPLETED JOBS — LAST 30 DAYS", {
    x: 0.5, y: 1.05, w: 12.3, h: 0.45,
    fontFace: "Arial", fontSize: 13, color: GRAY_MUTED, bold: true,
    valign: "middle", margin: 0, charSpacing: 2
  });

  const colW = 6.0;
  const colGap = 0.33;
  const rowH = 1.1;
  const startY = 1.7;
  const leftX = 0.5;
  const rightX = leftX + colW + colGap;

  const rows = (tagDurations || []).slice(0, 8);

  for (let i = 0; i < 8; i++) {
    const r = rows[i] || null;
    const col = i % 2;
    const rowIdx = Math.floor(i / 2);
    const x = col === 0 ? leftX : rightX;
    const y = startY + rowIdx * (rowH + 0.15);

    s.addShape("rect", {
      x, y, w: colW, h: rowH,
      fill: { color: WHITE }, line: { color: GRAY_LINE, width: 1 },
      shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 90, opacity: 0.06 }
    });

    s.addShape("rect", {
      x, y, w: 0.14, h: rowH,
      fill: { color: YELLOW }, line: { color: YELLOW }
    });

    if (r) {
      s.addText(r.tag.toUpperCase(), {
        x: x + 0.35, y: y + 0.15, w: colW * 0.55, h: rowH - 0.3,
        fontFace: "Arial Black", fontSize: 18, color: NAVY_DARK, bold: true,
        valign: "middle", margin: 0
      });

      s.addText(r.medianLabel, {
        x: x + colW * 0.55, y: y + 0.1, w: colW * 0.3, h: rowH - 0.2,
        fontFace: "Arial Black", fontSize: 24, color: NAVY_DARK, bold: true,
        align: "right", valign: "middle", margin: 0
      });

      s.addText(`n = ${r.sampleCount}`, {
        x: x + colW * 0.55, y: y + 0.65, w: colW * 0.4, h: 0.35,
        fontFace: "Arial", fontSize: 10, color: GRAY_MUTED, bold: true,
        align: "right", valign: "middle", margin: 0, charSpacing: 1
      });
    } else {
      s.addText("—", {
        x: x + 0.35, y, w: colW - 0.5, h: rowH,
        fontFace: "Arial", fontSize: 14, color: GRAY_MUTED,
        valign: "middle", margin: 0
      });
    }
  }

  s.addShape("rect", { x: 0.5, y: 6.55, w: 12.333, h: 0.5,
    fill: { color: NAVY_DARK }, line: { color: NAVY_DARK } });
  s.addText("HITTING START + FINISH IN HCP IS WHAT MAKES THIS DATA POSSIBLE", {
    x: 0.5, y: 6.55, w: 12.333, h: 0.5,
    fontFace: "Arial Black", fontSize: 13, color: YELLOW, bold: true,
    align: "center", valign: "middle", margin: 0, charSpacing: 2
  });

  addFooter(s, pres, slideLabel);
}

function buildTimeTrackingSlide(s, pres, icons, { hygiene }, slideLabel) {
  s.background = { color: STEEL_LIGHT };
  addHeaderBar(s, pres, "TIME TRACKING — HCP BUTTONS", icons.bell);

  s.addText("ON MY WAY  /  START  /  FINISH  —  COMPLIANCE BY TECH", {
    x: 0.5, y: 1.05, w: 12.3, h: 0.45,
    fontFace: "Arial", fontSize: 13, color: GRAY_MUTED, bold: true,
    valign: "middle", margin: 0, charSpacing: 2
  });

  if (!hygiene || !hygiene.last7 || hygiene.last7.length === 0) {
    s.addText("(no compliance data available)", {
      x: 0.5, y: 3.5, w: 12.3, h: 0.6,
      fontFace: "Arial", fontSize: 18, color: GRAY_MUTED,
      align: "center", valign: "middle", margin: 0
    });
    addFooter(s, pres, slideLabel);
    return;
  }

  // Build the union of techs from both windows
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

  const tableX = 0.5, tableW = 12.333;
  const tableY = 1.5;
  const headerH = 0.4;
  const rowH = 0.36;
  const visibleRows = Math.min(allRows.length, 11);

  const colTech = 2.4;
  const col30Block = 4.4;
  const col7Block = 4.4;
  const colJobs = 1.0;

  s.addShape("rect", {
    x: tableX, y: tableY, w: tableW, h: headerH,
    fill: { color: NAVY_DARK }, line: { color: NAVY_DARK }
  });

  s.addText("TECH", {
    x: tableX + 0.15, y: tableY, w: colTech - 0.15, h: headerH,
    fontFace: "Arial Black", fontSize: 12, color: YELLOW, bold: true,
    valign: "middle", margin: 0, charSpacing: 2
  });

  const x30 = tableX + colTech;
  s.addShape("rect", {
    x: x30, y: tableY, w: col30Block, h: headerH,
    fill: { color: NAVY }, line: { color: NAVY }
  });
  s.addText("LAST 30 DAYS", {
    x: x30, y: tableY, w: col30Block, h: headerH,
    fontFace: "Arial Black", fontSize: 11, color: YELLOW, bold: true,
    align: "center", valign: "middle", margin: 0, charSpacing: 3
  });

  const x7 = x30 + col30Block;
  s.addShape("rect", {
    x: x7, y: tableY, w: col7Block, h: headerH,
    fill: { color: STEEL }, line: { color: STEEL }
  });
  s.addText("LAST 7 DAYS", {
    x: x7, y: tableY, w: col7Block, h: headerH,
    fontFace: "Arial Black", fontSize: 11, color: YELLOW, bold: true,
    align: "center", valign: "middle", margin: 0, charSpacing: 3
  });

  const xJobs = x7 + col7Block;
  s.addText("# JOBS", {
    x: xJobs, y: tableY, w: colJobs, h: headerH,
    fontFace: "Arial Black", fontSize: 11, color: YELLOW, bold: true,
    align: "center", valign: "middle", margin: 0, charSpacing: 2
  });

  const subY = tableY + headerH;
  const subH = 0.26;
  s.addShape("rect", {
    x: tableX, y: subY, w: tableW, h: subH,
    fill: { color: STEEL_LIGHT }, line: { color: GRAY_LINE, width: 1 }
  });
  const subFor = (xStart, blockW) => {
    const labels = ["OMW", "START", "FINISH"];
    const colW = blockW / 3;
    for (let i = 0; i < 3; i++) {
      s.addText(labels[i], {
        x: xStart + i * colW, y: subY, w: colW, h: subH,
        fontFace: "Arial", fontSize: 9, color: GRAY_TEXT, bold: true,
        align: "center", valign: "middle", margin: 0, charSpacing: 2
      });
    }
  };
  subFor(x30, col30Block);
  subFor(x7, col7Block);

  const cellColor = (pct) => {
    if (pct === null) return STEEL_LIGHT;
    if (pct >= 95) return "C8E6C9";
    if (pct >= 80) return "FFF9C4";
    return "FFCDD2";
  };
  const cellTextColor = (pct) => {
    if (pct === null) return GRAY_MUTED;
    if (pct >= 80) return NAVY_DARK;
    return RED_ALERT;
  };
  const fmtPct = (pct) => pct === null ? "—" : `${pct}%`;

  const bodyY = subY + subH;
  for (let i = 0; i < visibleRows; i++) {
    const row = allRows[i];
    const y = bodyY + i * rowH;

    if (i % 2 === 0) {
      s.addShape("rect", {
        x: tableX, y, w: tableW, h: rowH,
        fill: { color: WHITE }, line: { color: GRAY_LINE, width: 1 }
      });
    } else {
      s.addShape("rect", {
        x: tableX, y, w: tableW, h: rowH,
        fill: { color: STEEL_LIGHT }, line: { color: GRAY_LINE, width: 1 }
      });
    }

    const displayName = row.d30?.displayName || row.d7?.displayName || "—";
    s.addText(displayName, {
      x: tableX + 0.15, y, w: colTech - 0.15, h: rowH,
      fontFace: "Arial Black", fontSize: 12, color: NAVY_DARK, bold: true,
      valign: "middle", margin: 0
    });

    const drawTriple = (xStart, blockW, stats) => {
      const cellW = blockW / 3;
      const pcts = stats ? [stats.omwPct, stats.startPct, stats.finishPct] : [null, null, null];
      for (let j = 0; j < 3; j++) {
        const cx = xStart + j * cellW;
        const cellPad = 0.05;
        s.addShape("rect", {
          x: cx + cellPad, y: y + cellPad, w: cellW - cellPad * 2, h: rowH - cellPad * 2,
          fill: { color: cellColor(pcts[j]) }, line: { color: cellColor(pcts[j]) }
        });
        s.addText(fmtPct(pcts[j]), {
          x: cx, y, w: cellW, h: rowH,
          fontFace: "Arial Black", fontSize: 12, color: cellTextColor(pcts[j]), bold: true,
          align: "center", valign: "middle", margin: 0
        });
      }
    };
    drawTriple(x30, col30Block, row.d30);
    drawTriple(x7, col7Block, row.d7);

    s.addText(String(row.d30?.totalJobs ?? "—"), {
      x: xJobs, y, w: colJobs, h: rowH,
      fontFace: "Arial", fontSize: 12, color: GRAY_TEXT, bold: true,
      align: "center", valign: "middle", margin: 0
    });
  }

  const leader = hygiene.leader;
  const flagged = hygiene.flagged || [];

  const footerY = 6.55;
  s.addShape("rect", {
    x: 0.5, y: footerY, w: 12.333, h: 0.5,
    fill: { color: leader ? YELLOW : NAVY_DARK },
    line: { color: leader ? YELLOW : NAVY_DARK }
  });

  if (leader) {
    let text = `★ THIS WEEK'S LEADER:  ${leader.displayName.toUpperCase()}  —  ${leader.overallPct}%  OVERALL`;
    if (flagged.length > 0) {
      text += `     ·     ${flagged.length} TECH${flagged.length > 1 ? "S" : ""} BELOW 80% (30-DAY)`;
    }
    s.addText(text, {
      x: 0.5, y: footerY, w: 12.333, h: 0.5,
      fontFace: "Arial Black", fontSize: 13, color: NAVY_DARK, bold: true,
      align: "center", valign: "middle", margin: 0, charSpacing: 2
    });
  } else {
    s.addText("HIT YOUR BUTTONS — IT'S HOW THIS DATA HAPPENS", {
      x: 0.5, y: footerY, w: 12.333, h: 0.5,
      fontFace: "Arial Black", fontSize: 13, color: YELLOW, bold: true,
      align: "center", valign: "middle", margin: 0, charSpacing: 2
    });
  }

  addFooter(s, pres, slideLabel);
}

function buildSafetySlide(s, pres, icons, { safetyTopic }, slideLabel) {
  s.background = { color: STEEL_LIGHT };
  addHeaderBar(s, pres, "SAFETY & SHOP REMINDERS", icons.alert);

  s.addShape("rect", { x: 0.5, y: 1.15, w: 6.0, h: 5.85, fill: { color: NAVY_DARK }, line: { color: NAVY_DARK } });
  s.addShape("rect", { x: 0.5, y: 1.15, w: 0.14, h: 5.85, fill: { color: YELLOW }, line: { color: YELLOW } });
  s.addImage({ data: icons.shield, x: 0.9, y: 1.45, w: 0.65, h: 0.65 });
  s.addText("SAFETY TOPIC OF THE WEEK", {
    x: 1.7, y: 1.45, w: 4.5, h: 0.4,
    fontFace: "Arial", fontSize: 12, color: YELLOW, bold: true,
    valign: "middle", margin: 0, charSpacing: 3
  });
  s.addText((safetyTopic.headline || "").toUpperCase(), {
    x: 1.7, y: 1.85, w: 4.5, h: 0.45,
    fontFace: "Arial Black", fontSize: 22, color: WHITE, bold: true,
    valign: "middle", margin: 0
  });
  s.addShape("line", { x: 0.9, y: 2.55, w: 5.3, h: 0, line: { color: STEEL, width: 1 } });

  const bulletObjs = (safetyTopic.bullets || []).map((b, i, arr) => ({
    text: b,
    options: { bullet: true, breakLine: i < arr.length - 1 },
  }));
  if (bulletObjs.length === 0) {
    bulletObjs.push({ text: "(no bullets provided)", options: { bullet: true } });
  }
  s.addText(bulletObjs, {
    x: 0.9, y: 2.75, w: 5.3, h: 3.2,
    fontFace: "Arial", fontSize: 14, color: WHITE,
    paraSpaceAfter: 10, margin: 0
  });

  s.addShape("rect", { x: 0.9, y: 6.15, w: 5.3, h: 0.65, fill: { color: YELLOW }, line: { color: YELLOW } });
  s.addText("QUESTIONS?  ASK YOUR LEAD BEFORE YOU START THE JOB", {
    x: 0.9, y: 6.15, w: 5.3, h: 0.65,
    fontFace: "Arial Black", fontSize: 11, color: NAVY_DARK, bold: true,
    align: "center", valign: "middle", margin: 0, charSpacing: 2
  });

  const tiles = [
    { icon: icons.truck,    label: "VAN CHECK",         text: "Walk-around + fluids — every Monday AM" },
    { icon: icons.hardHat,  label: "PPE",               text: "Boots, eyes, gloves, hard hat on every job" },
    { icon: icons.bell,     label: "HCP UPDATES",       text: "Close job + notes before leaving the site" },
    { icon: icons.wrench,   label: "TOOL ACCOUNTABILITY", text: "Scan in/out of the crib — no exceptions" },
  ];
  const tileX = 6.85, tileW = 6.0, tileH = 1.35, tileGap = 0.12;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const y = 1.15 + i * (tileH + tileGap);
    s.addShape("rect", { x: tileX, y, w: tileW, h: tileH,
      fill: { color: WHITE }, line: { color: GRAY_LINE, width: 1 },
      shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 90, opacity: 0.06 } });
    s.addShape("rect", { x: tileX, y, w: 1.2, h: tileH, fill: { color: YELLOW }, line: { color: YELLOW } });
    s.addImage({ data: t.icon, x: tileX + 0.35, y: y + tileH/2 - 0.3, w: 0.5, h: 0.5 });
    s.addText(t.label, {
      x: tileX + 1.4, y: y + 0.2, w: tileW - 1.6, h: 0.4,
      fontFace: "Arial Black", fontSize: 16, color: NAVY_DARK, bold: true,
      valign: "middle", margin: 0, charSpacing: 2
    });
    s.addText(t.text, {
      x: tileX + 1.4, y: y + 0.65, w: tileW - 1.6, h: 0.6,
      fontFace: "Arial", fontSize: 12, color: GRAY_TEXT,
      valign: "top", margin: 0
    });
  }

  addFooter(s, pres, slideLabel);
}

function buildShoutoutSlide(s, pres, icons, { shoutout }, slideLabel) {
  s.background = { color: STEEL_LIGHT };
  addHeaderBar(s, pres, "SHOUTOUTS", icons.trophy);

  s.addShape("rect", { x: 0.5, y: 1.15, w: 12.333, h: 5.85,
    fill: { color: NAVY_DARK }, line: { color: NAVY_DARK } });
  s.addShape("rect", { x: 0.5, y: 1.15, w: 12.333, h: 0.14,
    fill: { color: YELLOW }, line: { color: YELLOW } });

  s.addText("TECH OF THE WEEK", {
    x: 0.5, y: 1.5, w: 12.333, h: 0.4,
    fontFace: "Arial", fontSize: 14, color: YELLOW, bold: true,
    align: "center", valign: "middle", margin: 0, charSpacing: 4
  });

  const starsW = 5 * 0.55 + 4 * 0.12;
  const starsX = (13.333 - starsW) / 2;
  for (let i = 0; i < 5; i++) {
    s.addImage({ data: icons.starYellow,
      x: starsX + i * (0.55 + 0.12), y: 2.05, w: 0.55, h: 0.55 });
  }

  s.addText(shoutout.techName.toUpperCase(), {
    x: 0.5, y: 2.85, w: 12.333, h: 0.9,
    fontFace: "Arial Black", fontSize: 48, color: WHITE, bold: true,
    align: "center", valign: "middle", margin: 0
  });

  s.addShape("line", { x: 4.5, y: 3.85, w: 4.333, h: 0,
    line: { color: YELLOW, width: 2 } });

  s.addText("WHY THEY'RE GETTING RECOGNIZED", {
    x: 0.5, y: 4.05, w: 12.333, h: 0.35,
    fontFace: "Arial", fontSize: 11, color: YELLOW, bold: true,
    align: "center", valign: "middle", margin: 0, charSpacing: 3
  });
  s.addText(shoutout.reason || "", {
    x: 1.5, y: 4.4, w: 10.333, h: 2.4,
    fontFace: "Arial", fontSize: 18, color: WHITE, italic: true,
    align: "center", valign: "top", margin: 0
  });

  addFooter(s, pres, slideLabel);
}

function buildKPIsSlide(s, pres, icons, { kpis }, slideLabel) {
  s.background = { color: STEEL_LIGHT };
  addHeaderBar(s, pres, "WEEKLY GOALS & NUMBERS", icons.fire);

  // Top row of 4 stat tiles
  const stats = [
    { label: "JOBS CLOSED",  value: String(kpis?.jobsClosed ?? 0), sub: "LAST WEEK", color: YELLOW },
    { label: "REVENUE",      value: kpis?.revenueDisplay ?? "$0",  sub: "LAST WEEK", color: GREEN_OK },
    { label: "CALLBACKS",    value: String(kpis?.callbackCount ?? 0), sub: "LAST WEEK", color: RED_ALERT },
    { label: "UNCOLLECTED",  value: kpis?.uncollected?.display ?? "$0",
      sub: `${kpis?.uncollected?.count ?? 0} JOBS`, color: NAVY_DARK },
  ];
  const tW = 2.95, tH = 1.85, tGap = 0.15;
  const totalW = 4 * tW + 3 * tGap;
  const startX = (13.333 - totalW) / 2;

  for (let i = 0; i < stats.length; i++) {
    const st = stats[i];
    const x = startX + i * (tW + tGap);
    const y = 1.15;
    s.addShape("rect", { x, y, w: tW, h: tH,
      fill: { color: WHITE }, line: { color: GRAY_LINE, width: 1 },
      shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 90, opacity: 0.08 } });
    s.addShape("rect", { x, y, w: tW, h: 0.15, fill: { color: st.color }, line: { color: st.color } });
    s.addText(st.label, {
      x: x + 0.2, y: y + 0.25, w: tW - 0.4, h: 0.35,
      fontFace: "Arial", fontSize: 11, color: GRAY_MUTED, bold: true,
      valign: "middle", margin: 0, charSpacing: 3
    });
    s.addText(st.value, {
      x: x + 0.2, y: y + 0.6, w: tW - 0.4, h: 0.85,
      fontFace: "Arial Black", fontSize: 36, color: NAVY_DARK, bold: true,
      align: "center", valign: "middle", margin: 0
    });
    s.addText(st.sub, {
      x: x + 0.2, y: y + 1.45, w: tW - 0.4, h: 0.3,
      fontFace: "Arial", fontSize: 10, color: GRAY_MUTED, bold: true,
      align: "center", valign: "middle", margin: 0, charSpacing: 2
    });
  }

  // Bottom: bar chart of jobs completed by tech
  const chartY = 3.2;
  const chartH = 3.65;

  s.addShape("rect", { x: 0.5, y: chartY, w: 12.333, h: chartH,
    fill: { color: WHITE }, line: { color: GRAY_LINE, width: 1 },
    shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 90, opacity: 0.08 } });
  s.addShape("rect", { x: 0.5, y: chartY, w: 12.333, h: 0.12,
    fill: { color: YELLOW }, line: { color: YELLOW } });

  s.addText("JOBS COMPLETED BY TECHNICIAN  —  LAST WEEK", {
    x: 0.7, y: chartY + 0.18, w: 12, h: 0.4,
    fontFace: "Arial Black", fontSize: 14, color: NAVY_DARK, bold: true,
    valign: "middle", margin: 0, charSpacing: 2
  });

  const byTech = kpis?.byTech || [];
  if (byTech.length === 0) {
    s.addText("(no completed jobs in window)", {
      x: 0.5, y: chartY + 1.5, w: 12.333, h: 0.6,
      fontFace: "Arial", fontSize: 16, color: GRAY_MUTED,
      align: "center", valign: "middle", margin: 0
    });
  } else {
    // Native pptxgenjs bar chart
    const chartData = [{
      name: "Jobs Completed",
      labels: byTech.map(r => r.name),
      values: byTech.map(r => r.count),
    }];
    s.addChart(pres.charts.BAR, chartData, {
      x: 0.7, y: chartY + 0.65, w: 12, h: chartH - 0.85,
      barDir: "col",
      chartColors: [NAVY_DARK],
      chartColorsOpacity: 100,
      catAxisLabelColor: GRAY_TEXT,
      catAxisLabelFontFace: "Arial",
      catAxisLabelFontSize: 11,
      catAxisLabelFontBold: true,
      valAxisLabelColor: GRAY_TEXT,
      valAxisLabelFontFace: "Arial",
      valAxisLabelFontSize: 10,
      showValue: true,
      dataLabelColor: WHITE,
      dataLabelFontFace: "Arial",
      dataLabelFontSize: 11,
      dataLabelFontBold: true,
      dataLabelPosition: "ctr",
      showLegend: false,
      showTitle: false,
      valGridLine: { style: "none" },
      catGridLine: { style: "none" },
      barGapWidthPct: 50,
    });
  }

  addFooter(s, pres, slideLabel);
}

// ---------- Main render entry point ----------

export async function renderDeck(data, outputPath) {
  const icons = {
    phoneYellow:    await iconPng(FaPhone, "#FFD000", 320),
    phoneYellowSm:  await iconPng(FaPhone, "#FFD000", 320),
    phoneNavy:      await iconPng(FaPhone, "#0F1E3A", 320),
    envelopeYellow: await iconPng(FaEnvelope, "#FFD000", 320),
    calendar:       await iconPng(FaCalendarAlt, "#FFFFFF", 320),
    boxOpen:        await iconPng(FaBoxOpen, "#FFFFFF", 320),
    exchange:       await iconPng(FaExchangeAlt, "#FFFFFF", 320),
    alert:          await iconPng(FaExclamationTriangle, "#FFFFFF", 320),
    trophy:         await iconPng(FaTrophy, "#FFFFFF", 320),
    clipboard:      await iconPng(FaClipboardList, "#FFFFFF", 320),
    fire:           await iconPng(FaFire, "#FFD000", 320),
    wrench:         await iconPng(FaWrench, "#0F1E3A", 320),
    wrenchNavy:     await iconPng(FaWrench, "#0F1E3A", 320),
    truck:          await iconPng(FaTruck, "#0F1E3A", 320),
    hardHat:        await iconPng(FaHardHat, "#0F1E3A", 320),
    bell:           await iconPng(FaBell, "#FFFFFF", 320),
    starYellow:     await iconPng(FaStar, "#FFD000", 320),
    arrowYellow:    await iconPng(FaArrowRight, "#FFD000", 320),
    mapPinNavy:     await iconPng(FaMapMarkerAlt, "#0F1E3A", 320),
    shield:         await iconPng(FaShieldAlt, "#FFFFFF", 320),
  };

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

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "Golden Rule Plumbing & Contracting";
  pres.title = `Shop Briefing — ${data.weekOf.humanLabel}`;

  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    const s = pres.addSlide();
    const labelStr = labelFor(i);
    switch (item.key) {
      case "cover":
        buildCoverSlide(s, pres, icons, {
          weekHumanLabel: data.weekOf.humanLabel,
          onCall: data.onCall,
        });
        break;
      case "oncall":
        await buildOnCallSlide(s, pres, icons, { onCall: data.onCall }, labelStr);
        break;
      case "events":
        buildEventsSlide(s, pres, icons, { events: data.events }, labelStr);
        break;
      case "newitems":
        buildNewItemsSlide(s, pres, icons, { newItems: data.newItems }, labelStr);
        break;
      case "moveditems":
        buildMovedItemsSlide(s, pres, icons, { movedItems: data.movedItems }, labelStr);
        break;
      case "jobboard":
        buildJobBoardSlide(s, pres, icons, { jobBoard: data.jobBoard }, labelStr);
        break;
      case "tagdurations":
        buildTagDurationsSlide(s, pres, icons, { tagDurations: data.tagDurations }, labelStr);
        break;
      case "hygiene":
        buildTimeTrackingSlide(s, pres, icons, { hygiene: data.hygiene }, labelStr);
        break;
      case "safety":
        buildSafetySlide(s, pres, icons, { safetyTopic: data.safetyTopic }, labelStr);
        break;
      case "shoutout":
        buildShoutoutSlide(s, pres, icons, { shoutout: data.shoutout }, labelStr);
        break;
      case "kpis":
        buildKPIsSlide(s, pres, icons, { kpis: data.kpis }, labelStr);
        break;
    }
  }

  await pres.writeFile({ fileName: outputPath });
  return {
    slideCount: plan.length,
    outputPath,
    plan: plan.map(p => p.key),
  };
}
