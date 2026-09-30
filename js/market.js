/* Silver Master — lectura de filas de AODP: órdenes, antigüedad, confianza, mejores precios. */
(function (root) {
  const SM = root.SM = root.SM || {};

  const validDate = d => typeof d === 'string' && !d.startsWith('0001') && isFinite(Date.parse(d + 'Z'));
  const ageMinutes = (d, now) => validDate(d) ? ((now || Date.now()) - Date.parse(d + 'Z')) / 60000 : null;

  /** Antigüedad: solo describe, no dice si el precio es correcto. */
  function ageClass(d, th, now) {
    const m = ageMinutes(d, now);
    if (m === null) return { key: 'none', label: 'Sin datos', minutes: null };
    const t = th || { fresh: 15, recent: 60, old: 360 };
    const key = m <= t.fresh ? 'fresh' : m <= t.recent ? 'recent' : m <= t.old ? 'old' : 'very_old';
    const label = { fresh: 'fresco', recent: 'reciente', old: 'antiguo', very_old: 'muy antiguo' }[key];
    return { key, label, minutes: m };
  }
  function ageText(d, now) {
    const m = ageMinutes(d, now);
    if (m === null) return 'Sin datos';
    if (m < 1) return 'hace menos de 1 min';
    if (m < 60) return 'hace ' + Math.round(m) + ' min';
    if (m < 48 * 60) return 'hace ' + Math.round(m / 60) + ' h';
    return 'hace ' + Math.round(m / 1440) + ' d';
  }

  /** Orden de venta más barata publicada (lo que pagas al comprar ya / precio anunciado para vender). */
  function sellOrder(row) { return row && row.sell_price_min > 0 && validDate(row.sell_price_min_date) ? { price: row.sell_price_min, date: row.sell_price_min_date } : null; }
  /** Orden de compra más alta (lo que obtienes vendiendo al instante). */
  function buyOrder(row) { return row && row.buy_price_max > 0 && validDate(row.buy_price_max_date) ? { price: row.buy_price_max, date: row.buy_price_max_date } : null; }

  /** rows -> index[item_id][location][quality] */
  function index(rows, idx) {
    idx = idx || {};
    for (const r of rows || []) {
      const a = idx[r.item_id] = idx[r.item_id] || {};
      const b = a[r.city] = a[r.city] || {};
      b[r.quality] = r;
    }
    return idx;
  }
  const row = (idx, id, loc, q) => idx && idx[id] && idx[id][loc] && idx[id][loc][q || 1] || null;

  const fresh = (d, maxH) => { const m = ageMinutes(d); return m !== null && (maxH === null || maxH === undefined || m <= maxH * 60); };

  /** Material más barato (orden de venta) entre ubicaciones. */
  function cheapestBuy(idx, id, locations, maxAgeH) {
    let best = null;
    for (const loc of locations) {
      const s = sellOrder(row(idx, id, loc, 1));
      if (s && fresh(s.date, maxAgeH) && (!best || s.price < best.price)) best = Object.assign({ location: loc }, s);
    }
    return best;
  }
  /** Precios de un objeto por ubicación, para comparar. */
  function byLocation(idx, id, locations, quality) {
    return locations.map(loc => {
      const r = row(idx, id, loc, quality || 1);
      return { location: loc, sell: sellOrder(r), buy: buyOrder(r) };
    });
  }
  /** Mejor venta: mode 'instant' usa orden de compra; 'order' usa orden de venta publicada. El Mercado Negro solo instant. */
  function bestSale(idx, id, markets, mode, quality, maxAgeH) {
    let best = null;
    for (const loc of markets) {
      if (mode === 'order' && loc === 'Black Market') continue;
      const r = row(idx, id, loc, quality || 1);
      const o = mode === 'order' ? sellOrder(r) : buyOrder(r);
      if (o && fresh(o.date, maxAgeH) && (!best || o.price > best.price)) best = Object.assign({ location: loc, mode }, o);
    }
    return best;
  }

  /** Confianza orientativa (no es garantía). f = {ageMinutes, hasBuy, hasSell, dailyVolume, historyDays} */
  function confidence(f, cfg) {
    const c = cfg || { max_age_hours_high: 1, max_age_hours_medium: 6, min_daily_volume_high: 20, min_daily_volume_medium: 3 };
    let score = 0;
    if (f.ageMinutes !== null && f.ageMinutes !== undefined) score += f.ageMinutes <= c.max_age_hours_high * 60 ? 2 : f.ageMinutes <= c.max_age_hours_medium * 60 ? 1 : 0;
    if (f.hasBuy) score += 1;
    if (f.hasSell) score += 1;
    if (f.dailyVolume !== null && f.dailyVolume !== undefined) score += f.dailyVolume >= c.min_daily_volume_high ? 2 : f.dailyVolume >= c.min_daily_volume_medium ? 1 : 0;
    if ((f.historyDays || 0) >= 5) score += 1;
    return score >= 6 ? 'Alta' : score >= 3 ? 'Media' : 'Baja';
  }

  /** Ubicaciones para las que AODP realmente devolvió algún precio con fecha válida. */
  function locationsWithData(rows) {
    const s = new Set();
    for (const r of rows || []) if (sellOrder(r) || buyOrder(r)) s.add(r.city);
    return s;
  }

  /** Volumen diario promedio desde filas de historial (time-scale 24). */
  function dailyVolume(histRow, days) {
    if (!histRow || !histRow.data || !histRow.data.length) return null;
    const cut = Date.now() - (days || 7) * 86400000;
    const pts = histRow.data.filter(p => Date.parse(p.timestamp + 'Z') >= cut);
    return pts.reduce((s, p) => s + p.item_count, 0) / (days || 7);
  }

  SM.market = { validDate, ageMinutes, ageClass, ageText, sellOrder, buyOrder, index, row, fresh, cheapestBuy, byLocation, bestSale, confidence, locationsWithData, dailyVolume };
})(typeof window !== 'undefined' ? window : globalThis);
