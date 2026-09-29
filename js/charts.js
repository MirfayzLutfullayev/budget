// Kutubxonasiz, oflayn ishlaydigan oddiy SVG diagrammalar.

import { esc, short } from './util.js';

export const PALETTE = ['#2f7d5b', '#4c7bd9', '#e08a2e', '#c2528b', '#7a5cc7', '#2a9bb0', '#b8a032', '#8a8f98'];

/** Halqa diagramma. items: [{name, amount}] */
export function donut(items) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  if (total <= 0) return '';
  const r = 60;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = items.map((item, idx) => {
    const len = (item.amount / total) * c;
    const gap = items.length > 1 ? Math.min(2, len / 3) : 0;
    const arc = `<circle r="${r}" cx="80" cy="80" fill="none" stroke="${PALETTE[idx % PALETTE.length]}"
      stroke-width="22" stroke-dasharray="${Math.max(len - gap, 0.01)} ${c}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 80 80)"></circle>`;
    offset += len;
    return arc;
  }).join('');
  return `<svg class="donut" viewBox="0 0 160 160" role="img" aria-label="Kategoriyalar bo‘yicha xarajatlar">
    ${arcs}
    <text x="80" y="76" text-anchor="middle" class="donut-label">Jami</text>
    <text x="80" y="96" text-anchor="middle" class="donut-value">${esc(short(total))}</text>
  </svg>`;
}

/** Guruhlangan ustunlar. groups: [{label, values:[a, b]}], series: [{name, color}] */
export function bars(groups, series) {
  const W = 320;
  const H = 170;
  const top = 10;
  const bottom = 24;
  const left = 34;
  const max = Math.max(1, ...groups.flatMap(g => g.values));
  const plotH = H - top - bottom;
  const slot = (W - left) / groups.length;
  const barW = Math.min(16, (slot - 10) / series.length);

  const grid = [0, 0.5, 1].map(f => {
    const y = top + plotH * (1 - f);
    return `<line x1="${left}" x2="${W}" y1="${y}" y2="${y}" class="grid"></line>
      <text x="${left - 4}" y="${y + 3}" text-anchor="end" class="axis">${esc(short(max * f))}</text>`;
  }).join('');

  const columns = groups.map((g, gi) => {
    const cx = left + slot * gi + slot / 2;
    const startX = cx - (barW * series.length) / 2;
    const rects = g.values.map((v, si) => {
      const h = (v / max) * plotH;
      return `<rect x="${startX + si * barW}" y="${top + plotH - h}" width="${barW - 2}" height="${Math.max(h, 0)}"
        rx="3" fill="${series[si].color}"><title>${esc(series[si].name)}: ${esc(short(v))}</title></rect>`;
    }).join('');
    return `${rects}<text x="${cx}" y="${H - 6}" text-anchor="middle" class="axis">${esc(g.label)}</text>`;
  }).join('');

  const legend = series.map(s =>
    `<span class="legend-item"><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('');

  return `<svg class="bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Oylar bo‘yicha daromad va chiqim">${grid}${columns}</svg>
    <div class="legend">${legend}</div>`;
}
