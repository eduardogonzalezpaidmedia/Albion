/* Silver Master — artefactos para el Mercado Negro.
   Busca objetos que llevan artefacto, calcula cuánto costaría conseguir el artefacto con ORDEN DE COMPRA
   (superando la orden más alta de la ciudad donde esa orden es más baja, más la tarifa de publicación)
   y la ganancia de fabricar el objeto y venderlo al Mercado Negro. Ordena por ganancia diaria posible.
   Reutiliza SM.scanner (mismo motor de costos). Calidad normal. Estimaciones, no garantías. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const BM = 'Black Market';
  const isArt = id => id.indexOf('_ARTEFACT_') > 0;
  const artOf = it => { const r = SM.crafting.recipe(it.item_id); const m = r && r.materials.find(x => isArt(x.item_id)); return m ? m.item_id : null; };

  /** Plan de compra de un artefacto: dónde poner la orden de compra y cuánto ofrecer. */
  function buyPlan(idx, artId, cities, maxAgeH, setupPct, overbid) {
    let order = null, instant = null;
    for (const c of cities) {
      const r = SM.market.row(idx, artId, c, 1), bo = SM.market.buyOrder(r), so = SM.market.sellOrder(r);
      if (bo && SM.market.fresh(bo.date, maxAgeH) && (!order || bo.price < order.top)) order = { city: c, top: bo.price, date: bo.date };
      if (so && SM.market.fresh(so.date, maxAgeH) && (!instant || so.price < instant.price)) instant = { city: c, price: so.price, date: so.date };
    }
    if (order) { order.bid = order.top + (overbid ?? 1); order.cost = order.bid * (1 + setupPct / 100); }
    // si ofrecer más que la orden más alta ya cuesta lo mismo o más que comprar directo, conviene comprar directo
    const useOrder = !!order && (!instant || order.cost < instant.price);
    return { order, instant, useOrder, price: useOrder ? order.cost : instant ? instant.price : null, saving: order && instant ? instant.price - order.cost : null };
  }

  /** f = { tierMin, tierMax, enchants, cities, craftWhere, baseCity, focus, premium, units, minRoi, sharePct, maxAgeH } */
  async function scan(f, onProgress) {
    const prog = msg => (d, t) => onProgress && onProgress(msg, d, t);
    const items = SM.data.items.filter(it => it.tier >= f.tierMin && it.tier <= f.tierMax && f.enchants.includes(it.enchantment) && artOf(it));
    if (!items.length) return { rows: [], scanned: 0, noArt: 0, invalid: 0 };
    const artIds = [...new Set(items.map(artOf))];
    const ctx = SM.engine.context({ premium: f.premium });
    const pa = await SM.api.getPrices(artIds, f.cities, [1], { onProgress: prog('Precios de artefactos') });
    const aidx = SM.market.index(pa.rows);
    const plans = {}, manual = {};
    artIds.forEach(id => { const p = buyPlan(aidx, id, f.cities, f.maxAgeH, ctx.setupPct, 1); plans[id] = p; if (p.price) manual[id] = { price: p.price }; });
    const usable = items.filter(it => plans[artOf(it)].price);
    const groups = {};
    usable.forEach(it => { const c = f.craftWhere === 'bonus' ? (SM.crafting.bonusCity(it) || f.baseCity) : f.baseCity; (groups[c] = groups[c] || []).push(it.item_id); });
    let rows = [], invalid = 0, stale = pa.stale;
    for (const city of Object.keys(groups)) {
      const r = await SM.scanner.scan({ itemIds: groups[city], tierMin: 2, tierMax: 8, craftCity: city, buyLocations: f.cities, sellMarkets: [BM], saleMode: 'instant',
        focus: f.focus, premium: f.premium, units: f.units || 10, quantityMode: 'fixed', minProfit: 1, minRoi: f.minRoi ?? 0, maxAgeH: f.maxAgeH, manualPrices: manual, liquidityTop: 200 },
        (step, d, t) => onProgress && onProgress('Objetos (' + city + ') · ' + step, d, t));
      invalid += r.invalid; stale = stale || r.stale;
      r.rows.forEach(e => { e.craftCity = city; rows.push(e); });
    }
    const share = Math.min(100, Math.max(1, f.sharePct || 30)) / 100;
    rows.forEach(e => {
      e.artId = artOf(e.item); e.plan = plans[e.artId];
      const line = e.calc.lines.find(l => l.item_id === e.artId);
      e.artPerUnit = line ? line.needed / e.calc.made : 1;
      e.profitUnit = e.calc.profit / e.calc.made;
      e.dailyProfit = e.liquidity == null ? null : e.profitUnit * e.liquidity * share;
      e.perDayMine = e.liquidity == null ? null : e.liquidity * share;
    });
    rows.sort((a, b) => (b.dailyProfit ?? -1) - (a.dailyProfit ?? -1) || b.profitUnit - a.profitUnit);
    // ¿cuánto se mueve el artefacto donde pondrías la orden? (para saber si tu orden se llenaría)
    const top = rows.slice(0, 80), byCity = {};
    top.forEach(e => { const c = e.plan.useOrder ? e.plan.order.city : e.plan.instant.city; (byCity[c] = byCity[c] || new Set()).add(e.artId); });
    const AV = {};
    for (const c in byCity) { const h = await SM.api.getHistory([...byCity[c]], [c], [1], 24, { onProgress: prog('Movimiento de artefactos') }); h.rows.forEach(x => { AV[x.item_id + '|' + x.location] = SM.market.dailyVolume(x, 7); }); }
    top.forEach(e => { const c = e.plan.useOrder ? e.plan.order.city : e.plan.instant.city; e.artVolume = AV[e.artId + '|' + c] ?? null; });
    return { rows, scanned: items.length, noArt: items.length - usable.length, invalid, stale, share };
  }

  SM.artifacts = { isArt, artOf, buyPlan, scan };
})(typeof window !== 'undefined' ? window : globalThis);
