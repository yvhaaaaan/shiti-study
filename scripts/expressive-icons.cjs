'use strict'

/**
 * Warm, stationery-inspired functional icons on a 24 × 24 grid.
 * Each renderer returns SVG children only. Colour is supplied by the caller;
 * white button icons and the product logo remain the caller's responsibility.
 *
 * @typedef {{stroke:string, fill:string, accent:string, soft:string, detail:string}} Palette
 */

const outline = color => `stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"`
const path = (d, palette, fill = 'none', stroke = palette.stroke) => `<path d="${d}" fill="${fill}" ${outline(stroke)}/>`
const rect = (x, y, width, height, radius, palette, fill = palette.soft, stroke = palette.stroke) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" ${outline(stroke)}/>`
const circle = (cx, cy, radius, palette, fill = palette.soft, stroke = palette.stroke) => `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" ${outline(stroke)}/>`
const line = (x1, y1, x2, y2, palette, stroke = palette.stroke) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${outline(stroke)}/>`
const polyline = (points, palette, stroke = palette.stroke) => `<polyline points="${points}" fill="none" ${outline(stroke)}/>`
const ellipse = (cx, cy, rx, ry, angle, palette, fill = 'none', stroke = palette.stroke) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${angle} ${cx} ${cy})" fill="${fill}" ${outline(stroke)}/>`

