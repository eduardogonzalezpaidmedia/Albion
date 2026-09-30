/* Silver Master — cantidad óptima a fabricar según el historial de ventas y el precio.
   Estimaciones estadísticas sobre datos de AODP. No son garantías.
   Las reglas marcadas "heurística de la app" no son mecánicas del juego: se pueden ajustar aquí. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const DAY = 86400000;

  /** Serie diaria continua (días sin ventas = 0) de los últimos `days` días completos. */
  function dailySeries(histRow, days, now) {
    days = days || 30;
    const t0 = new Date(now || Date.now()); t0.setUTCHours(0, 0, 0, 0);
    const start = t0.getTime() - days * DAY;
    const byDay = {};
    for (const p of (histRow && histRow.data) || []) {
      const t = Date.parse(p.timestamp + 'Z'); if (!isFinite(t)) continue;
      const k = Math.floor(t / DAY) * DAY;
      if (k < start || k >= t0.getTime()) continue;               // fuera de rango o día en curso (incompleto)
      const d = byDay[k] || (byDay[k] = { count: 0, value: 0 });
      d.count += p.item_count; d.value += p.item_count * p.avg_price;
    }
    const out = [];
    for (let k = start; k < t0.getTime(); k += DAY) {
      const d = byDay[k];
      out.push({ t: k, count: d ? d.count : 0, price: d && d.count ? d.value / d.count : null });
    }
    return out;
  }

  /** Ventas en todas las ventanas de `windowDays` días consecutivos. */
  function windowSums(series, windowDays) {
    const w = Math.max(1, Math.round(windowDays)), s = [];
    for (let i = 0; i + w <= series.length; i++) { let v = 0; for (let j = i; j < i + w; j++) v += series[j].count; s.push(v); }
    return s;
  }

  function percentile(arr, p) {
    const a = arr.filter(v => v !== null && isFinite(v)).sort((x, y) => x - y);
    if (!a.length) return null;
    const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return a[lo] + (a[hi] - a[lo]) * (i - lo);
  }

  /** Tendencia del precio: regresión lineal sobre los últimos `days` días con precio. */
  function priceTrend(series, days) {
    const pts = series.slice(-(days || 14)).map((d, i) => ({ x: i, y: d.price })).filter(p => p.y);
    if (pts.length < 4) return null;
    const n = pts.length, mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
    let num = 0, den = 0; for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
    const slope = den ? num / den : 0;                    // plata por día
    const last = pts[pts.length - 1].y;
    const pctPerDay = my ? slope / my * 100 : 0;
    const dir = pctPerDay > 1 ? 'sube' : pctPerDay < -1 ? 'baja' : 'estable';   // ±1%/día: heurística de la app
    return { slope, pctPerDay, direction: dir, last, mean: my, points: n };
  }

  /** Posición de tu precio frente a los precios diarios recientes → factor de competitividad (heurística de la app). */
  const PRICE_FACTORS = [
    { upTo: 0.50, factor: 1.00, label: 'competitivo (en o bajo la mediana)' },
    { upTo: 0.75, factor: 0.70, label: 'algo alto' },
    { upTo: 0.90, factor: 0.40, label: 'alto' },
    { upTo: 1.01, factor: 0.15, label: 'muy alto (sobre casi todo lo reciente)' }
  ];
  function pricePosition(series, price) {
    const ps = series.map(d => d.price).filter(Boolean);
    if (!ps.length || !price) return { rank: null, factor: 1, label: 'sin historial de precio' };
    const rank = ps.filter(p => p < price).length / ps.length;
    const f = PRICE_FACTORS.find(x => rank <= x.upTo) || PRICE_FACTORS[PRICE_FACTORS.length - 1];
    return { rank, factor: f.factor, label: f.label };
  }

  /**
   * Análisis de cantidad.
   * o = { histRow, days (plazo de venta), share (0..1), confidence (0..1), salePrice, netUnit (ingreso neto por unidad),
   *       unitCost, salvagePct (0..1 del costo que recuperas de lo no vendido), yieldN, maxQ }
   */
  function analyze(o) {
    const series = dailySeries(o.histRow, 30);
    const observed = series.filter(d => d.count > 0).length;
    if (observed < 3) return { ok: false, reason: 'AODP no tiene suficiente historial de ventas (menos de 3 días con ventas en los últimos 30).' };
    const days = Math.max(1, Math.round(o.days || 3));
    const sums = windowSums(series, days);
    // Venta inmediata (a una orden de compra o al Mercado Negro): no compites por precio, no se penaliza.
    const pos = o.mode === 'instant' ? { rank: null, factor: 1, label: 'venta inmediata: no compites por precio' } : pricePosition(series, o.salePrice);
    const trend = priceTrend(series, 14);
    const share = Math.min(Math.max(o.share || 0.3, 0.01), 1) * pos.factor;
    const mine = sums.map(s => s * share);                               // lo que tú venderías en cada ventana histórica
    // precio esperado al vender: precio actual ajustado por la tendencia a mitad del plazo, acotado a ±30%
    let priceAdj = 1;
    if (trend) priceAdj = Math.min(1.3, Math.max(0.7, 1 + trend.pctPerDay / 100 * days / 2));
    const netUnit = o.netUnit * priceAdj;
    // lo que no se vende en el plazo: recuperas una parte de su COSTO (remate, uso propio o venta tardía). Heurística ajustable.
    const salvage = o.unitCost * (o.salvagePct ?? 0.5);
    const y = Math.max(1, o.yieldN || 1);
    const maxQ = Math.max(y, Math.ceil((o.maxQ || percentile(mine, 0.95) * 1.5 || y) / y) * y);
    const probAll = q => mine.filter(m => m >= q).length / mine.length;
    const expSold = q => mine.reduce((s, m) => s + Math.min(q, m), 0) / mine.length;
    const evalQ = q => { const es = expSold(q); return { q, prob: probAll(q), expSold: es, expProfit: es * netUnit + (q - es) * salvage - q * o.unitCost }; };
    const rows = [];
    for (let q = y; q <= maxQ; q += y) rows.push(evalQ(q));
    const best = rows.reduce((b, r) => r.expProfit > b.expProfit ? r : b, rows[0]);
    const conf = o.confidence || 0.8;
    const safe = rows.filter(r => r.prob >= conf).pop() || null;
    // modelo newsvendor: conviene fabricar una unidad más mientras la prob. de venderla supere pérdida / (margen + pérdida)
    const margin = netUnit - o.unitCost, loss = o.unitCost - salvage;
    const critical = margin > 0 ? Math.max(loss, 0) / (margin + Math.max(loss, 0)) : null;
    return {
      ok: true, series, observed, days, sums, share, pos, trend, priceAdj, netUnit, salvage,
      median: percentile(sums, 0.5), p20: percentile(sums, 0.2), rows, best, safe, conf, critical,
      evalQ
    };
  }

  /** Muestra reducida de filas para una tabla. */
  function sampleRows(a, n) {
    if (!a.ok) return [];
    const pick = new Set([a.best && a.best.q, a.safe && a.safe.q]);
    const step = Math.max(1, Math.floor(a.rows.length / (n || 8)));
    a.rows.forEach((r, i) => { if (i % step === 0) pick.add(r.q); });
    return a.rows.filter(r => pick.has(r.q));
  }

  SM.demand = { dailySeries, windowSums, percentile, priceTrend, pricePosition, analyze, sampleRows, PRICE_FACTORS };
})(typeof window !== 'undefined' ? window : globalThis);
