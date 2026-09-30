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
  /** Objetos que las reglas de precio necesitan consultar. */
  const watchedItems = () => SM.storage.alerts().filter(r => r.active && r.itemId).map(r => r.itemId);

  SM.alerts = { TYPES, check, watchedItems };
})(typeof window !== 'undefined' ? window : globalThis);