/** @type {Record<string, (palette: Palette) => string>} */
const expressiveIcons = {
  house: p => [
    path('M5 10v11h14V10', p, p.soft),
    path('M2.5 11 12 3l9.5 8', p, p.fill),
    rect(10, 14, 4, 7, 0.8, p, p.accent),
  ].join(''),

  'layout-dashboard': p => [
    rect(3, 3, 8, 10, 2, p), rect(14, 3, 7, 6, 2, p, p.fill),
    rect(3, 16, 8, 5, 1.8, p, p.fill), rect(14, 12, 7, 9, 2, p),
    line(5.5, 9.5, 8.5, 9.5, p, p.detail),
    rect(16.5, 16, 2, 2, 0.5, p, p.accent, 'none'),
  ].join(''),

  'book-open': p => [
    path('M12 5.5C9.4 3.9 5.6 3.4 2.5 4.5v14c3.1-1.1 6.9-.6 9.5 1Z', p, p.soft),
    path('M12 5.5c2.6-1.6 6.4-2.1 9.5-1v14c-3.1-1.1-6.9-.6-9.5 1Z', p, p.fill),
    path('M5.3 4.1v5l1.5-1 1.5 1V4.4', p, p.accent, 'none'),
    line(15.4, 10, 18.4, 9.6, p, p.detail),
    line(15.4, 13.5, 18.4, 13.1, p, p.detail),
  ].join(''),

  'book-open-text': p => [
    path('M12 5.5C9.4 3.9 5.6 3.4 2.5 4.5v14c3.1-1.1 6.9-.6 9.5 1Z', p, p.soft),
    path('M12 5.5c2.6-1.6 6.4-2.1 9.5-1v14c-3.1-1.1-6.9-.6-9.5 1Z', p, p.fill),
    path('M5.5 9.4c1.1 0 2.2.2 3.3.6M5.5 13c1.1 0 2.2.2 3.3.6', p, 'none', p.detail),
    path('M15.2 10c1.1-.4 2.2-.6 3.3-.6', p, 'none', p.accent),
    path('M15.2 13.6c1.1-.4 2.2-.6 3.3-.6', p, 'none', p.detail),
  ].join(''),

  'notebook-pen': p => [
    rect(4, 3, 13, 18, 2, p), line(7.5, 3, 7.5, 21, p, p.detail),
    line(10.5, 7, 14, 7, p, p.detail),
    path('m11.5 17.5 7.4-7.4 2.1 2.1-7.4 7.4-3.1 1Z', p, p.accent),
    line(17.5, 11.5, 19.6, 13.6, p, p.detail),
  ].join(''),

  'calendar-days': p => [
    rect(3, 5, 18, 16, 2.7, p),
    path('M3.5 9.5h17V7a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 7Z', p, p.fill, 'none'),
    line(3, 10, 21, 10, p), line(7, 3, 7, 7, p), line(17, 3, 17, 7, p),
    rect(6, 13, 2.5, 2.5, 0.6, p, p.accent, 'none'),
    rect(11, 13, 2.5, 2.5, 0.6, p, p.detail, 'none'),
    rect(16, 13, 2.5, 2.5, 0.6, p, p.detail, 'none'),
    line(6.5, 18, 12.5, 18, p, p.detail),
  ].join(''),

  files: p => [
    rect(7, 3, 13, 15, 2, p),
    path('M5 7h7l5 5v7.5a1.5 1.5 0 0 1-1.5 1.5H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z', p, p.fill),
    path('M12 7v5h5', p, p.soft, p.detail),
    line(6.5, 16, 11, 16, p, p.accent),
  ].join(''),

  'chart-no-axes-combined': p => [
    rect(4, 14, 3.5, 7, 0.9, p),
    rect(10.5, 11, 3.5, 10, 0.9, p, p.fill),
    rect(17, 7, 3.5, 14, 0.9, p),
    polyline('3.5 10 8.5 6 12.5 8 20.5 2.5', p, p.accent),
    polyline('17 2.5 20.5 2.5 20.5 6', p, p.accent),
  ].join(''),

  flame: p => [
    path('M13 2.5c1.2 4 4.9 4.7 5.8 8.5C19.9 15.8 17.1 21 12 21c-5.4 0-8.2-4-7.1-8.1.5-1.8 1.8-3.3 3.2-4.6.2 2 1 2.9 2 3.5-.5-4 1-7 2.9-9.3Z', p, p.soft),
    path('M12.3 12c.7 1.8 3.1 2.9 3.1 5.1 0 1.8-1.5 3.2-3.4 3.2s-3.4-1.4-3.4-3.2c0-1.5.8-2.6 1.8-3.6.1 1 .6 1.5 1.1 1.8-.1-1.3.1-2.3.8-3.3Z', p, p.accent, 'none'),
  ].join(''),

  target: p => [
    circle(11, 13, 8, p), circle(11, 13, 4, p, p.fill, p.detail),
    circle(11, 13, 1.5, p, p.accent, 'none'),
    line(13.5, 10.5, 21.5, 2.5, p, p.accent),
    polyline('17.5 2.5 21.5 2.5 21.5 6.5', p, p.accent),
  ].join(''),

  'graduation-cap': p => [
    path('M6 11.5v5c3.4 2.4 8.6 2.4 12 0v-5', p, p.fill),
    path('M2 9 12 4l10 5-10 5Z', p, p.soft),
    path('M21 10v6', p, 'none', p.accent),
    circle(21, 17.5, 1.2, p, p.accent, 'none'),
  ].join(''),

  camera: p => [
    path('M8 7 9.5 4h5L16 7', p, p.fill),
    rect(3, 7, 18, 14, 2.7, p),
    circle(12, 14, 3.7, p, p.fill),
    circle(12, 14, 1.35, p, p.accent, 'none'),
    line(17.5, 10, 18.5, 10, p, p.detail),
  ].join(''),

  keyboard: p => [
    rect(2.5, 5, 19, 14, 2.7, p),
    ...[6.5, 12, 17.5].flatMap(x => [circle(x, 9, 0.8, p, p.detail, 'none'), circle(x, 12.5, 0.8, p, p.detail, 'none')]),
    rect(8, 15.8, 8, 1.8, 0.7, p, p.accent, 'none'),
  ].join(''),

  lightbulb: p => [
    path('M8 16c0-1.1-.5-1.9-1.3-2.8a6.2 6.2 0 1 1 10.6 0c-.8.9-1.3 1.7-1.3 2.8Z', p, p.soft),
    path('m10 11 2 2 2-2M12 13v3', p, 'none', p.accent),
    rect(8, 16, 8, 3, 1, p, p.fill), line(10, 21, 14, 21, p, p.detail),
    line(3.2, 4.2, 2.2, 3.2, p, p.accent), line(20.8, 4.2, 21.8, 3.2, p, p.accent),
  ].join(''),

  calculator: p => [
    rect(5, 2.5, 14, 19, 2.5, p), rect(8, 5.5, 8, 3.5, 0.7, p, p.fill, p.detail),
    circle(8.5, 13, 0.8, p, p.detail, 'none'), circle(12, 13, 0.8, p, p.detail, 'none'),
    circle(8.5, 17.5, 0.8, p, p.detail, 'none'), circle(12, 17.5, 0.8, p, p.detail, 'none'),
    rect(15, 12, 1.8, 6.4, 0.7, p, p.accent, 'none'),
  ].join(''),

  atom: p => [
    ellipse(12, 12, 9, 3.7, 0, p, p.soft),
    ellipse(12, 12, 9, 3.7, 60, p, 'none', p.detail),
    ellipse(12, 12, 9, 3.7, 120, p, 'none', p.detail),
    circle(12, 12, 1.8, p, p.accent, 'none'),
  ].join(''),

  'flask-conical': p => [
    path('M10 3v6L4.7 19.1c-.6 1.1.2 1.9 1.4 1.9h11.8c1.2 0 2-.8 1.4-1.9L14 9V3Z', p, p.soft),
    path('M7.1 15h9.8l2.2 4.2c.3.5 0 .8-.6.8h-13c-.6 0-.9-.3-.6-.8Z', p, p.accent, 'none'),
    line(8.5, 3, 15.5, 3, p), circle(11, 12, 0.8, p, p.accent, 'none'),
    circle(14, 18, 0.8, p, p.fill, 'none'),
  ].join(''),

  languages: p => [
    path('M4.5 3h8A2.5 2.5 0 0 1 15 5.5v7a2.5 2.5 0 0 1-2.5 2.5H7l-4 3V5.5A2.5 2.5 0 0 1 4.5 3Z', p, p.soft),
    path('M11 9h8.5a2 2 0 0 1 2 2v10l-3-2H13a2 2 0 0 1-2-2Z', p, p.fill),
    path('M6 7h6M9 5.5V7M7 7c.2 2.2 1.2 3.5 3 4.5M11 7c-.5 2.1-1.8 3.6-4 4.5', p, 'none', p.detail),
    path('m14 16.5 2.2-5 2.2 5M14.9 14.7h2.6', p, 'none', p.accent),
  ].join(''),

  bookmark: p => [
    path('M6 3h12v18l-6-4-6 4Z', p, p.soft),
    rect(14.5, 4, 1.8, 6, 0.5, p, p.accent, 'none'),
    line(9, 7, 11, 7, p, p.detail),
  ].join(''),

  'bookmark-check': p => [
    path('M6 3h12v18l-6-4-6 4Z', p, p.soft),
    path('m8.5 10.5 2.5 2.5 4.8-4.8', p, 'none', p.accent),
  ].join(''),

  'trash-2': p => [
    path('m6 7 1 14h10l1-14', p, p.soft),
    path('M9 4V2.5h6V4', p, p.accent),
    rect(4, 4, 16, 3, 1, p, p.fill),
    line(10, 10.5, 10.5, 17.5, p, p.detail), line(14, 10.5, 13.5, 17.5, p, p.detail),
  ].join(''),

  'shield-check': p => [
    path('m12 2.5 8 3v6.2c0 4.8-3.3 7.5-8 10-4.7-2.5-8-5.2-8-10V5.5Z', p, p.soft),
    path('m8 11.8 2.6 2.7 5.4-5.4', p, 'none', p.accent),
  ].join(''),

  layers: p => [
    path('m3 8 9-5 9 5-9 5Z', p, p.soft),
    path('m3 12 9 5 9-5M3 16l9 5 9-5', p),
    path('m9 8 3-1.7L15 8l-3 1.7Z', p, p.accent, 'none'),
  ].join(''),

  image: p => [
    rect(3, 3, 18, 18, 2.7, p),
    path('m4.5 16.5 4.5-4.5 4.5 4.5 3-3 3 3V20h-15Z', p, p.fill, 'none'),
    path('m4.5 16.5 4.5-4.5 4.5 4.5 3-3 3 3', p),
    circle(16, 8, 2, p, p.accent, 'none'),
  ].join(''),

  leaf: p => [
    path('M20.5 3.5C13 3 5.3 5.3 4 11.5 2.8 17 6.8 21.5 12 19.5c6.3-2.4 8-9 8.5-16Z', p, p.soft),
    path('M4 21 15.5 9.5', p),
    path('M9 16v-4M12 13h4', p, 'none', p.detail),
    path('m12 13 3.5-3.5', p, 'none', p.accent),
  ].join(''),

  globe: p => [
    circle(12, 12, 9, p), ellipse(12, 12, 4, 9, 0, p, p.fill, p.detail),
    line(3, 12, 21, 12, p, p.detail),
    path('M4.4 7.3c4 1.7 11.2 1.7 15.2 0M4.4 16.7c4-1.7 11.2-1.7 15.2 0', p, 'none', p.detail),
    circle(18.2, 7.1, 1.8, p, p.accent, 'none'),
  ].join(''),

  bell: p => [
    path('M6 10a6 6 0 0 1 12 0v4l2 3H4l2-3Z', p, p.soft),
    path('M9.5 19a2.5 2.5 0 0 0 5 0', p, p.accent),
    line(12, 2.5, 12, 4, p), line(9, 17, 15, 17, p, p.detail),
  ].join(''),

  'scan-line': p => [
    rect(6, 5, 12, 14, 1.5, p, p.soft, 'none'),
    path('M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3', p),
    line(4, 12, 20, 12, p, p.accent),
    line(9, 8, 14, 8, p, p.detail), line(9, 16, 12, 16, p, p.detail),
  ].join(''),

  'file-text': p => [
    path('M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', p, p.soft),
    path('M14 3v5h5', p, p.accent, p.detail),
    line(8, 12, 16, 12, p, p.detail), line(8, 16, 14, 16, p, p.detail),
  ].join(''),

  'folder-open': p => [
    path('M3 18V6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9Z', p, p.soft),
    path('M6 11h16l-3 9H3Z', p, p.fill),
    line(8, 15, 13, 15, p, p.accent),
  ].join(''),
}

module.exports = { expressiveIcons }
