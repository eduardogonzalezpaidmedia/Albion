/* Silver Master — asistente de preguntas de Market Intelligence.
   NO es un modelo de lenguaje: reconoce el tipo de pregunta y responde SOLO con los cálculos de los motores
   de la app (recomendaciones, inversión, riesgo, operaciones). Si no tiene datos, consulta la API o lo dice.
   Preparado para conectar un modelo externo más adelante vía Worker: buildContext() arma el resumen de datos. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const norm = s => (SM.crafting ? SM.crafting.norm(s) : String(s).toLowerCase());
  const esc = s => SM.ui ? SM.ui.esc(s) : String(s);
  const fmt = n => SM.ui ? SM.ui.fmt(n) : String(n);

  const EXAMPLES = [
    '¿Qué puedo hacer con 1 millón de plata?', '¿Qué objetos se pueden vender en 24 horas?', '¿Qué materiales conviene refinar hoy?',
    '¿Qué puedo fabricar sin premium ni foco?', '¿Qué tiene buen margen en el Mercado Negro?', '¿Cuántas túnicas de clérigo 5.1 puedo fabricar con mi capital?',
    '¿Qué puedo comprar en Lymhurst para vender en Caerleon?', '¿Qué operación requiere menos inversión?', '¿Qué productos tienen mayor rotación?',
    '¿Qué objetos tienen el precio más estable?', '¿Qué operaciones activas están perdiendo rentabilidad?', '¿Qué debería revisar antes de reinvertir?'
  ];

  /** "1 millón", "1.5m", "500k", "500 mil", "2kk" → número. Ignora horas y días. */
  function parseAmount(q) {
    const re = /(\d+(?:[.,]\d+)?)\s*(kk|mm|millon(?:es)?|mill|m|k|mil)?\b(?!\s*(?:h\b|hora|horas|dia|dias|%))/g;
    let m, best = null;
    const n = norm(q);
    while ((m = re.exec(n))) {
      let v = parseFloat(m[1].replace(',', '.')); const u = m[2] || '';
      if (/^(kk|mm|millon|millones|mill|m)$/.test(u)) v *= 1e6; else if (u === 'k' || u === 'mil') v *= 1e3;
      else if (v < 1000) continue;                                 // números chicos sin unidad: tiers, horas, etc.
      if (!best || v > best) best = v;
    }
    return best;
  }
  function parseHours(q) { const n = norm(q); const m = /\b(24|48|72)\s*(h|hora|horas)\b/.exec(n); if (m) return +m[1]; if (/(rapid|de un dia para otro|para manana)/.test(n)) return 24; return null; }
  function parseCities(q) {
    const n = norm(q), list = SM.data.cities.map(c => c.id);
    const find = s => list.find(c => s.includes(norm(c))) || (/mercado negro|black market/.test(s) ? 'Black Market' : null);
    const mFrom = /comprar? en ([a-z ]+?)(?: para| y|$)/.exec(n), mTo = /vender(?:lo|los)? en ([a-z ]+)/.exec(n);
    return { from: mFrom ? find(mFrom[1]) : null, to: mTo ? find(mTo[1]) : null };
  }

  function intent(q) {
    const n = norm(q);
    if (/^(ayuda|help|\?|que puedes|que sabes)/.test(n)) return 'help';
    if (/(activa|operacion).*(perd|pierd|bajando|mal)/.test(n)) return 'losing';
    if (/(revisar|reinvert|antes de)/.test(n)) return 'review';
    if (/cuant[oa]s? .+ puedo (fabricar|craftear|hacer|refinar|comprar|crear)/.test(n)) return 'howmany';
    if (parseAmount(q) || parseHours(q) || /(puedo|conviene|oportunidad|vender|venden|fabric|craft|refin|mercado|comprar|invert|inversion|plata|silver|ganar|ganancia|margen|rotacion|estable|operacion|negocio|rentab|que hago)/.test(n)) return 'recommend';
    return 'unknown';
  }

  /** Filtros que se desprenden de la pregunta. */
  function filtersFrom(q) {
    const n = norm(q), f = { ops: null, sort: 'score', overrides: {} };
    const ops = [];
    if (/refin/.test(n)) ops.push('refine');
    if (/(fabric|craft|crear)/.test(n) && !/refin/.test(n)) ops.push('craft');
    if (/(mercado negro|black market)/.test(n)) ops.push('bm');
    if (/(revend|reventa|comprar.*vender|arbitraj|flip)/.test(n)) ops.push('flip', 'arbitrage');
    if (ops.length) f.ops = [...new Set(ops)];
    if (/sin premium/.test(n)) f.overrides.premium = false;
    if (/sin foco|ni foco/.test(n)) f.overrides.focus = false;
    if (/con premium/.test(n)) f.overrides.premium = true;
    if (/con foco/.test(n)) f.overrides.focus = true;
    const amt = parseAmount(q); if (amt) f.overrides.capital = amt;
    f.hours = parseHours(q);
    f.cities = parseCities(q);
    if (/menos inversion|menor inversion|mas barat|poca plata|poco capital/.test(n)) f.sort = 'investment';
    else if (/rotacion|se venden? mas|mas rapido|liquidez/.test(n)) f.sort = 'rotation';
    else if (/estable|menos volatil/.test(n)) f.sort = 'stable';
    else if (/margen|roi|porcentaje/.test(n)) f.sort = 'roi';
    return f;
  }

  /** ¿Sirven los últimos resultados o hay que volver a consultar? */
  function needsRun(f) {
    const L = SM.intel && SM.intel.last;
    if (!L) return 'No había datos calculados todavía.';
    const s = L.settings;
    if (f.ops && f.ops.some(o => !s.ops.includes(o))) return 'La búsqueda anterior no incluía ese tipo de operación.';
    if ('premium' in f.overrides && f.overrides.premium !== s.premium) return 'La búsqueda anterior usaba otra configuración de Premium.';
    if ('focus' in f.overrides && f.overrides.focus !== s.focus) return 'La búsqueda anterior usaba otra configuración de foco.';
    if (Date.now() - L.at > 30 * 60000) return 'Los datos tenían más de 30 minutos.';
    return null;
  }

  async function recommend(q, f, onProgress) {
    const why = needsRun(f);
    let L;
    const over = Object.assign({}, f.overrides); if (f.ops) over.ops = [...new Set(((SM.intel && SM.intel.last && SM.intel.last.settings.ops) || SM.recommend.settings().ops).concat(f.ops))];
    const runOver = Object.assign({}, over); delete runOver.capital;
    if (why) { onProgress && onProgress('Consultando Albion Online Data Project… (' + why + ')'); await SM.recommend.run(runOver, (m, d, t) => onProgress && onProgress(m + ' ' + d + '/' + t)); }
    const last = SM.intel.last, s2 = Object.assign({}, last.settings, over);
    L = { at: last.at, missing: last.missing, settings: s2, strategies: SM.recommend.strategies(last.candidates, s2) };
    const key = f.hours ? (f.hours <= 24 ? '24h' : f.hours <= 48 ? '48h' : '72h') : null;
    let pool = key ? L.strategies[key].recs : [].concat(...Object.values(L.strategies).map(x => x.recs));
    const seen = new Set(); pool = pool.filter(r => !seen.has(r.id) && seen.add(r.id));
    if (f.ops) pool = pool.filter(r => f.ops.includes(r.op));
    if (f.cities.from) pool = pool.filter(r => r.sourceCity.split(', ').includes(f.cities.from));
    if (f.cities.to) pool = pool.filter(r => r.targetCity === f.cities.to);
    const sorters = {
      score: (a, b) => b.score - a.score, investment: (a, b) => a.totalInvestment - b.totalInvestment, roi: (a, b) => (b.estimatedRoiPercent || 0) - (a.estimatedRoiPercent || 0),
      rotation: (a, b) => (a.estimatedSaleHours ?? 1e9) - (b.estimatedSaleHours ?? 1e9), stable: (a, b) => (a.volatility ?? 1e9) - (b.volatility ?? 1e9)
    };
    pool.sort(sorters[f.sort]);
    const s = L.settings;
    const ctxTxt = `Capital ${fmt(s.capital)} (reserva ${fmt(s.reserve)}, máx. ${s.maxPctPerOp}% por operación) · Premium ${s.premium ? 'sí' : 'no'} · foco ${s.focus ? 'sí' : 'no'} · riesgo máximo ${s.riskMax} · T${s.tierMin}–T${s.tierMax}`;
    if (!pool.length) return `<p>Con los datos actuales no encontré operaciones que cumplan eso${key ? ' en ' + key : ''}.</p><p class="small muted">${esc(ctxTxt)}. Prueba bajar el ROI mínimo, aceptar más riesgo o ampliar tiers y categorías en <b>Oportunidades</b>. ${missingTxt(L)}</p>`;
    const top = pool.slice(0, 5);
    const sortTxt = { score: 'puntaje (ganancia esperada en el plazo × riesgo × confianza)', investment: 'menor inversión', roi: 'mayor ROI', rotation: 'menor tiempo estimado de venta', stable: 'menor volatilidad del precio (30 días)' }[f.sort];
    return `<p>Encontré <b>${pool.length}</b> operación(es). Las ${top.length} primeras, ordenadas por ${sortTxt}:</p><ol class="as-list">${top.map(r => `<li><b>${esc(r.name)} ${r.tier}.${r.enchantment}</b> · ${esc(r.opLabel)}<br>
      <span class="small">${esc(r.sourceCity)} → ${esc(r.targetCity === 'Black Market' ? 'Mercado Negro' : r.targetCity)} · ${r.quantity} u · invierte ${fmt(r.totalInvestment)} · ganancia est. <span class="${r.estimatedNetProfit >= 0 ? 'pos' : 'neg'}">${fmt(r.estimatedNetProfit)}</span> (${r.estimatedRoiPercent}%) · venta ~${esc(SM.recommend.fmtH(r.estimatedSaleHours))} · ${esc(r.riskLabel)} · confianza ${esc(r.confidence)}${f.sort === 'stable' && r.volatility !== null ? ' · volatilidad ' + r.volatility.toFixed(0) + '%' : ''}</span>
      <br><button class="btn sm" data-as-open="${esc(r.id)}|${r.strategy}">Ver detalle</button></li>`).join('')}</ol>
      <details class="small"><summary>Cómo lo calculé</summary><p>${esc(ctxTxt)}. Datos de AODP consultados ${new Date(L.at).toLocaleTimeString('es-CL')}. La ganancia descuenta materiales (con retorno), tarifa de estación, transporte e impuestos de venta. La rotación usa el historial de 30 días de AODP y tu parte del mercado (${s.sharePct}%). Son estimaciones, no garantías.</p></details>`;
  }
  const missingTxt = L => { const m = L.missing || {}; const n = (m.craft || 0) + (m.refine || 0) + (m.bm || 0); return n ? `${n} objetos no se pudieron calcular por falta de precios.` : ''; };

  async function howMany(q, f, onProgress) {
    const n = norm(q), m = /cuant[oa]s? (.+?) puedo/.exec(n);
    let found = m ? SM.crafting.search(m[1], 5) : [];
    if (!found.length && m) found = SM.crafting.search(m[1].split(' ').map(w => w.length > 4 && /es$/.test(w) && !/[aeiou]es$/.test(w.slice(0, -1)) ? w.slice(0, -2) : w.length > 3 && /s$/.test(w) ? w.slice(0, -1) : w).join(' '), 5);
    if (!found.length) return `<p>No encontré el objeto «${esc(m ? m[1] : q)}» en el catálogo. Escríbelo como en el juego, por ejemplo «túnica de clérigo 5.1».</p>`;
    const it = found[0], s = Object.assign(SM.recommend.settings(), f.overrides);
    onProgress && onProgress('Consultando precios de ' + it.name + '…');
    const city = s.craftWhere === 'bonus' ? (SM.crafting.bonusCity(it) || s.baseCity) : s.baseCity;
    const r = await SM.scanner.scan({ itemIds: [it.item_id], tierMin: 2, tierMax: 8, craftCity: city, buyLocations: s.cities, sellMarkets: s.cities, saleMode: s.saleMode, focus: s.focus, premium: s.premium, units: 10, minProfit: -1e15, maxAgeH: s.maxAgeH });
    const e = r.rows[0];
    if (!e) { const d = r.missing && r.missing[0]; return `<p>No puedo calcular <b>${esc(SM.crafting.label(it.item_id))}</b>: faltan precios${d ? ' (' + esc(d.mats.map(x => x.name).join(', ') + (d.sale ? (d.mats.length ? ' y ' : '') + 'precio de venta' : '')) + ')' : ''}. Puedes escribirlos a mano en la Calculadora.</p>`; }
    const ctx = SM.engine.context({ premium: s.premium });
    const fc = SM.forecast.forecast({ histRow: e.histRow, qty: 1, unitCost: e.calc.totalCost / e.calc.made, sharePct: s.sharePct, mode: e.calc.sale.mode, salePrice: e.sale.price });
    const pl = SM.invest.plan({ capital: s.capital, reserve: s.reserve, maxPctPerOp: 100, unitCost: e.calc.totalCost / e.calc.made, salePrice: e.sale.price, mode: e.calc.sale.mode, taxPct: ctx.taxPct, setupPct: ctx.setupPct, lot: e.calc.yieldN });
    const pl3 = fc.ok ? SM.invest.plan({ capital: s.capital, reserve: s.reserve, maxPctPerOp: 100, unitCost: e.calc.totalCost / e.calc.made, salePrice: e.sale.price, mode: e.calc.sale.mode, taxPct: ctx.taxPct, setupPct: ctx.setupPct, lot: e.calc.yieldN, ratePerDay: fc.rate.mid, horizonDays: 3 }) : null;
    return `<p><b>${esc(SM.crafting.label(it.item_id))}</b> fabricado en ${esc(city)} (retorno ${(e.rr.rate * 100).toFixed(1)}%):</p>
      <ul class="as-list"><li>Costo por unidad: <b>${fmt(pl.unitCost)}</b> · venta en ${esc(e.sale.location)}: <b>${fmt(e.sale.price)}</b> · precio mínimo para no perder: ${fmt(pl.breakeven)}</li>
      <li>Con ${fmt(pl.available)} disponibles (capital − reserva) alcanzan <b>${pl.byCapital}</b> unidades → ganancia est. <span class="${pl.profit >= 0 ? 'pos' : 'neg'}">${fmt(pl.profit)}</span> (${pl.roi === null ? '—' : pl.roi.toFixed(1) + '%'}).</li>
      <li>${pl3 ? `Lo que el mercado absorbería en 72 h (escenario intermedio): <b>${pl3.qty}</b> unidades. Fabricar más que eso deja capital inmovilizado.` : 'Sin historial de ventas en AODP: no puedo estimar cuántas se venderían.'}</li></ul>
      ${found.length > 1 ? `<p class="small muted">También coincide: ${found.slice(1, 4).map(x => esc(x.name + ' ' + x.tier + '.' + x.enchantment)).join(', ')}.</p>` : ''}`;
  }

  async function losing(onProgress) {
    const act = SM.journal.all().filter(b => SM.journal.statusOf(b) === 'active');
    if (!act.length) return '<p>No tienes operaciones activas. Guarda una oportunidad y actívala en <b>Operaciones</b> para seguirla.</p>';
    const withPlan = act.filter(b => b.plan && b.plan.target);
    let idx = null;
    if (withPlan.length) { onProgress && onProgress('Consultando precios actuales…'); const p = await SM.api.getPrices(withPlan.map(b => b.item_id), [...new Set(withPlan.map(b => b.plan.target))], [1], { force: true }); idx = SM.market.index(p.rows); }
    const hits = SM.alerts.checkOps(idx).filter(h => ['drop', 'loss', 'slow', 'late'].includes(h.kind));
    if (!hits.length) return `<p>Revisé ${act.length} operación(es) activa(s): ninguna muestra caída de precio, pérdida ni rotación lenta según las reglas actuales.</p>`;
    return `<p>Estas operaciones necesitan atención:</p><ul class="as-list">${hits.map(h => `<li>${esc(h.text)}</li>`).join('')}</ul><p class="small muted">Reglas: caída ≥ ${(SM.storage.get('ops-alerts', { dropPct: 10 }).dropPct)}% frente al precio planeado; rotación lenta = menos de la mitad de lo proyectado; plazo vencido = 1,5× el tiempo estimado.</p>`;
  }

  async function review() {
    const items = [], T = SM.journal.totals(), act = SM.journal.all().filter(b => SM.journal.statusOf(b) === 'active');
    if (T.stockValue > 0) items.push(`Tienes ${fmt(T.stockValue)} en inventario sin vender (costo). Ese capital no está disponible.`);
    const slow = SM.alerts.checkOps(null).filter(h => h.kind === 'slow' || h.kind === 'late');
    if (slow.length) items.push(`${slow.length} operación(es) rotan más lento de lo previsto: ${slow.slice(0, 3).map(h => esc(h.text)).join('; ')}.`);
    const byCity = {}; act.forEach(b => { byCity[b.location] = (byCity[b.location] || 0) + b.totalCost; });
    const tot = Object.values(byCity).reduce((a, b) => a + b, 0);
    Object.entries(byCity).forEach(([c, v]) => { if (tot && v / tot > 0.7 && act.length > 1) items.push(`Dependes de una sola ciudad: ${Math.round(v / tot * 100)}% de lo invertido está en ${esc(c)}.`); });
    const learn = SM.forecast.learningFactor();
    items.push(learn.samples >= 3 ? `Tus ventas reales fueron ${Math.round(learn.factor * 100)}% de lo proyectado. ${learn.factor < 0.8 ? 'Las estimaciones han sido optimistas para ti: considera cantidades menores.' : ''}` : esc(learn.note));
    const L = SM.intel && SM.intel.last;
    items.push(L ? `Los precios de la última búsqueda son de las ${new Date(L.at).toLocaleTimeString('es-CL')}${Date.now() - L.at > 3600000 ? ' — tienen más de una hora: actualízalos antes de invertir.' : ''}` : 'Aún no buscaste oportunidades en esta sesión: los precios no están actualizados.');
    if (T.batches) items.push(`Ganancia realizada hasta ahora: ${fmt(T.realizedProfit)} sobre ${fmt(T.invested)} invertidos.`);
    items.push('Confirma en el juego el precio antes de comprar: AODP depende de jugadores que pasan por el mercado.');
    return `<p>Antes de reinvertir, revisa:</p><ul class="as-list">${items.map(x => `<li>${x}</li>`).join('')}</ul>`;
  }

  async function ask(q, onProgress) {
    const it = intent(q), f = filtersFrom(q);
    try {
      if (it === 'unknown') return `<p>No entendí la pregunta. Respondo sobre oportunidades, refinado, fabricación, Mercado Negro, reventa, cantidades, rotación, riesgo y tus operaciones. Por ejemplo:</p><ul class="as-list">${EXAMPLES.slice(0, 6).map(e => `<li>${esc(e)}</li>`).join('')}</ul>`;
      if (it === 'help') return `<p>Respondo con los cálculos de la app (no invento precios). Puedes preguntar, por ejemplo:</p><ul class="as-list">${EXAMPLES.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`;
      if (it === 'losing') return await losing(onProgress);
      if (it === 'review') return await review();
      if (it === 'howmany') return await howMany(q, f, onProgress);
      return await recommend(q, f, onProgress);
    } catch (e) { return `<p class="neg">No pude responder: ${esc(e.message)}</p>`; }
  }

  /** Resumen de datos calculados para un modelo externo futuro (no se envía a ningún lado). */
  function buildContext() {
    const L = SM.intel && SM.intel.last; if (!L) return null;
    return { calculatedAt: new Date(L.at).toISOString(), settings: L.settings, top: Object.fromEntries(Object.entries(L.strategies).map(([k, v]) => [k, v.recs.slice(0, 10).map(SM.recommend.toJSON)])) };
  }

  SM.assistant = { ask, EXAMPLES, parseAmount, parseHours, parseCities, intent, filtersFrom, buildContext };
})(typeof window !== 'undefined' ? window : globalThis);
