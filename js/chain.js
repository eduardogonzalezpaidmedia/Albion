/* Silver Master — cadena de producción: ¿comprar el material refinado o refinarlo tú?
   Para cada material de la receta que también se puede fabricar (refinado), calcula el costo de refinarlo
   y lo compara con su precio de compra. */
(function (root) {
  const SM = root.SM = root.SM || {};

  /** Materiales de la receta que tienen receta propia (se pueden refinar/fabricar). */
  function craftableMaterials(itemId) {
    const r = SM.crafting.recipe(itemId); if (!r) return [];
    return r.materials.map(m => SM.crafting.item(m.item_id)).filter(it => it && SM.crafting.recipe(it.item_id));
  }
  /** IDs que hay que consultar para refinar esos materiales. */
  function subMaterialIds(itemId) {
    return [...new Set(craftableMaterials(itemId).flatMap(it => SM.crafting.recipe(it.item_id).materials.map(m => m.item_id)))];
  }

  /**
   * e: evaluación del objeto (SM.engine.evaluate). idx: índice de precios con los sub-materiales.
   * base: contexto usado para e. o = {refineWhere: 'bonus'|'same', focus: bool}
   */
  function analyze(e, idx, base, o) {
    const rows = [];
    for (const line of e.calc.lines) {
      const mi = SM.crafting.item(line.item_id);
      if (!mi || !SM.crafting.recipe(mi.item_id)) continue;
      const city = o.refineWhere === 'bonus' ? (SM.crafting.bonusCity(mi) || base.craftCity) : base.craftCity;
      const qty = Math.max(1, line.toBuy || 0);
      const re = SM.engine.evaluate(mi, idx, Object.assign({}, base, {
        craftCity: city, focus: !!o.focus, units: qty, bonusOverride: null, manualRatePct: null,
        manualSale: 1, fee: { value: 0, mode: 'total' }, transport: { legs: [], perUnit: 0 }, otherCosts: 0
      }));
      const refineUnit = re.calc.materialCost !== null ? re.calc.materialCost / re.calc.made : null;
      const buyUnit = line.price;
      const saving = refineUnit !== null && buyUnit !== null ? (buyUnit - refineUnit) * qty : null;
      rows.push({ item: mi, qty, city, rr: re.rr, refineUnit, buyUnit, saving, eval: re, better: saving === null ? null : saving > 0 ? 'refinar' : 'comprar' });
    }
    const totalSaving = rows.reduce((s, r) => s + (r.saving > 0 ? r.saving : 0), 0);
    return { rows, totalSaving, chainProfit: e.calc.profit === null ? null : e.calc.profit + totalSaving };
  }

  SM.chain = { craftableMaterials, subMaterialIds, analyze };
})(typeof window !== 'undefined' ? window : globalThis);
