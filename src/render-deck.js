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
    `DISPATCH:  ${dispatcher.toUpperCase
