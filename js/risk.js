/* Silver Master — calidad de datos y motor de riesgo (RiskEngine).
   Reglas transparentes por puntos. TODOS los umbrales son heurísticas de la app (no mecánicas del juego)
   y se pueden cambiar en Market Intelligence → Riesgo. Cada resultado dice qué factor sumó cada punto. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const isNum = v => typeof v === 'number' && isFinite(v);

  const DEFAULT_RULES = {
    staleH: 6, staleVeryH: 24,              // antigüedad del precio (horas)
    minVolume: 5, lowVolume: 1,             // unidades observadas por día en AODP
    minHistoryDays: 7,                      // días con registros en los últimos 30
    cvModerate: 15, cvHigh: 30,             // volatilidad del precio diario (coef. de variación, %)
    invModerate: 0.5, invHigh: 1,           // inventario ÷ lo que el mercado absorbería en el plazo (escenario intermedio)
    outlierPct: 60,                         // precio actual vs mediana de 30 días: desvío que se considera atípico
    downtrendPct: 2,                        // caída del precio (%/día) que suma riesgo
    cityGapPct: 150,                        // diferencia entre ciudades que se considera anormal (%)
    redZonePts: 2,                          // transporte por zona roja/negra (muerte y pérdida de carga)
    lowMax: 1, moderateMax: 3               // puntos: ≤ lowMax = bajo, ≤ moderateMax = moderado, más = alto
  };
  const RULE_INFO = {
    staleH: 'Precio con más de estas horas suma 1 punto', staleVeryH: 'Precio con más de estas horas suma 2 puntos',
    minVolume: 'Menos de estas unidades/día observadas suma 1 punto', lowVolume: 'Menos de estas unidades/día suma 2 puntos',
    minHistoryDays: 'Menos de estos días con registros (de 30) suma 1 punto; 0 días = datos insuficientes',
    cvModerate: 'Volatilidad (%) desde la que suma 1 punto', cvHigh: 'Volatilidad (%) desde la que suma 2 puntos',
    invModerate: 'Inventario/absorción desde el que suma 1 punto', invHigh: 'Inventario/absorción desde el que suma 2 puntos',
    outlierPct: 'Desvío (%) frente a la mediana de 30 días que marca precio atípico (2 puntos)',
    downtrendPct: 'Caída diaria (%) del precio que suma 1 punto', cityGapPct: 'Diferencia (%) entre ciudades que se marca como anormal (1 punto)',
    redZonePts: 'Puntos por cruzar zona roja/negra (Caerleon, Mercado Negro)',
    lowMax: 'Máximo de puntos para «Riesgo bajo»', moderateMax: 'Máximo de puntos para «Riesgo moderado»'
  };
  const rules = () => Object.assign({}, DEFAULT_RULES, (SM.storage && SM.storage.get('risk-rules', {})) || {});
  const saveRules = r => SM.storage.set('risk-rules', r);

  /* ---------- calidad de datos ---------- */
  function median(a) { const s = a.filter(isNum).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  /** Coeficiente de variación (%) de una lista de precios. */
  function volatility(prices) {
    const p = prices.filter(v => isNum(v) && v > 0); if (p.length < 3) return null;
    const m = p.reduce((a, b) => a + b, 0) / p.length;
    const sd = Math.sqrt(p.reduce((a, b) => a + (b - m) ** 2, 0) / (p.length - 1));
    return m ? sd / m * 100 : null;
  }
  /** ¿El precio se aleja de la mediana más que tolPct? */
  function outlier(price, refPrices, tolPct) {
    const med = median(refPrices); if (!isNum(price) || !med) return null;
    const dev = (price - med) / med * 100;
    return { median: med, devPct: dev, atypical: Math.abs(dev) > (tolPct ?? rules().outlierPct) };
  }
  /** Revisión de una fila de /prices: ceros, fechas vacías, orden de compra sobre orden de venta. */
  function checkRow(row) {
    const flags = [];
    if (!row) return ['sin fila'];
    if (!(row.sell_price_min > 0)) flags.push('sin orden de venta (precio 0)');
    if (!(row.buy_price_max > 0)) flags.push('sin orden de compra (precio 0)');
    if (row.sell_price_min > 0 && row.buy_price_max > 0 && row.buy_price_max > row.sell_price_min) flags.push('orden de compra mayor que la de venta: dato probablemente desfasado');
    return flags;
  }
  /** Diferencia anormal entre ciudades: precio de un mercado vs mediana de los demás. */
  function cityGap(pricesByCity, city, tolPct) {
    const own = pricesByCity[city]; const others = Object.entries(pricesByCity).filter(([c, v]) => c !== city && isNum(v)).map(([, v]) => v);
    const med = median(others); if (!isNum(own) || !med) return null;
    const gap = (own - med) / med * 100;
    return { gapPct: gap, abnormal: Math.abs(gap) > (tolPct ?? rules().cityGapPct) };
  }

  /**
   * Evalúa el riesgo de una operación.
   * f = { hasPrice, ageMinutes, dailyVolume, historyDays, cv, inventoryRatio, outlier:{atypical,devPct}, trendPctPerDay,
   *       redZone:bool, spreadFlags:[], cityGap:{abnormal,gapPct}, competition:{factor,label} }
   */
  function evaluate(f, R) {
    R = R || rules();
    const factors = [];
    const add = (pts, label, detail) => factors.push({ pts, label, detail });
    if (!f.hasPrice) return { level: 'insuficiente', label: 'Datos insuficientes', score: null, factors: [{ pts: 0, label: 'Sin precio', detail: 'No hay precio válido para calcular la operación.' }] };
    if (isNum(f.ageMinutes)) {
      const h = f.ageMinutes / 60;
      if (h > R.staleVeryH) add(2, 'Precio muy desactualizado', `El dato más viejo tiene ${Math.round(h)} h (regla: > ${R.staleVeryH} h).`);
      else if (h > R.staleH) add(1, 'Precio desactualizado', `El dato más viejo tiene ${Math.round(h)} h (regla: > ${R.staleH} h).`);
    }
    if (f.historyDays === 0 || f.historyDays === null || f.historyDays === undefined) {
      add(0, 'Sin historial de ventas', 'AODP no tiene registros de ventas para estimar la demanda.');
      return { level: 'insuficiente', label: 'Datos insuficientes', score: null, factors };
    }
    if (f.historyDays < R.minHistoryDays) add(1, 'Historial corto', `Solo ${f.historyDays} día(s) con registros en 30 (regla: < ${R.minHistoryDays}).`);
    if (isNum(f.dailyVolume)) {
      if (f.dailyVolume < R.lowVolume) add(2, 'Actividad muy baja', `${f.dailyVolume.toFixed(1)} unidades/día observadas (regla: < ${R.lowVolume}).`);
      else if (f.dailyVolume < R.minVolume) add(1, 'Actividad baja', `${f.dailyVolume.toFixed(1)} unidades/día observadas (regla: < ${R.minVolume}).`);
    }
    if (isNum(f.cv)) {
      if (f.cv >= R.cvHigh) add(2, 'Precio muy volátil', `Variación del precio diario ${f.cv.toFixed(0)}% (regla: ≥ ${R.cvHigh}%).`);
      else if (f.cv >= R.cvModerate) add(1, 'Precio volátil', `Variación del precio diario ${f.cv.toFixed(0)}% (regla: ≥ ${R.cvModerate}%).`);
    }
    if (isNum(f.inventoryRatio)) {
      if (f.inventoryRatio >= R.invHigh) add(2, 'Exceso de inventario', `Tu cantidad es ${f.inventoryRatio.toFixed(1)}× lo que el mercado absorbería en el plazo (regla: ≥ ${R.invHigh}).`);
      else if (f.inventoryRatio >= R.invModerate) add(1, 'Inventario alto', `Tu cantidad es ${f.inventoryRatio.toFixed(1)}× lo absorbible en el plazo (regla: ≥ ${R.invModerate}).`);
    }
    if (f.outlier && f.outlier.atypical) add(2, 'Precio atípico', `El precio usado se desvía ${f.outlier.devPct.toFixed(0)}% de la mediana de 30 días (regla: > ${R.outlierPct}%).`);
    if (isNum(f.trendPctPerDay) && f.trendPctPerDay <= -R.downtrendPct) add(1, 'Precio a la baja', `El precio cae ${Math.abs(f.trendPctPerDay).toFixed(1)}% por día (regla: ≥ ${R.downtrendPct}%).`);
    if (f.cityGap && f.cityGap.abnormal) add(1, 'Diferencia anormal entre ciudades', `El precio difiere ${f.cityGap.gapPct.toFixed(0)}% de la mediana de otras ciudades (regla: > ${R.cityGapPct}%).`);
    (f.spreadFlags || []).forEach(s => add(1, 'Dato sospechoso', s));
    if (f.competition && f.competition.factor < 1) add(f.competition.factor <= 0.4 ? 2 : 1, 'Competencia de vendedores', `Tu precio queda ${f.competition.label} frente a lo vendido recientemente.`);
    if (f.redZone && R.redZonePts) add(R.redZonePts, 'Transporte por zona roja', 'Hay riesgo de muerte y pérdida de la carga en el camino (Caerleon / Mercado Negro).');
    const score = factors.reduce((s, x) => s + x.pts, 0);
    const level = score <= R.lowMax ? 'bajo' : score <= R.moderateMax ? 'moderado' : 'alto';
    return { level, label: { bajo: 'Riesgo bajo', moderado: 'Riesgo moderado', alto: 'Riesgo alto' }[level], score, factors };
  }

  const ORDER = { bajo: 0, moderado: 1, alto: 2, insuficiente: 3 };
  const NOT_MEASURABLE = [
    'Competencia exacta de otros vendedores: AODP no informa cuántas órdenes hay; se aproxima con la posición de tu precio.',
    'Variaciones de precio durante el transporte: solo se ven al volver a consultar.',
    'Cambios en las condiciones del juego (parches, eventos): no hay datos; revísalos tú.'
  ];

  SM.risk = { DEFAULT_RULES, RULE_INFO, rules, saveRules, evaluate, volatility, outlier, checkRow, cityGap, median, ORDER, NOT_MEASURABLE };
})(typeof window !== 'undefined' ? window : globalThis);
