/* Silver Master — "¿Qué puedo hacer con mi silver?" (Silver Opportunity Finder).
   Presenta alternativas con sus métricas. No declara ninguna como "la mejor". */
(function (root) {
  const SM = root.SM = root.SM || {};
  /* Perfiles de riesgo: heurísticas propias de la app (no son reglas del juego). Editables aquí. */
  const RISK = {
    bajo:  { label: 'Bajo',  maxAgeH: 3,  minLiquidity: 20, liquidityCapDays: 1, marketShare: 0.3, minRoi: 5 },
    medio: { label: 'Medio', maxAgeH: 6,  minLiquidity: 5,  liquidityCapDays: 2, marketShare: 0.3, minRoi: 5 },
    alto:  { label: 'Alto',  maxAgeH: 12, minLiquidity: 1,  liquidityCapDays: 3, marketShare: 0.5, minRoi: 0 }
  };
  async function find(o, onProgress) {
    const r = RISK[o.risk] || RISK.medio;
    const res = await SM.scanner.scan({
      categories: o.categories, tierMin: o.tierMin, tierMax: o.tierMax, enchants: o.enchants,
      craftCity: o.city, sellMarkets: o.markets, saleMode: o.saleMode || 'instant', focus: o.focus,
      maxAgeH: r.maxAgeH, quantityMode: 'capital', liquidityCapDays: r.liquidityCapDays, marketShare: r.marketShare,
      minLiquidity: r.minLiquidity, minRoi: r.minRoi, minProfit: 1, liquidityTop: 80
    }, onProgress);
    const hours = +o.hours || 0;
    res.rows.forEach(e => {
      e.fitsTime = !e.calc.minutes || !hours || e.calc.minutes <= hours * 60;
    });
    res.risk = r;
    return res;
  }
  SM.finder = { RISK, find };
})(typeof window !== 'undefined' ? window : globalThis);
