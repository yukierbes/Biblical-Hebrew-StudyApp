// Small chart builders for the My Progress page. Each returns an HTML/SVG string
// with no libraries: colours come from CSS classes (see style.css, "My Progress"),
// so every chart follows the light and dark themes by itself.

import { wrapHebrewSpans } from "./helpers.js";

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A bar split into mastered / learning / new, as one accessible picture. */
export function stackedBar({ mastered, learning, new: fresh, total }, label) {
  const pct = (n) => (total ? (n / total) * 100 : 0);
  const text = `${label}: ${mastered} mastered, ${learning} learning, ${fresh} new, of ${total}`;
  return `<div class="pm-stack" role="img" aria-label="${esc(text)}">
    <span class="pm-seg pm-seg-mastered" style="width:${pct(mastered)}%"></span>
    <span class="pm-seg pm-seg-learning" style="width:${pct(learning)}%"></span>
  </div>`;
}

/** The legend for stackedBar. */
export function stackLegend() {
  return `<div class="pm-legend" aria-hidden="true">
    <span><i class="pm-swatch pm-seg-mastered"></i>Mastered</span>
    <span><i class="pm-swatch pm-seg-learning"></i>Learning</span>
    <span><i class="pm-swatch pm-seg-new"></i>New</span>
  </div>`;
}

/** A row of accuracy: label (plain text), a bar for the percent right, and the numbers. */
export function accuracyRow({ label, pct, seen, minAnswers }) {
  const enough = seen >= minAnswers && pct !== null;
  const tone = !enough ? "pm-acc-faint" : pct >= 85 ? "pm-acc-good" : pct >= 65 ? "pm-acc-mid" : "pm-acc-low";
  const note = pct === null ? "not practised yet" : enough ? `${pct}% right · ${seen} answers` : `${seen} answer${seen === 1 ? "" : "s"} so far`;
  return `<div class="pm-acc-row ${tone}">
    <div class="pm-acc-label">${wrapHebrewSpans(label)}</div>
    <div class="pm-acc-track" role="img" aria-label="${esc(`${label}: ${note}`)}"><div class="pm-acc-fill" style="width:${pct ?? 0}%"></div></div>
    <div class="pm-acc-note">${note}</div>
  </div>`;
}

/** Vertical bars with the count above each and a label below. */
export function barChartSvg(items, ariaLabel) {
  const W = 340;
  const H = 150;
  const padTop = 20;
  const padBottom = 26;
  const max = Math.max(1, ...items.map((i) => i.count));
  const slot = W / items.length;
  const barW = Math.min(30, slot - 10);
  const plotH = H - padTop - padBottom;
  const bars = items
    .map((it, i) => {
      const h = (it.count / max) * plotH;
      const x = i * slot + (slot - barW) / 2;
      const y = padTop + (plotH - h);
      return `<g>
        <rect class="pm-bar${i === 0 ? " pm-bar-today" : ""}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${Math.max(h, it.count ? 2 : 0).toFixed(1)}" rx="2"/>
        <text class="pm-chart-num" x="${(i * slot + slot / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle">${it.count}</text>
        <text class="pm-chart-label" x="${(i * slot + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(it.label)}</text>
      </g>`;
    })
    .join("");
  return `<svg class="pm-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">
    <line class="pm-chart-axis" x1="0" y1="${padTop + plotH}" x2="${W}" y2="${padTop + plotH}"/>${bars}
  </svg>`;
}

/** A line of percents (0–100) over attempts, oldest on the left. */
export function lineChartSvg(values, ariaLabel) {
  const W = 340;
  const H = 130;
  const left = 40;
  const right = 10;
  const top = 10;
  const bottom = 14;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const x = (i) => (values.length === 1 ? left + plotW / 2 : left + (i / (values.length - 1)) * plotW);
  const y = (v) => top + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;
  const grid = [0, 50, 100]
    .map((g) => `<line class="pm-chart-grid" x1="${left}" y1="${y(g)}" x2="${W - right}" y2="${y(g)}"/><text class="pm-chart-label" x="${left - 5}" y="${y(g) + 3}" text-anchor="end">${g}%</text>`)
    .join("");
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const line = values.length > 1 ? `<polyline class="pm-line" points="${points}"/>` : "";
  const dots = values.map((v, i) => `<circle class="pm-dot${i === values.length - 1 ? " pm-dot-last" : ""}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5"><title>${v}%</title></circle>`).join("");
  return `<svg class="pm-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">${grid}${line}${dots}</svg>`;
}

/** The practice calendar: weeks as columns, Sunday at the top. */
export function heatmapSvg(grid) {
  const cell = 12;
  const gap = 3;
  const step = cell + gap;
  const left = 28;
  const top = 16;
  const W = left + grid.weeks * step;
  const H = top + 7 * step;
  const days = ["", "Mon", "", "Wed", "", "Fri", ""];
  const dayLabels = days.map((d, r) => (d ? `<text class="pm-chart-label" x="0" y="${top + r * step + cell - 2}">${d}</text>` : "")).join("");
  const monthLabels = grid.months.map((m) => `<text class="pm-chart-label" x="${left + m.col * step}" y="10">${m.label}</text>`).join("");
  const rects = grid.cells
    .filter((c) => !c.future)
    .map((c) => {
      const tip = c.count ? `${c.date}: ${c.count} answer${c.count === 1 ? "" : "s"}` : `${c.date}: no practice recorded`;
      return `<rect class="pm-heat pm-heat-${c.level}" x="${left + c.col * step}" y="${top + c.row * step}" width="${cell}" height="${cell}" rx="2"><title>${tip}</title></rect>`;
    })
    .join("");
  return `<svg class="pm-heatmap" viewBox="0 0 ${W} ${H}" role="img" aria-label="Practice calendar for the last ${grid.weeks} weeks: ${grid.activeDays} days practised">${monthLabels}${dayLabels}${rects}</svg>`;
}

/** The "Less … More" key under the calendar. */
export function heatLegend(goal) {
  return `<div class="pm-legend" aria-hidden="true" title="Darkest = your daily goal of ${goal} reached">
    <span>Less</span>${[0, 1, 2, 3, 4].map((l) => `<svg width="12" height="12"><rect class="pm-heat pm-heat-${l}" width="12" height="12" rx="2"/></svg>`).join("")}<span>More</span>
  </div>`;
}
