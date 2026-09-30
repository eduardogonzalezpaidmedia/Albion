/* Silver Master — análisis de rutas: compra → transporte → fabricación → transporte → venta. */
(function (root) {
  const SM = root.SM = root.SM || {};

  /** Consulta los precios que necesita una ruta de un objeto (materiales en todas las ciudades y producto en todos los mercados). */
  async function loadPrices(it, quality) {
    const r = SM.crafting.recipe(it.item_id);
    const mats = r ? r.materials.map(m => m.item_id) : [];
    const p1 = await SM.api.getPrices(mats, SM.crafting.buyLocations(), [1]);
    const p2 = await SM.api.getPrices([it.item_id], SM.crafting.marketLocations(), [quality || 1]);
    const idx = SM.market.index(p1.rows); SM.market.index(p2.rows, idx);
    return { idx, stale: p1.stale || p2.stale, errors: [...p1.errors, ...p2.errors] };
  }

  /**
   * route = {buyFrom: 'cheapest'|ciudad, craftCity, sellMarket, saleMode, transport1, transport2, minutes:{...}}
   */
  function analyze(it, idx, route, base) {
    const m = route.minutes || {};
    const c = SM.engine.context(Object.assign({}, base, {
      buyLocations: route.buyFrom === 'cheapest' ? SM.crafting.buyLocations() : [route.buyFrom],
      craftCity: route.craftCity, sellMarkets: [route.sellMarket],
      saleMode: route.sellMarket === 'Black Market' ? 'instant' : route.saleMode,
      transport: { legs: [+route.transport1 || 0, +route.transport2 || 0], perUnit: 0 },
      minutes: (+m.buy || 0) + (+m.transport1 || 0) + (+m.craft || 0) + (+m.transport2 || 0) + (+m.sell || 0)
    }));
    const e = SM.engine.evaluate(it, idx, c);
    e.route = route;
    return e;
  }

  /** Todas las combinaciones ciudad de fabricación × mercado de venta × modo. */
  function compareAll(it, idx, base, common) {
    const out = [];
    const craftCities = SM.data.cities.filter(c => c.type !== 'black_market').map(c => c.id);
    const markets = SM.crafting.marketLocations();
    for (const cc of craftCities) for (const sm of markets) for (const mode of (sm === 'Black Market' ? ['instant'] : ['instant', 'order'])) {
      const e = analyze(it, idx, Object.assign({}, common, { craftCity: cc, sellMarket: sm, saleMode: mode }), base);
      out.push(e);
    }
    return out;
  }

  SM.routes = { loadPrices, analyze, compareAll };
})(typeof window !== 'undefined' ? window : globalThis);
