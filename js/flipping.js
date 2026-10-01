/* Silver Master — reventa sin fabricar (flipping).
   Misma ciudad: pones una orden de compra (un poco sobre la más alta) y revendes con orden de venta (un poco bajo la más barata).
   Entre ciudades: compras al instante en A y vendes en B (al instante o publicando orden). */
(function (root) {
  const SM = root.SM = root.SM || {};
  const isNum = v => typeof v === 'number' && isFinite(v);

  /** Ganancia por unidad publicando orden de compra y orden de venta en el mismo mercado. */
  function sameMarket(buyOrder, sellOrder, t) {
    if (!buyOrder || !sellOrder) return null;
    const step = t.undercut ?? 1;
    const buy = buyOrder.price + step, sell = sellOrder.price - step;
    if (!(sell > buy)) return null;
    const cost = buy * (1 + t.setupPct / 100);                       // publicar la orden de compra paga publicación
    const net = sell * (1 - (t.taxPct + t.setupPct) / 100);          // publicar la orden de venta: impuesto + publicación
    return { buy, sell, cost, net, profit: net - cost, roi: (net - cost) / cost * 100 };
  }

  /** Comprar al instante en A (orden de venta de A) y vender en B. mode 'instant' (orden de compra de B) u 'order'. */
  function crossMarket(sellOrderA, rowB, mode, t) {
    if (!sellOrderA || !rowB) return null;
    const step = t.undercut ?? 1;
    const buy = sellOrderA.price;
    let sell, net;
    if (mode === 'instant') { const b = SM.market.buyOrder(rowB); if (!b) return null; sell = b.price; net = sell * (1 - t.taxPct / 100); }
    else { const s = SM.market.sellOrder(rowB); if (!s) return null; sell = s.price - step; net = sell * (1 - (t.taxPct + t.setupPct) / 100); }
    const cost = buy + (t.transportPerUnit || 0);
    if (!(net > cost)) return null;
    return { buy, sell, cost, net, profit: net - cost, roi: (net - cost) / cost * 100 };
  }

  /**
   * f = { ids, locations, mode:'same'|'cross', saleMode, maxAgeH, minProfit, minRoi, capital, days, sharePct, transportPerUnit, taxPct, setupPct }
   */
  async function scan(f, onProgress) {
    const p = await SM.api.getPrices(f.ids, f.locations, [1], { onProgress: (d, t) => onProgress && onProgress('Precios', d, t) });
    const idx = SM.market.index(p.rows);
    const fresh = d => SM.market.fresh(d, f.maxAgeH);
    const t = { taxPct: f.taxPct, setupPct: f.setupPct, transportPerUnit: f.transportPerUnit, undercut: 1 };
    const rows = [];
    for (const id of f.ids) {
      if (f.mode === 'same') {
        for (const loc of f.locations) {
          if (loc === 'Black Market') continue;
          const r = SM.market.row(idx, id, loc, 1);
          const bo = SM.market.buyOrder(r), so = SM.market.sellOrder(r);
          if (!bo || !so || !fresh(bo.date) || !fresh(so.date)) continue;
          const x = sameMarket(bo, so, t); if (!x) continue;
          rows.push(Object.assign(x, { id, buyLoc: loc, sellLoc: loc, buyType: 'Orden de compra', sellType: 'Orden de venta', age: Math.max(SM.market.ageMinutes(bo.date), SM.market.ageMinutes(so.date)) }));
        }
      } else {
        for (const a of f.locations) {
          if (a === 'Black Market') continue;
          const so = SM.market.sellOrder(SM.market.row(idx, id, a, 1));
          if (!so || !fresh(so.date)) continue;
          for (const b of f.locations) {
            if (b === a) continue;
            const mode = b === 'Black Market' ? 'instant' : f.saleMode;
            const rb = SM.market.row(idx, id, b, 1);
            const ob = mode === 'instant' ? SM.market.buyOrder(rb) : SM.market.sellOrder(rb);
            if (!ob || !fresh(ob.date)) continue;
            const x = crossMarket(so, rb, mode, t); if (!x) continue;
            rows.push(Object.assign(x, { id, buyLoc: a, sellLoc: b, buyType: 'Compra directa', sellType: mode === 'instant' ? 'Venta inmediata' : 'Orden de venta', age: Math.max(SM.market.ageMinutes(so.date), SM.market.ageMinutes(ob.date)) }));
          }
        }
      }
    }
    let out = rows.filter(r => r.profit >= (f.minProfit || 0) && r.roi >= (f.minRoi || 0) && r.roi <= (f.maxRoi || 300));
    // por objeto, quedarse con la mejor combinación
    const best = {};
    out.forEach(r => { if (!best[r.id] || r.profit > best[r.id].profit) best[r.id] = r; });
    out = Object.values(best).sort((a, b) => b.profit - a.profit);
    // liquidez en el mercado de venta para los primeros
    const top = out.slice(0, 80), byLoc = {};
    top.forEach(r => (byLoc[r.sellLoc] = byLoc[r.sellLoc] || []).push(r.id));
    const V = {};
    for (const loc in byLoc) {
      const h = await SM.api.getHistory(byLoc[loc], [loc], [1], 24, { onProgress: (d, tt) => onProgress && onProgress('Liquidez', d, tt) });
      h.rows.forEach(x => { V[x.item_id + '|' + x.location] = SM.market.dailyVolume(x, 7); });
    }
    const share = (f.sharePct || 30) / 100, days = f.days || 3;
    out.forEach(r => {
      r.liquidity = V[r.id + '|' + r.sellLoc] ?? null;
      const byCap = f.capital > 0 ? Math.floor(f.capital / r.cost) : Infinity;
      const byVol = r.liquidity === null ? null : Math.floor(r.liquidity * days * share);
      r.qty = byVol === null ? (isFinite(byCap) ? byCap : null) : Math.min(byCap, byVol);
      r.totalProfit = r.qty ? r.qty * r.profit : null;
      r.capitalNeeded = r.qty ? r.qty * r.cost : null;
    });
    return { rows: out, scanned: f.ids.length, stale: p.stale, errors: p.errors };
  }

  SM.flipping = { sameMarket, crossMarket, scan };
})(typeof window !== 'undefined' ? window : globalThis);
