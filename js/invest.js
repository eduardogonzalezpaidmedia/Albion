/* Silver Master — calculadora de inversión y cantidades (InvestmentCalculator).
   Recibe el COSTO POR UNIDAD ya calculado por el motor de crafteo/refinado/reventa (materiales, retorno,
   tarifa de estación y transporte incluidos), así que no vuelve a descontar nada de eso.
   Aquí solo se aplican los impuestos de VENTA. Cantidades siempre enteras y nunca sobre el capital disponible. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const isNum = v => typeof v === 'number' && isFinite(v);

  /** Ingreso neto por unidad vendida (impuesto + publicación si es orden de venta). */
  function netUnit(price, mode, taxPct, setupPct) { return price * (1 - (taxPct + (mode === 'order' ? setupPct : 0)) / 100); }
  /** Precio mínimo de venta para no perder plata. */
  function breakeven(unitCost, mode, taxPct, setupPct) { return unitCost / (1 - (taxPct + (mode === 'order' ? setupPct : 0)) / 100); }

  /**
   * o = { capital, reserve, maxPctPerOp, unitCost, salePrice, mode, taxPct, setupPct, lot (múltiplo, ej. rendimiento del crafteo),
   *       ratePerDay (velocidad proyectada intermedia, opcional), horizonDays, maxPerItem (presupuesto máx. por artículo, opcional) }
   */
  function plan(o) {
    const lot = Math.max(1, Math.round(o.lot || 1));
    const available = Math.max(0, (o.capital || 0) - (o.reserve || 0));
    let budget = available * Math.min(100, Math.max(0, o.maxPctPerOp ?? 100)) / 100;
    if (o.maxPerItem > 0) budget = Math.min(budget, o.maxPerItem);
    const uc = o.unitCost;
    if (!(uc > 0)) return { ok: false, reason: 'Falta el costo por unidad.' };
    const byCapital = Math.floor(Math.floor(budget / uc) / lot) * lot;
    const byDemand = isNum(o.ratePerDay) && o.horizonDays ? Math.floor(Math.floor(o.ratePerDay * o.horizonDays) / lot) * lot : null;
    const qty = byDemand === null ? byCapital : Math.min(byCapital, byDemand);
    const limitedBy = byDemand === null ? 'capital' : byDemand < byCapital ? 'demanda' : 'capital';
    const nu = netUnit(o.salePrice, o.mode, o.taxPct, o.setupPct);
    const be = breakeven(uc, o.mode, o.taxPct, o.setupPct);
    const investment = qty * uc;
    const gross = qty * o.salePrice;
    const tax = gross * o.taxPct / 100, setup = o.mode === 'order' ? gross * o.setupPct / 100 : 0;
    const profit = qty * (nu - uc);
    const sens = [0, 5, 10, 15].map(drop => ({ drop, cells: [25, 50, 75, 100].map(st => {
      const sold = Math.floor(qty * st / 100), unsold = qty - sold;
      const cash = sold * nu * (1 - drop / 100) - investment;          // plata recibida menos lo invertido
      return { sellThrough: st, sold, unsold, cash, immobilized: unsold * uc, profitIfAllLater: qty * (nu * (1 - drop / 100) - uc) };
    }) }));
    return {
      ok: true, available, budget, lot, byCapital, byDemand, qty, limitedBy, unitCost: uc, netUnit: nu, breakeven: be,
      investment, gross, tax, setup, profit, roi: investment ? profit / investment * 100 : null, sens,
      exceeds: investment > available,
      notes: [
        `Disponible = capital − reserva = ${Math.round(available).toLocaleString('es-CL')}.`,
        `Máximo por operación = ${o.maxPctPerOp ?? 100}% del disponible${o.maxPerItem > 0 ? ' y no más que el presupuesto por artículo' : ''} = ${Math.round(budget).toLocaleString('es-CL')}.`,
        byDemand === null ? 'Sin historial de ventas: la cantidad solo se limita por capital.' : `Por demanda: ${byDemand} unidades en ${o.horizonDays} día(s) a la velocidad proyectada intermedia.`,
        lot > 1 ? `Cantidades en múltiplos de ${lot} (lo que sale de cada crafteo).` : ''
      ].filter(Boolean)
    };
  }

  SM.invest = { plan, netUnit, breakeven };
})(typeof window !== 'undefined' ? window : globalThis);
