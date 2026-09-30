/* Silver Master — historial de precios y gráfico SVG. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const RANGES = { '24h': { scale: 1, hours: 24 }, '7d': { scale: 24, hours: 24 * 7 }, '30d': { scale: 24, hours: 24 * 30 }, '90d': { scale: 24, hours: 24 * 90 } };

  async function load(itemId, location, quality, range) {
    const R = RANGES[range] || RANGES['7d'];
    const h = await SM.api.getHistory([itemId], [location], [quality || 1], R.scale);
    const row = h.rows.find(r => r.location === location && r.item_id === itemId) || h.rows[0];
    const cut = Date.now() - R.hours * 3600000;
    const pts = row ? (row.data || []).filter(p => Date.parse(p.timestamp + 'Z') >= cut) : [];
    const earliest = row && row.data && row.data.length ? Date.parse(row.data[0].timestamp + 'Z') : null;
    return { points: pts, range, covers: earliest !== null && earliest <= cut + R.hours * 3600000 * 0.1, stale: h.stale, errors: h.errors };
  }

  function stats(points) {
    if (!points.length) return null;
    const prices = points.map(p => p.avg_price).filter(v => v > 0);
    if (!prices.length) return null;
    const vol = points.reduce((s, p) => s + p.item_count, 0);
    const wavg = points.reduce((s, p) => s + p.avg_price * p.item_count, 0) / (vol || 1);
    return {
      current: points[points.length - 1].avg_price, min: Math.min(...prices), max: Math.max(...prices),
      avg: vol ? wavg : prices.reduce((a, b) => a + b, 0) / prices.length, volume: vol,
      lastDate: points[points.length - 1].timestamp
    };
  }

  /** Gráfico: línea de precio promedio + barras de volumen. Colores desde variables CSS. */
  function chart(points, fmt) {
    if (!points.length) return '<p class="muted">Sin datos de historial para este rango.</p>';
    const W = 720, H = 240, L = 64, R = 12, T = 14, B = 34, VB = 50;
    const xs = points.map(p => Date.parse(p.timestamp + 'Z'));
    const x0 = Math.min(...xs), x1 = Math.max(...xs) || x0 + 1;
    const ys = points.map(p => p.avg_price);
    let y0 = Math.min(...ys), y1 = Math.max(...ys); if (y0 === y1) { y0 *= 0.95; y1 *= 1.05; }
    const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
    const vmax = Math.max(...points.map(p => p.item_count), 1);
    const X = t => L + (W - L - R) * ((t - x0) / ((x1 - x0) || 1));
    const Y = v => T + (H - T - B - VB) * (1 - (v - y0) / (y1 - y0));
    const line = points.map((p, i) => (i ? 'L' : 'M') + X(xs[i]).toFixed(1) + ' ' + Y(p.avg_price).toFixed(1)).join(' ');
    const area = line + ` L ${X(xs[xs.length - 1]).toFixed(1)} ${H - B - VB} L ${X(xs[0]).toFixed(1)} ${H - B - VB} Z`;
    const bw = Math.max(1.5, (W - L - R) / points.length * 0.6);
    const bars = points.map((p, i) => { const h = (VB - 6) * p.item_count / vmax; return `<rect class="c-vol" x="${(X(xs[i]) - bw / 2).toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1"><title>${p.item_count} vendidos</title></rect>`; }).join('');
    const ticks = [0, 0.5, 1].map(f => { const v = y0 + (y1 - y0) * (1 - f); const y = Y(v); return `<line class="c-grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="c-lbl" x="${L - 6}" y="${y + 4}" text-anchor="end">${fmt(v)}</text>`; }).join('');
    const dt = t => new Date(t).toLocaleString('es-CL', points.length > 30 && (x1 - x0) > 3 * 86400000 ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', hour: '2-digit' });
    const xl = [x0, (x0 + x1) / 2, x1].map((t, i) => `<text class="c-lbl" x="${X(t)}" y="${H - 8}" text-anchor="${['start', 'middle', 'end'][i]}">${dt(t)}</text>`).join('');
    const last = points[points.length - 1];
    const dots = points.map((p, i) => `<circle class="c-hit" cx="${X(xs[i]).toFixed(1)}" cy="${Y(p.avg_price).toFixed(1)}" r="7"><title>${dt(xs[i])}: ${fmt(p.avg_price)} · ${p.item_count} vendidos</title></circle>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Historial de precio promedio y volumen">
      ${ticks}<path class="c-area" d="${area}"/><path class="c-line" d="${line}"/>${bars}${dots}
      <circle class="c-end" cx="${X(xs[xs.length - 1])}" cy="${Y(last.avg_price)}" r="4"/>
      <text class="c-lbl" x="${L}" y="${H - B - VB + 12}">volumen</text>${xl}</svg>`;
  }

  SM.history = { RANGES, load, stats, chart };
})(typeof window !== 'undefined' ? window : globalThis);
