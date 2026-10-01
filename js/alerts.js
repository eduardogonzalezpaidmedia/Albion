/* Silver Master — alertas de oportunidades (revisión manual; preparado para un Worker programado). */
(function (root) {
  const SM = root.SM = root.SM || {};
  const TYPES = {
    profit_gt: 'Profit del lote mayor que',
    roi_gt: 'ROI (%) mayor que',
    price_lt: 'Precio de un objeto menor que',
    bm_gt: 'Mercado Negro paga más que'
  };

  /** rows: resultados del scanner. idx: índice de precios. Devuelve alertas disparadas. */
  function check(rows, idx) {
    const rules = SM.storage.alerts();
    const hits = [];
    for (const r of rules) {
      if (!r.active) continue;
      if (r.type === 'profit_gt') (rows || []).forEach(e => { if (e.calc.profit > r.value) hits.push({ rule: r, text: SM.crafting.label(e.item.item_id) + ': profit ' + Math.round(e.calc.profit).toLocaleString('es-CL'), itemId: e.item.item_id }); });
      if (r.type === 'roi_gt') (rows || []).forEach(e => { if (e.calc.roi > r.value) hits.push({ rule: r, text: SM.crafting.label(e.item.item_id) + ': ROI ' + e.calc.roi.toFixed(1) + '%', itemId: e.item.item_id }); });
      if (r.type === 'price_lt' && idx && r.itemId) {
        const b = SM.market.cheapestBuy(idx, r.itemId, SM.crafting.buyLocations(), null);
        if (b && b.price < r.value) hits.push({ rule: r, text: SM.crafting.label(r.itemId) + ' a ' + b.price.toLocaleString('es-CL') + ' en ' + b.location, itemId: r.itemId });
      }
      if (r.type === 'bm_gt' && idx && r.itemId) {
        const o = SM.market.buyOrder(SM.market.row(idx, r.itemId, 'Black Market', 1));
        if (o && o.price > r.value) hits.push({ rule: r, text: 'Mercado Negro paga ' + o.price.toLocaleString('es-CL') + ' por ' + SM.crafting.label(r.itemId), itemId: r.itemId });
      }
    }
    return hits;
  }
  /**
   * Alertas de operaciones (Market Intelligence). idx opcional: índice de precios actuales para detectar caídas.
   * Reglas propias de la app; el umbral de caída se cambia en Riesgo (dropPct).
   */
  function checkOps(idx, now) {
    now = now || Date.now();
    const hits = [], H = 3600000, drop = (SM.storage.get('ops-alerts', { dropPct: 10 }).dropPct) || 10;
    (SM.journal ? SM.journal.all() : []).forEach(b => {
      const st = SM.journal.statusOf(b); if (st !== 'active') return;
      const s = SM.journal.stats(b), name = SM.crafting.label(b.item_id), age = (now - b.date) / H;
      [24, 48, 72].forEach(h => { if (age >= h && age < h + 24) hits.push({ kind: 'time', text: `${name}: la operación cumplió ${h} h (${s.sold}/${b.units} vendidas)`, id: b.id }); });
      if (b.plan && b.plan.rate > 0 && age >= 24) {
        const expected = b.plan.rate * age / 24;
        if (s.sold < expected * 0.5) hits.push({ kind: 'slow', text: `${name}: rota más lento de lo esperado (${s.sold} vendidas vs ~${Math.round(Math.min(expected, b.units))} proyectadas)`, id: b.id });
        if (b.plan.estHours && age > b.plan.estHours * 1.5 && !s.done) hits.push({ kind: 'late', text: `${name}: pasó el plazo estimado (${Math.round(b.plan.estHours)} h) y quedan ${s.remaining}`, id: b.id });
      }
      if (b.plan && b.plan.targetPrice && idx) {
        const r = SM.market.row(idx, b.item_id, b.plan.target, 1);
        const o = b.plan.saleMode === 'order' ? SM.market.sellOrder(r) : SM.market.buyOrder(r);
        if (o) {
          const ch = (o.price - b.plan.targetPrice) / b.plan.targetPrice * 100;
          if (ch <= -drop) hits.push({ kind: 'drop', text: `${name}: el precio en ${b.plan.target} cayó ${Math.abs(ch).toFixed(0)}% (${o.price.toLocaleString('es-CL')} vs ${b.plan.targetPrice.toLocaleString('es-CL')} planeado)`, id: b.id });
          if (ch >= drop) hits.push({ kind: 'up', text: `${name}: el precio en ${b.plan.target} subió ${ch.toFixed(0)}%`, id: b.id });
          if (SM.invest && b.plan.unitCost) { const be = SM.invest.breakeven(b.plan.unitCost, b.plan.saleMode, SM.engine.context().taxPct, SM.engine.context().setupPct); if (o.price < be) hits.push({ kind: 'loss', text: `${name}: al precio actual (${o.price.toLocaleString('es-CL')}) perderías plata; el mínimo es ${Math.round(be).toLocaleString('es-CL')}`, id: b.id }); }
        }
      }
      if (s.done) hits.push({ kind: 'target', text: `${name}: vendiste todo. Ciérrala para que cuente en tus estadísticas.`, id: b.id });
    });
    return hits;
  }
  /** Objetos que las reglas de precio necesitan consultar. */
  const watchedItems = () => SM.storage.alerts().filter(r => r.active && r.itemId).map(r => r.itemId);

  SM.alerts = { TYPES, check, checkOps, watchedItems };
})(typeof window !== 'undefined' ? window : globalThis);
