/* Silver Master — estimación de rotación del inventario (SalesForecastEngine).
   Distingue tres conceptos:
     1. Volumen observado: unidades registradas por AODP (datos de la comunidad; NO es el total real vendido en el servidor).
     2. Demanda estimada: unidades/día que el mercado mostró en los últimos 30 días (por escenario).
     3. Velocidad de venta proyectada: lo que TÚ podrías vender por día = demanda × tu parte del mercado × factor de precio × factor propio.
   Son estimaciones, no garantías. Las reglas (percentiles, parte del mercado) son heurísticas de la app. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const HORIZONS = [{ key: '24h', days: 1 }, { key: '48h', days: 2 }, { key: '72h', days: 3 }, { key: '7d', days: 7 }, { key: '14d', days: 14 }, { key: '30d', days: 30 }];
  const SCEN = [{ key: 'cons', label: 'Conservador' }, { key: 'mid', label: 'Intermedio' }, { key: 'opt', label: 'Optimista' }];
  const isNum = v => typeof v === 'number' && isFinite(v);

  /**
   * Factor propio: compara lo que vendiste de verdad (Diario) con lo que la app proyectó al planificar.
   * Solo existe cuando hay al menos 3 operaciones con proyección y ventas reales. Nunca se inventa.
   */
  function learningFactor() {
    if (!SM.journal) return { factor: 1, samples: 0, note: 'Sin operaciones propias registradas: no se aplica ajuste.' };
    const ratios = [];
    SM.journal.all().forEach(b => {
      if (!b.plan || !(b.plan.rate > 0) || b.status === 'planned') return;
      const s = SM.journal.stats(b);
      if (!s.done && s.days < 3) return;                         // muy pronto para medir
      ratios.push(s.perDay / b.plan.rate);
    });
    if (ratios.length < 3) return { factor: 1, samples: ratios.length, note: `Hay ${ratios.length} operación(es) medible(s); se necesitan 3 para ajustar las estimaciones con tus ventas reales.` };
    const f = Math.min(2, Math.max(0.25, SM.risk.median(ratios)));
    return { factor: f, samples: ratios.length, note: `Ajuste con ${ratios.length} operaciones reales: vendiste ${Math.round(f * 100)}% de lo proyectado (mediana).` };
  }

  /**
   * o = { histRow (AODP time-scale 24), qty, unitCost, sharePct, mode:'instant'|'order', salePrice, useLearning }
   */
  function forecast(o) {
    const series = SM.demand.dailySeries(o.histRow, 30);
    const counts = series.map(d => d.count);
    const observed = series.filter(d => d.count > 0).length;
    const total30 = counts.reduce((a, b) => a + b, 0);
    const last7 = counts.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const base = { observed, observedVolume: { perDay7: last7, perDay30: total30 / 30, total30 }, series };
    if (!observed) return Object.assign(base, { ok: false, confidence: 'insuficiente', reason: 'AODP no tiene registros de ventas de este objeto en este mercado en los últimos 30 días.' });
    const mean = total30 / 30, P = SM.demand.percentile;
    const demand = { cons: Math.min(P(counts, 0.25), mean), mid: mean, opt: Math.max(P(counts, 0.75), mean) };
    const pos = o.mode === 'order' ? SM.demand.pricePosition(series, o.salePrice) : { factor: 1, label: 'venta inmediata: no compites por precio' };
    const share = Math.min(Math.max((o.sharePct ?? 30) / 100, 0.01), 1);
    const learn = o.useLearning === false ? { factor: 1, samples: 0, note: 'Ajuste propio desactivado.' } : learningFactor();
    const rate = {}; SCEN.forEach(s => rate[s.key] = demand[s.key] * share * pos.factor * learn.factor);
    const qty = Math.max(0, Math.round(o.qty || 0)), uc = o.unitCost || 0;
    const table = HORIZONS.map(h => {
      const r = { key: h.key, days: h.days };
      SCEN.forEach(s => { const sold = Math.min(qty, Math.floor(rate[s.key] * h.days)); r[s.key] = { sold, pct: qty ? sold / qty * 100 : 0, immobilized: (qty - sold) * uc }; });
      return r;
    });
    const hoursToSell = k => rate[k] > 0 ? qty / rate[k] * 24 : Infinity;
    const confidence = observed >= 20 ? 'alta' : observed >= 7 ? 'media' : 'baja';
    return Object.assign(base, {
      ok: true, provisional: observed < 3, confidence, demand, rate, share, pos, learn, table, qty,
      estimatedSaleHours: hoursToSell('mid'), saleHours: { cons: hoursToSell('cons'), mid: hoursToSell('mid'), opt: hoursToSell('opt') },
      assumptions: [
        `Demanda = unidades/día observadas en AODP en 30 días: conservador = percentil 25 (máx. el promedio), intermedio = promedio, optimista = percentil 75 (mín. el promedio).`,
        `Tu parte del mercado: ${Math.round(share * 100)}% (Ajustes → Cantidad óptima).`,
        `Factor de precio: ×${pos.factor} (${pos.label}).`,
        learn.note,
        observed < 3 ? 'Estimación PROVISIONAL: menos de 3 días con registros, confianza baja.' : `${observed} de 30 días con registros.`
      ]
    });
  }

  /** Cuánto absorbe el mercado en `days` (escenario intermedio) vs tu cantidad. */
  function inventoryRatio(fc, days) { if (!fc || !fc.ok) return null; const abs = fc.rate.mid * days; return abs > 0 ? fc.qty / abs : Infinity; }

  /** Tendencias de precio (% de cambio del precio promedio) a 3, 7, 14 y 30 días con historial diario; 24 h con historial horario. */
  function trends(dailyRow, hourlyRow) {
    const series = SM.demand.dailySeries(dailyRow, 30);
    const pct = (a, b) => isNum(a) && isNum(b) && a ? (b - a) / a * 100 : null;
    const priceAt = n => { const s = series.slice(-n).filter(d => d.price); return s.length ? s[0].price : null; };
    const lastP = (series.filter(d => d.price).pop() || {}).price ?? null;
    const out = {};
    [3, 7, 14, 30].forEach(n => out[n + 'd'] = pct(priceAt(n), lastP));
    const hp = ((hourlyRow && hourlyRow.data) || []).filter(p => Date.parse(p.timestamp + 'Z') >= Date.now() - 86400000 && p.avg_price > 0);
    out['24h'] = hp.length >= 2 ? pct(hp[0].avg_price, hp[hp.length - 1].avg_price) : null;
    out.cv = SM.risk.volatility(series.map(d => d.price));
    out.lastPrice = lastP; out.avgPrice = (() => { const v = series.reduce((s, d) => s + d.count, 0); return v ? series.reduce((s, d) => s + (d.price || 0) * d.count, 0) / v : null; })();
    return out;
  }

  SM.forecast = { HORIZONS, SCEN, forecast, learningFactor, inventoryRatio, trends };
})(typeof window !== 'undefined' ? window : globalThis);
