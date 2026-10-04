/* Silver Master — detector de oportunidades y recomendaciones (OpportunityScanner + RecommendationEngine).
   No repite fórmulas: usa SM.scanner (fabricación, refinado, Mercado Negro) y SM.flipping (reventa y arbitraje)
   para el costo y la venta, y SM.forecast / SM.risk / SM.invest para rotación, riesgo y cantidades.
   Ninguna recomendación es una garantía: son estimaciones con los datos disponibles en el momento. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const isNum = v => typeof v === 'number' && isFinite(v);

  const OPS = {
    craft: 'Fabricación', refine: 'Refinamiento', bm: 'Fabricar para el Mercado Negro',
    flip: 'Compra y reventa local', arbitrage: 'Arbitraje entre ciudades'
  };
  const OP_JSON = { craft: 'craft_and_sell', refine: 'refine_and_sell', bm: 'craft_for_black_market', flip: 'buy_and_resell_local', arbitrage: 'buy_and_resell' };
  // Pesos del puntaje (heurística de la app, visibles en la interfaz).
  const RISK_MULT = { bajo: 1, moderado: 0.75, alto: 0.4, insuficiente: 0.25 };
  const CONF_MULT = { alta: 1, media: 0.85, baja: 0.6, insuficiente: 0.4 };
  const DEFAULTS = {
    capital: null, reserve: 0, maxPctPerOp: 25, maxPerItem: 0, minRoi: 5, minProfit: 0,
    tierMin: 4, tierMax: 6, enchants: [0, 1, 2], categories: ['weapons', 'armor', 'head', 'shoes', 'bags', 'capes'],
    ops: ['craft', 'refine', 'bm', 'flip', 'arbitrage'], craftWhere: 'bonus', baseCity: null, cities: null,
    saleMode: 'instant', focus: null, premium: null, riskMax: 'moderado', includeInsufficient: false, longDays: 7, sharePct: null, maxAgeH: null
  };
  const STRATS = [
    { key: '24h', days: 1, label: 'Rápida · 24 h', desc: 'Rotar el capital en un día.' },
    { key: '48h', days: 2, label: 'Rotación · 48 h', desc: 'Ciclo completo en dos días.' },
    { key: '72h', days: 3, label: 'Tres días · 72 h', desc: 'Plazo de hasta tres días.' },
    { key: 'long', days: null, label: 'Largo plazo', desc: 'Más de 3 días: mira el capital inmovilizado y la volatilidad.' }
  ];

  function settings() {
    const P = SM.storage.profile(), F = SM.storage.prefs();
    const s = Object.assign({}, DEFAULTS, SM.storage.get('intel', {}));
    if (s.capital === null) s.capital = P.capital;
    if (!s.baseCity) s.baseCity = P.city;
    if (!s.cities) s.cities = SM.data.cities.filter(c => c.type !== 'black_market').map(c => c.id);
    if (s.focus === null) s.focus = P.focus;
    if (s.premium === null) s.premium = P.premium;
    if (s.sharePct === null) s.sharePct = (F.demand && F.demand.sharePct) || 30;
    if (s.maxAgeH === null) s.maxAgeH = +F.maxAgeHours || 12;
    return s;
  }
  const saveSettings = s => SM.storage.set('intel', s);

  /* ---------- 1. reunir candidatos con los motores existentes ---------- */
  async function gather(s, onProgress) {
    const prog = (msg) => (step, d, t) => onProgress && onProgress(msg + ' · ' + step, d, t);
    const items = SM.data.items.filter(it => it.tier >= s.tierMin && it.tier <= s.tierMax && s.enchants.includes(it.enchantment));
    const craftItems = items.filter(it => s.categories.includes(it.category) && it.category !== 'refined');
    const refItems = items.filter(it => it.category === 'refined');
    const out = [], missing = { craft: 0, refine: 0, bm: 0 };
    const common = { saleMode: s.saleMode, focus: s.focus, premium: s.premium, units: 10, quantityMode: 'fixed', minProfit: -1e15, maxAgeH: s.maxAgeH, liquidityTop: 150 };
    const groupBy = (list, kindRefine) => {
      const g = {};
      list.forEach(it => { const c = s.craftWhere === 'bonus' ? (SM.crafting.bonusCity(it) || s.baseCity) : s.baseCity; (g[c] = g[c] || []).push(it); });
      return g;
    };
    async function viaScanner(op, list, sellMarkets) {
      const groups = groupBy(list);
      for (const city of Object.keys(groups)) {
        const r = await SM.scanner.scan(Object.assign({}, common, {
          itemIds: groups[city].map(i => i.item_id), tierMin: 2, tierMax: 8, craftCity: city, buyLocations: s.cities, sellMarkets: sellMarkets
        }), prog(OPS[op] + ' (' + city + ')'));
        missing[op] += r.invalid;
        r.rows.forEach(e => out.push(fromEval(op, e, city, r.idx, sellMarkets, s)));
      }
    }
    if (s.ops.includes('craft') && craftItems.length) await viaScanner('craft', craftItems, s.cities);
    if (s.ops.includes('bm') && craftItems.length) await viaScanner('bm', craftItems, ['Black Market']);
    if (s.ops.includes('refine') && refItems.length) await viaScanner('refine', refItems, s.cities);
    const t = SM.engine.context({ premium: s.premium });
    for (const mode of ['flip', 'arbitrage']) {
      if (!s.ops.includes(mode) || !craftItems.length) continue;
      const locs = mode === 'arbitrage' ? s.cities.concat(['Black Market']) : s.cities;
      const r = await SM.flipping.scan({ ids: craftItems.map(i => i.item_id).concat(refItems.map(i => i.item_id)), locations: locs, mode: mode === 'flip' ? 'same' : 'cross', saleMode: s.saleMode,
        maxAgeH: s.maxAgeH, minProfit: 1, minRoi: 0, taxPct: t.taxPct, setupPct: t.setupPct, transportPerUnit: +SM.storage.prefs().transportPerUnit || 0, liquidityTop: 150, capital: 0, buyLocs: mode === 'arbitrage' && s.buyFrom ? s.buyFrom : null }, prog(OPS[mode]));
      r.rows.forEach(x => out.push(fromFlip(mode, x, r.idx, locs, s, t)));
    }
    return { cands: out, missing };
  }

  function fromEval(op, e, craftCity, idx, markets, s) {
    const c = e.calc, made = c.made;
    const srcCities = [...new Set(Object.values(e.buys).filter(Boolean).map(b => b.location))];
    const mode = c.sale.mode;
    // precios del objeto por ciudad, para detectar diferencias anormales
    const byCity = {};
    SM.market.byLocation(idx, e.item.item_id, markets, 1).forEach(x => { const o = mode === 'order' ? x.sell : x.buy; if (o) byCity[x.location] = o.price; });
    // comparación: vender los materiales al instante (si ya los tienes) vs fabricar
    let matSale = 0, matOk = true;
    c.lines.forEach(l => { let best = null; s.cities.forEach(loc => { const o = SM.market.buyOrder(SM.market.row(idx, l.item_id, loc, 1)); if (o && (!best || o.price > best)) best = o.price; }); if (best === null) matOk = false; else matSale += l.needed * best; });
    // refinado: ¿sale más barato refinar que comprarlo ya refinado?
    let buyRefined = null;
    if (op === 'refine') { const b = SM.market.cheapestBuy(idx, e.item.item_id, s.cities, s.maxAgeH); buyRefined = b ? b.price : null; }
    return {
      op, item: e.item, itemId: e.item.item_id, sourceCity: srcCities.join(', ') || craftCity, craftCity, targetCity: e.sale.location, mode,
      unitCost: c.totalCost / made, salePrice: e.sale.price, lot: c.yieldN || 1, histRow: e.histRow || null, ageMinutes: e.oldestMinutes,
      perUnit: { materials: c.materialCost / made, fee: c.craftingFee / made, transport: c.transport / made, other: (c.otherCosts || 0) / made },
      returnRate: e.rr.rate, bonus: !!e.rr.bonusKind, byCity, row: SM.market.row(idx, e.item.item_id, e.sale.location, 1),
      matSaleNet: matOk ? matSale * (1 - SM.engine.context({ premium: s.premium }).taxPct / 100) / made : null, buyRefined,
      redZone: e.sale.location === 'Black Market' || e.sale.location === 'Caerleon' || srcCities.includes('Caerleon')
    };
  }
  function fromFlip(op, x, idx, locs, s, t) {
    const it = SM.crafting.item(x.id) || { item_id: x.id, name: SM.crafting.name(x.id), tier: SM.crafting.tierOf(x.id), enchantment: SM.crafting.enchOf(x.id), category: '' };
    const mode = op === 'flip' ? 'order' : (x.sellLoc === 'Black Market' ? 'instant' : s.saleMode);
    const byCity = {};
    SM.market.byLocation(idx, x.id, locs, 1).forEach(y => { const o = mode === 'order' ? y.sell : y.buy; if (o) byCity[y.location] = o.price; });
    return {
      op, item: it, itemId: x.id, sourceCity: x.buyLoc, targetCity: x.sellLoc, mode, unitCost: x.cost, salePrice: x.sell, lot: 1,
      histRow: x.histRow || null, ageMinutes: x.age, perUnit: { purchase: x.buy, transport: x.cost - x.buy - (op === 'flip' ? x.buy * t.setupPct / 100 : 0), buySetup: op === 'flip' ? x.buy * t.setupPct / 100 : 0 },
      byCity, row: SM.market.row(idx, x.id, x.sellLoc, 1), buyType: x.buyType,
      redZone: [x.buyLoc, x.sellLoc].some(l => l === 'Black Market' || l === 'Caerleon')
    };
  }

  /* ---------- 2. convertir un candidato en recomendación para un plazo ---------- */
  function build(c, s, strat, ctx) {
    const days = strat.days || s.longDays;
    const fc1 = SM.forecast.forecast({ histRow: c.histRow, qty: 1, unitCost: c.unitCost, sharePct: s.sharePct, mode: c.mode, salePrice: c.salePrice });
    const rate = fc1.ok ? fc1.rate.mid : null;
    const pl = SM.invest.plan({ capital: s.capital, reserve: s.reserve, maxPctPerOp: s.maxPctPerOp, maxPerItem: s.maxPerItem, unitCost: c.unitCost, salePrice: c.salePrice,
      mode: c.mode, taxPct: ctx.taxPct, setupPct: ctx.setupPct, lot: c.lot, ratePerDay: rate, horizonDays: days });
    if (!pl.ok || pl.qty < 1) return null;
    const fc = SM.forecast.forecast({ histRow: c.histRow, qty: pl.qty, unitCost: c.unitCost, sharePct: s.sharePct, mode: c.mode, salePrice: c.salePrice });
    const series = fc.series || [];
    const trend = SM.demand.priceTrend(series, 14);
    const rk = SM.risk.evaluate({
      hasPrice: true, ageMinutes: c.ageMinutes, dailyVolume: fc.observedVolume ? fc.observedVolume.perDay7 : null, historyDays: fc.observed || 0,
      cv: SM.risk.volatility(series.map(d => d.price)), inventoryRatio: SM.forecast.inventoryRatio(fc, days),
      outlier: SM.risk.outlier(c.salePrice, series.map(d => d.price)), trendPctPerDay: trend ? trend.pctPerDay : null,
      redZone: c.redZone, spreadFlags: SM.risk.checkRow(c.row).filter(f => f.includes('desfasado')),
      cityGap: SM.risk.cityGap(c.byCity, c.targetCity), competition: c.mode === 'order' && fc.ok ? fc.pos : null
    });
    const R = SM.risk.rules();
    let conf = fc.ok ? fc.confidence : 'insuficiente';
    if (isNum(c.ageMinutes) && c.ageMinutes > R.staleVeryH * 60) conf = conf === 'insuficiente' ? conf : 'baja';
    else if (isNum(c.ageMinutes) && c.ageMinutes > R.staleH * 60 && conf === 'alta') conf = 'media';
    const soldH = fc.ok ? Math.min(pl.qty, Math.floor(fc.rate.mid * days)) : 0;
    const expected = soldH * (pl.netUnit - c.unitCost);
    const score = expected * RISK_MULT[rk.level] * CONF_MULT[conf];
    const hrs = fc.ok ? fc.estimatedSaleHours : null;
    const reasons = [];
    reasons.push(`Ganancia neta estimada ${fmt(pl.profit)} (${pct(pl.roi)}) si vendes las ${pl.qty} unidades a ${fmt(c.salePrice)}.`);
    if (fc.ok) reasons.push(`AODP registró ~${fc.observedVolume.perDay7.toFixed(1)} unidades/día (7 días). Con tu parte del mercado venderías ~${fc.rate.mid.toFixed(1)}/día: todo en ~${fmtH(hrs)} (escenario intermedio).`);
    else reasons.push('Sin historial de ventas en AODP: no se puede estimar la rotación. La cantidad solo se limitó por capital.');
    reasons.push(`Cantidad limitada por ${pl.limitedBy}. Precio mínimo para no perder: ${fmt(pl.breakeven)}.`);
    if (c.op === 'refine' && c.buyRefined) reasons.push(c.unitCost < c.buyRefined ? `Refinar te cuesta ${fmt(c.unitCost)} por unidad; comprarlo ya refinado cuesta ${fmt(c.buyRefined)}.` : `Comprarlo refinado (${fmt(c.buyRefined)}) sale más barato que refinarlo (${fmt(c.unitCost)}).`);
    if ((c.op === 'craft' || c.op === 'bm') && isNum(c.matSaleNet)) reasons.push(c.matSaleNet > pl.netUnit ? `Ojo: si ya tienes los materiales, venderlos al instante daría ${fmt(c.matSaleNet)} por unidad fabricada, más que fabricar (${fmt(pl.netUnit)}).` : `Fabricar (${fmt(pl.netUnit)} neto por unidad) rinde más que vender los materiales al instante (${fmt(c.matSaleNet)}).`);
    if (c.op === 'bm') reasons.push('La orden de compra del Mercado Negro puede llenarse o bajar antes de que llegues: no se garantiza el precio.');
    if (c.op === 'flip') reasons.push('Tu orden de compra también tarda en llenarse: la rotación real puede ser más lenta.');
    const rec = {
      id: c.op + '|' + c.itemId + '|' + c.sourceCity + '|' + c.targetCity, strategy: strat.key,
      itemId: c.itemId, name: c.item.name, tier: c.item.tier, enchantment: c.item.enchantment, category: c.item.category,
      operation: OP_JSON[c.op], op: c.op, opLabel: OPS[c.op], sourceCity: c.sourceCity, craftCity: c.craftCity || null, targetCity: c.targetCity, saleMode: c.mode,
      buyPrice: round(c.unitCost), targetSellPrice: c.salePrice, quantity: pl.qty, totalInvestment: round(pl.investment),
      costs: Object.assign({}, roundAll(Object.fromEntries(Object.entries(c.perUnit).map(([k, v]) => [k, v * pl.qty]))), { salesTax: round(pl.tax), setupFee: round(pl.setup) }),
      grossRevenue: round(pl.gross), estimatedNetProfit: round(pl.profit), estimatedRoiPercent: pl.roi === null ? null : +pl.roi.toFixed(2),
      breakevenPrice: round(pl.breakeven), expectedProfitInHorizon: round(expected), horizonDays: days,
      estimatedSaleHours: hrs === null || !isFinite(hrs) ? null : Math.round(hrs),
      sold: fc.ok ? fc.table.find(r => r.days === Math.min(30, Math.max(1, days))) || null : null,
      risk: rk.level, riskLabel: rk.label, riskScore: rk.score, riskFactors: rk.factors, confidence: conf, score: round(score),
      reasons, assumptions: (fc.assumptions || []).concat(pl.notes), forecast: fc, plan: pl, ratePerDay: rate,
      liquidity: fc.ok ? fc.observedVolume.perDay7 : null, volatility: SM.risk.volatility(series.map(d => d.price)),
      dataTimestamp: new Date(Date.now() - (c.ageMinutes || 0) * 60000).toISOString(), calculatedAt: new Date().toISOString(), returnRate: c.returnRate ?? null
    };
    return rec;
  }

  /* ---------- 3. estrategias + cartera que no supera el capital ---------- */
  function strategies(cands, s) {
    const ctx = SM.engine.context({ premium: s.premium });
    const maxRisk = SM.risk.ORDER[s.riskMax] ?? 1;
    const out = {};
    for (const st of STRATS) {
      let recs = cands.map(c => build(c, s, st, ctx)).filter(Boolean)
        .filter(r => r.estimatedNetProfit >= s.minProfit && (r.estimatedRoiPercent ?? -1) >= s.minRoi)
        .filter(r => r.risk === 'insuficiente' ? s.includeInsufficient && st.key === 'long' : SM.risk.ORDER[r.risk] <= maxRisk);
      if (st.key !== 'long') recs = recs.filter(r => r.estimatedSaleHours !== null && r.estimatedSaleHours <= st.days * 24);
      else recs = recs.filter(r => r.estimatedSaleHours === null || r.estimatedSaleHours > 72 || r.horizonDays > 3);
      // una sola entrada por operación (la de mayor puntaje)
      const best = {}; recs.forEach(r => { if (!best[r.id] || r.score > best[r.id].score) best[r.id] = r; });
      recs = Object.values(best).sort((a, b) => b.score - a.score);
      const available = Math.max(0, s.capital - s.reserve);
      let used = 0, profit = 0;
      recs.forEach(r => { if (used + r.totalInvestment <= available && r.score > 0) { r.inPortfolio = true; used += r.totalInvestment; profit += r.expectedProfitInHorizon; } else r.inPortfolio = false; });
      out[st.key] = { strat: st, recs, portfolio: { available, used, free: available - used, expected: profit, count: recs.filter(r => r.inPortfolio).length } };
    }
    return out;
  }

  /** Ejecuta todo y guarda el resultado en memoria (SM.intel.last) para el panel y el asistente. */
  async function run(s, onProgress) {
    s = Object.assign(settings(), s || {});
    const g = await gather(s, onProgress);
    const res = { settings: s, candidates: g.cands, missing: g.missing, strategies: strategies(g.cands, s), at: Date.now() };
    SM.intel = SM.intel || {}; SM.intel.last = res;
    return res;
  }
  /** Recalcula estrategias con otros filtros SIN volver a consultar la API. */
  function recalc(s) {
    if (!SM.intel || !SM.intel.last) return null;
    const L = SM.intel.last; L.settings = Object.assign({}, L.settings, s || {}); L.strategies = strategies(L.candidates, L.settings); return L;
  }
  /** JSON limpio de una recomendación (interfaz entre módulos). */
  function toJSON(r) {
    const o = {}; ['itemId', 'name', 'tier', 'enchantment', 'operation', 'sourceCity', 'craftCity', 'targetCity', 'saleMode', 'buyPrice', 'targetSellPrice', 'quantity', 'totalInvestment', 'costs', 'grossRevenue', 'estimatedNetProfit', 'estimatedRoiPercent', 'breakevenPrice', 'estimatedSaleHours', 'risk', 'riskScore', 'confidence', 'score', 'strategy', 'dataTimestamp', 'calculatedAt'].forEach(k => o[k] = r[k]);
    o.riskFactors = r.riskFactors.map(f => f.label + ' (+' + f.pts + ')'); o.reasons = r.reasons; o.assumptions = r.assumptions;
    return o;
  }

  const round = v => isNum(v) ? Math.round(v) : null;
  const roundAll = o => { const r = {}; for (const k in o) r[k] = round(o[k]); return r; };
  const fmt = n => isNum(n) ? Math.round(n).toLocaleString('es-CL') : '—';
  const pct = n => isNum(n) ? n.toFixed(1) + '%' : '—';
  const fmtH = h => !isNum(h) ? '—' : h < 1 ? 'menos de 1 h' : h < 48 ? Math.round(h) + ' h' : (h / 24).toFixed(1) + ' días';

  SM.recommend = { OPS, OP_JSON, STRATS, RISK_MULT, CONF_MULT, DEFAULTS, settings, saveSettings, gather, build, strategies, run, recalc, toJSON, fmtH };
})(typeof window !== 'undefined' ? window : globalThis);
