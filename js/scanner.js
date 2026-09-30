/* Silver Master — evaluación de un objeto y escaneo de oportunidades. */
(function (root) {
  const SM = root.SM = root.SM || {};

  /** Contexto de cálculo desde perfil + preferencias + data/settings.json */
  function context(overrides) {
    const P = SM.storage.profile(), F = SM.storage.prefs(), S = SM.data.settings;
    const premium = overrides && overrides.premium !== undefined ? overrides.premium : P.premium;
    const taxPct = premium ? (F.taxPremiumPct ?? S.taxes.sales_tax_premium_pct) : (F.taxNoPremiumPct ?? S.taxes.sales_tax_no_premium_pct);
    const setupPct = F.setupFeePct ?? S.taxes.setup_fee_pct;
    const m = F.minutes;
    return Object.assign({
      profile: P, prefs: F,
      taxPct, setupPct,
      premium, craftCity: P.city, focus: P.focus, dailyBonus: +F.dailyBonus || 0,
      focusEfficiency: SM.returnRate.focusEfficiency({ ownSpec: P.ownSpec, mastery: P.mastery, otherSpecsSum: P.otherSpecsSum }, S.focus.efficiency_per_level),
      focusSilver: F.focusSilverValue, maxAgeH: +F.maxAgeHours || 12,
      fee: { value: +F.craftingFee || 0, mode: 'per_unit' },
      transport: { legs: [], perUnit: +F.transportPerUnit || 0 },
      minutes: (+m.buy || 0) + (+m.transport1 || 0) + (+m.craft || 0) + (+m.transport2 || 0) + (+m.sell || 0),
      buyLocations: SM.crafting.buyLocations(), sellMarkets: SM.crafting.marketLocations(),
      saleMode: 'instant', quality: 1, units: 10, manualPrices: {}, manualSale: null, bonusOverride: null, manualRatePct: null
    }, overrides || {});
  }

  /** Retorno para un objeto en una ciudad según el contexto. */
  function returnFor(it, c) {
    const city = SM.crafting.city(c.craftCity);
    const auto = SM.crafting.bonusFor(it, c.craftCity);
    let kind = auto.kind;
    if (c.bonusOverride === true) kind = it.category === 'refined' ? 'refining' : 'crafting';
    if (c.bonusOverride === false) kind = null;
    const rr = SM.returnRate.compute({
      locationType: city ? (city.type === 'black_market' ? 'other' : 'royal') : 'other',
      bonusKind: kind, focus: c.focus, dailyBonus: c.dailyBonus, manualPct: c.manualRatePct
    }, SM.data.settings.return_rate.production_bonus);
    rr.autoBonus = auto; rr.bonusKind = kind;
    return rr;
  }

  /** Evalúa un objeto con los precios del índice idx. */
  function evaluate(it, idx, c) {
    const recipe = SM.crafting.recipe(it.item_id);
    const rr = returnFor(it, c);
    const buys = {}, prices = {};
    let oldest = null;
    for (const m of (recipe ? recipe.materials : [])) {
      const man = c.manualPrices && c.manualPrices[m.item_id];
      if (man && man.price > 0) { buys[m.item_id] = { price: man.price, location: 'Manual', manual: true }; prices[m.item_id] = man.price; continue; }
      const b = SM.market.cheapestBuy(idx, m.item_id, c.buyLocations, c.maxAgeH);
      buys[m.item_id] = b; prices[m.item_id] = b ? b.price : null;
      if (b) { const a = SM.market.ageMinutes(b.date); if (oldest === null || a > oldest) oldest = a; }
    }
    let sale = null;
    if (c.manualSale && c.manualSale > 0) sale = { price: c.manualSale, location: 'Manual', mode: c.saleMode, manual: true };
    else sale = SM.market.bestSale(idx, it.item_id, c.sellMarkets, c.saleMode, c.quality, c.maxAgeH);
    if (sale && sale.date) { const a = SM.market.ageMinutes(sale.date); if (oldest === null || a > oldest) oldest = a; }
    const focusPerCraft = c.focus && recipe && recipe.focus_base ? SM.returnRate.focusCost(recipe.focus_base, c.focusEfficiency) : null;
    const calc = SM.profit.craftBatch({
      recipe, units: c.units, prices, returnRate: rr.rate === null ? NaN : rr.rate,
      craftingFee: c.fee, transport: c.transport, otherCosts: c.otherCosts || 0,
      sale: sale ? { unitPrice: sale.price, mode: sale.location === 'Black Market' ? 'instant' : c.saleMode, taxPct: c.taxPct, setupPct: c.setupPct } : {},
      focus: { use: c.focus, costPerCraft: focusPerCraft, silverPerFocus: c.focusSilver }, minutes: c.minutes
    });
    if (rr.rate === null) { calc.ok = false; calc.reasons.push('Falta el porcentaje de retorno (modo MANUAL)'); }
    return { item: it, recipe, rr, buys, sale, calc, oldestMinutes: oldest, focusPerCraft };
  }

  /** Escaneo de muchos objetos. f = filtros + contexto. */
  async function scan(f, onProgress) {
    const c = context(f);
    const favs = SM.storage.favorites();
    let items = SM.data.items.filter(it =>
      (!f.categories || !f.categories.length || f.categories.includes(it.category)) &&
      it.tier >= (f.tierMin || 2) && it.tier <= (f.tierMax || 8) &&
      (!f.enchants || f.enchants.includes(it.enchantment)) &&
      (!f.onlyFavorites || favs.includes(it.item_id)) &&
      (!f.itemIds || f.itemIds.includes(it.item_id)));
    if (!items.length) return { rows: [], invalid: 0, scanned: 0, message: 'Ningún objeto coincide con los filtros.' };
    const mats = [...new Set(items.flatMap(it => (SM.crafting.recipe(it.item_id) || { materials: [] }).materials.map(m => m.item_id)))];
    const prog = (step, d, t) => onProgress && onProgress(step, d, t);
    const p1 = await SM.api.getPrices(mats, c.buyLocations, [1], { onProgress: (d, t) => prog('Materiales', d, t) });
    const qual = c.quality || 1;
    const p2 = await SM.api.getPrices(items.map(i => i.item_id), c.sellMarkets, [qual], { onProgress: (d, t) => prog('Precios de venta', d, t) });
    const idx = SM.market.index(p1.rows); SM.market.index(p2.rows, idx);
    let rows = [], invalid = 0;
    for (const it of items) {
      const e = evaluate(it, idx, c);
      if (!e.calc.ok) { invalid++; continue; }
      rows.push(e);
    }
    // cantidad según capital: se recalcula con la cantidad que alcanza el capital
    if (f.quantityMode === 'capital' && c.profile.capital > 0) {
      rows = rows.map(e => {
        const unitCost = e.calc.totalCost / e.calc.made;
        const units = Math.max(1, Math.floor(c.profile.capital / unitCost));
        return evaluate(e.item, idx, Object.assign({}, c, { units }));
      }).filter(e => e.calc.ok);
    }
    rows = rows.filter(e => e.calc.profit >= (f.minProfit || 0) && (f.minRoi === undefined || f.minRoi === null || e.calc.roi >= f.minRoi));
    if (f.maxCapital) rows = rows.filter(e => e.calc.totalCost <= f.maxCapital);
    rows.sort((a, b) => b.calc.profit - a.calc.profit);
    // liquidez (ventas por día) para los primeros N
    const top = rows.slice(0, f.liquidityTop || 60);
    if (top.length) {
      const byLoc = {};
      top.forEach(e => { const l = e.sale.manual ? null : e.sale.location; if (l) (byLoc[l] = byLoc[l] || []).push(e.item.item_id); });
      const V = {};
      for (const loc in byLoc) {
        const h = await SM.api.getHistory(byLoc[loc], [loc], [qual], 24, { onProgress: (d, t) => prog('Liquidez', d, t) });
        h.rows.forEach(r => { V[r.item_id + '|' + r.location] = { vol: SM.market.dailyVolume(r, 7), days: (r.data || []).length, row: r }; });
      }
      top.forEach(e => {
        const v = V[e.item.item_id + '|' + e.sale.location];
        e.liquidity = v ? v.vol : null; e.historyDays = v ? v.days : 0; e.histRow = v ? v.row : null;
        e.demand = demandFor(e, c);
      });
    }
    // límite por liquidez (Finder / riesgo)
    if (f.liquidityCapDays && f.quantityMode === 'capital') {
      rows = rows.map(e => {
        if (e.liquidity === undefined || e.liquidity === null) return e;
        const cap = Math.floor(e.liquidity * f.liquidityCapDays * (f.marketShare || 0.3));
        if (cap < 1) return null;
        if (cap >= e.calc.made) return e;
        const ne = evaluate(e.item, idx, Object.assign({}, c, { units: cap }));
        ne.liquidity = e.liquidity; ne.historyDays = e.historyDays; ne.cappedByLiquidity = true; ne.histRow = e.histRow; ne.demand = demandFor(ne, c);
        return ne;
      }).filter(Boolean).filter(e => e.calc.ok && e.calc.profit >= (f.minProfit || 0));
    }
    if (f.minLiquidity) rows = rows.filter(e => e.liquidity !== undefined && e.liquidity !== null && e.liquidity >= f.minLiquidity);
    const confCfg = SM.data.settings.confidence;
    rows.forEach(e => {
      const r = SM.market.row(idx, e.item.item_id, e.sale.location, qual);
      e.confidence = SM.market.confidence({ ageMinutes: e.oldestMinutes, hasBuy: !!SM.market.buyOrder(r), hasSell: !!SM.market.sellOrder(r), dailyVolume: e.liquidity, historyDays: e.historyDays }, confCfg);
    });
    return { rows, invalid, scanned: items.length, idx, stale: p1.stale || p2.stale, errors: [...p1.errors, ...p2.errors], context: c };
  }

  /** Cantidad óptima con los ajustes de demanda de Preferencias. */
  function demandFor(e, c) {
    if (!e.histRow || !SM.demand || !e.calc.ok) return null;
    const d = (c.prefs && c.prefs.demand) || { days: 3, sharePct: 30, confidencePct: 80, salvagePct: 50 };
    const a = SM.demand.analyze({ histRow: e.histRow, days: d.days, share: d.sharePct / 100, confidence: d.confidencePct / 100,
      salePrice: e.sale.price, mode: e.calc.sale.mode, netUnit: e.calc.sale.net / e.calc.made, unitCost: e.calc.totalCost / e.calc.made,
      salvagePct: d.salvagePct / 100, yieldN: e.calc.yieldN });
    if (!a.ok) return { ok: false, reason: a.reason };
    return { ok: true, best: a.best.q, bestProfit: a.best.expProfit, safe: a.safe ? a.safe.q : 0, conf: a.conf,
      probCurrent: a.evalQ(e.calc.made).prob, trend: a.trend ? a.trend.direction : null, days: a.days };
  }

  SM.engine = { context, returnFor, evaluate, demandFor };
  SM.scanner = { scan };
})(typeof window !== 'undefined' ? window : globalThis);
