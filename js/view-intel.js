/* Silver Master — vista MARKET INTELLIGENCE.
   Secciones: Panel · Oportunidades (reventa, refinado, fabricación, Mercado Negro, arbitraje) · Demanda y rotación ·
   Simulador de inversión · Operaciones · Historial propio · Riesgo (configuración) · Asistente. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const U = () => SM.ui;
  const TIERS = [2, 3, 4, 5, 6, 7, 8].map(t => ({ value: t, label: 'T' + t }));
  const ENCH = [0, 1, 2, 3, 4].map(e => ({ value: e, label: '.' + e }));
  const locLabel = l => l === 'Black Market' ? 'Mercado Negro' : l;
  const RISK_CLS = { bajo: 'pos', moderado: 'warn', alto: 'neg', insuficiente: 'muted' };
  const SUBS = [
    ['panel', 'Panel'], ['opps', 'Oportunidades'], ['demand', 'Demanda y rotación'], ['sim', 'Simulador'],
    ['ops', 'Operaciones'], ['own', 'Historial propio'], ['risk', 'Riesgo'], ['chat', 'Asistente']
  ];
  const V = { sub: 'panel', strat: '24h', type: 'all', sort: 'score', shown: 30, inited: {} };
  const fmtH = h => SM.recommend.fmtH(h);
  const riskBadge = r => `<span class="rk ${RISK_CLS[r.risk || r] || ''}">${U().esc(r.riskLabel || ({ bajo: 'Riesgo bajo', moderado: 'Riesgo moderado', alto: 'Riesgo alto', insuficiente: 'Datos insuficientes' })[r] || r)}</span>`;
  const confBadge = c => `<span class="small muted">confianza</span> <b class="conf-${c === 'alta' ? 'alta' : c === 'media' ? 'media' : 'baja'}">${U().esc(c)}</b>`;

  function init() {
    const u = U();
    u.$('#intelNav').innerHTML = SUBS.map(([k, l]) => `<button type="button" data-sub="${k}"${k === V.sub ? ' aria-current="page"' : ''}>${l}</button>`).join('');
    u.$('#intelNav').onclick = e => { const b = e.target.closest('[data-sub]'); if (b) sub(b.dataset.sub); };
    sub(V.sub);
  }
  function sub(k) {
    const u = U(); V.sub = k;
    u.$$('#intelNav button').forEach(b => { if (b.dataset.sub === k) { b.setAttribute('aria-current', 'page'); try { b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { } } else b.removeAttribute('aria-current'); });
    u.$$('.isub').forEach(s => s.hidden = s.id !== 'isub-' + k);
    const fn = { panel: renderPanel, opps: initOpps, demand: initDemand, sim: initSim, ops: renderOps, own: renderOwn, risk: renderRisk, chat: initChat }[k];
    fn && fn();
  }

  /* ================= PANEL ================= */
  function opMetrics() {
    const all = SM.journal.all(), ctx = SM.engine.context();
    const st = b => SM.journal.statusOf(b);
    const act = all.filter(b => st(b) === 'active'), planned = all.filter(b => st(b) === 'planned'), closed = all.filter(b => st(b) === 'closed');
    const T = SM.journal.totals();
    const invested = act.reduce((s, b) => s + b.totalCost, 0);
    const pending = act.reduce((s, b) => { const x = SM.journal.stats(b); return s + x.remaining * x.unitCost; }, 0);
    let est = planned.reduce((s, b) => s + (b.plan && b.plan.estProfit || 0), 0);
    act.forEach(b => { if (!b.plan || !b.plan.targetPrice) return; const x = SM.journal.stats(b); est += x.remaining * (SM.invest.netUnit(b.plan.targetPrice, b.plan.saleMode, ctx.taxPct, ctx.setupPct) - x.unitCost); });
    const closedS = closed.map(b => SM.journal.stats(b));
    const roiAvg = closedS.filter(x => x.roiSold !== null).length ? closedS.filter(x => x.roiSold !== null).reduce((s, x) => s + x.roiSold, 0) / closedS.filter(x => x.roiSold !== null).length : null;
    const rotAvg = closedS.length ? closedS.reduce((s, x) => s + x.days, 0) / closedS.length : null;
    return { act, planned, closed, T, invested, pending, est, roiAvg, rotAvg };
  }
  function renderPanel() {
    const u = U(), s = SM.recommend.settings(), m = opMetrics(), L = SM.intel && SM.intel.last;
    const free = s.capital - m.invested - s.reserve;
    const opps = L ? SM.recommend.STRATS.map(st => `${st.label.split(' · ')[0]} ${L.strategies[st.key].recs.length}`).join(' · ') : 'Sin búsqueda en esta sesión';
    const k = (l, v, sub, cls) => `<div class="kpi ${cls || ''}"><span class="lbl">${l}</span><b>${v}</b><span class="s">${sub || ''}</span></div>`;
    u.$('#ipKpis').innerHTML = [
      k('Capital disponible', u.fmt(free), `capital ${u.fmt(s.capital)} − activo − reserva ${u.fmt(s.reserve)}`, free < 0 ? 'neg' : ''),
      k('Capital invertido', u.fmt(m.invested), `${m.act.length} operación(es) activa(s)`),
      k('Ganancias realizadas', u.fmt(m.T.realizedProfit), 'ventas registradas − costo de lo vendido', m.T.realizedProfit >= 0 ? 'pos' : 'neg'),
      k('Ganancias estimadas', u.fmt(m.est), 'pendientes de activas + planificadas'),
      k('Operaciones activas', m.act.length, `${m.planned.length} planificada(s) · ${m.closed.length} cerrada(s)`),
      k('Inventario por vender', u.fmt(m.pending), 'al costo'),
      k('Rentabilidad promedio', m.roiAvg === null ? '—' : u.pct(m.roiAvg), 'ROI real de las cerradas'),
      k('Rotación media', m.rotAvg === null ? '—' : m.rotAvg.toFixed(1) + ' días', 'de las cerradas'),
      k('Oportunidades', L ? Object.values(L.strategies).reduce((a, x) => a + x.recs.length, 0) : '—', opps)
    ].join('');
    const hits = SM.alerts.checkOps(null);
    if (L && Date.now() - L.at > 3600000) hits.unshift({ kind: 'stale', text: 'Los precios de la última búsqueda tienen más de 1 hora: actualízalos antes de invertir.' });
    u.$('#ipAlerts').innerHTML = hits.length ? `<ul class="alist">${hits.map(h => `<li class="al-${h.kind}">${u.esc(h.text)}</li>`).join('')}</ul>` : '<p class="muted small">Sin alertas. Las alertas de caída de precio se revisan al pulsar «Actualizar datos».</p>';
    const learn = SM.forecast.learningFactor();
    u.$('#ipLearn').innerHTML = `<p class="small">${u.esc(learn.note)}</p>`;
    u.$('#ipTop').innerHTML = L ? topCards(L) : '<p class="muted small">Busca oportunidades para ver aquí las mejores de cada plazo.</p>';
    u.$$('#ipTop [data-rec]').forEach(b => b.onclick = () => detail(findRec(b.dataset.rec)));
    u.$('#ipRefresh').onclick = refreshAll;
    u.$('#ipGo').onclick = () => sub('opps');
  }
  function topCards(L) {
    const u = U();
    return `<div class="tops">${SM.recommend.STRATS.map(st => { const r = L.strategies[st.key].recs[0]; return `<div class="top"><span class="lbl">${u.esc(st.label)}</span>${r ? `<b>${u.esc(r.name)} ${r.tier}.${r.enchantment}</b><span class="small">${u.esc(r.opLabel)} · ${u.fmt(r.estimatedNetProfit)} · ~${fmtH(r.estimatedSaleHours)}</span><button class="btn sm" data-rec="${u.esc(r.id)}|${st.key}">Ver</button>` : '<span class="muted small">Nada que cumpla los filtros</span>'}</div>`; }).join('')}</div>`;
  }
  async function refreshAll() {
    const u = U(), btn = u.$('#ipRefresh'); btn.disabled = true; SM.app.busy(true);
    try {
      const act = SM.journal.all().filter(b => SM.journal.statusOf(b) === 'active' && b.plan && b.plan.target);
      let idx = null;
      if (act.length) { const p = await SM.api.getPrices(act.map(b => b.item_id), [...new Set(act.map(b => b.plan.target))], [1], { force: true }); idx = SM.market.index(p.rows); }
      if (SM.intel && SM.intel.last) { SM.api.clearCache(); await SM.recommend.run(SM.intel.last.settings, (m, d, t) => { u.$('#ipMsg').textContent = m + ' ' + d + '/' + t; }); }
      renderPanel();
      const hits = SM.alerts.checkOps(idx);
      u.$('#ipAlerts').innerHTML = hits.length ? `<ul class="alist">${hits.map(h => `<li class="al-${h.kind}">${u.esc(h.text)}</li>`).join('')}</ul>` : '<p class="muted small">Sin alertas con los precios actuales.</p>';
      u.$('#ipMsg').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-CL');
      SM.app.showAlerts(hits.filter(h => ['drop', 'loss'].includes(h.kind)).map(h => ({ text: h.text })));
    } catch (e) { u.$('#ipMsg').textContent = '⚠ ' + e.message; }
    finally { btn.disabled = false; SM.app.busy(false); }
  }

  /* ================= OPORTUNIDADES ================= */
  function initOpps() {
    const u = U();
    if (V.inited.opps) { renderOpps(); return; }
    V.inited.opps = true;
    const s = SM.recommend.settings(), cities = SM.data.cities.filter(c => c.type !== 'black_market').map(c => c.id);
    u.$('#ioForm').innerHTML = `<div class="fields">
      <label class="field"><span class="lbl">Capital disponible</span><input id="ioCap" type="number" min="0" step="100000" value="${s.capital}"></label>
      <label class="field"><span class="lbl">Reserva (no se invierte)</span><input id="ioRes" type="number" min="0" step="100000" value="${s.reserve}"></label>
      <label class="field"><span class="lbl">Máx. por operación (% del disponible)</span><input id="ioPct" type="number" min="1" max="100" value="${s.maxPctPerOp}"></label>
      <label class="field"><span class="lbl">Presupuesto máx. por artículo</span><input id="ioMaxItem" type="number" min="0" step="10000" value="${s.maxPerItem}"><span class="hint">0 = sin límite</span></label>
      <label class="field"><span class="lbl">ROI mínimo (%)</span><input id="ioRoi" type="number" value="${s.minRoi}"></label>
      <label class="field"><span class="lbl">Ganancia mínima</span><input id="ioProfit" type="number" value="${s.minProfit}"></label>
      <div class="field" style="grid-column:1/-1"><span class="lbl">Tipos de operación</span><div class="chips" id="ioOps"></div></div>
      <div class="field" style="grid-column:1/-1"><span class="lbl">Categorías (fabricación, Mercado Negro, reventa)</span><div class="chips" id="ioCats"></div></div>
      <label class="field"><span class="lbl">Tier mínimo</span><select id="ioTMin">${u.options(TIERS, s.tierMin)}</select></label>
      <label class="field"><span class="lbl">Tier máximo</span><select id="ioTMax">${u.options(TIERS, s.tierMax)}</select></label>
      <div class="field"><span class="lbl">Encantamientos</span><div class="chips" id="ioEnch"></div></div>
      <div class="field" style="grid-column:1/-1"><span class="lbl">Ciudades de interés (comprar y vender)</span><div class="chips" id="ioCities"></div></div>
      <label class="field"><span class="lbl">Fabricar / refinar en</span><select id="ioWhere"><option value="bonus"${s.craftWhere === 'bonus' ? ' selected' : ''}>La ciudad con bono de cada objeto</option><option value="base"${s.craftWhere === 'base' ? ' selected' : ''}>Mi ciudad principal</option></select></label>
      <label class="field"><span class="lbl">Ciudad principal</span><select id="ioBase">${u.options(cities, s.baseCity)}</select></label>
      <label class="field"><span class="lbl">Tipo de venta</span><select id="ioSale"><option value="instant">Venta inmediata (orden de compra)</option><option value="order"${s.saleMode === 'order' ? ' selected' : ''}>Publicar orden de venta</option></select></label>
      <label class="field"><span class="lbl">Premium</span><span class="check"><input id="ioPrem" type="checkbox"${s.premium ? ' checked' : ''}> Tengo Premium</span></label>
      <label class="field"><span class="lbl">Foco</span><span class="check"><input id="ioFocus" type="checkbox"${s.focus ? ' checked' : ''}> Usar foco</span></label>
      <label class="field"><span class="lbl">Riesgo máximo</span><select id="ioRisk">${u.options([{ value: 'bajo', label: 'Bajo' }, { value: 'moderado', label: 'Moderado' }, { value: 'alto', label: 'Alto' }], s.riskMax)}</select></label>
      <label class="field"><span class="lbl">Largo plazo (días)</span><input id="ioLong" type="number" min="4" max="30" value="${s.longDays}"></label>
      <label class="field"><span class="lbl">Tu parte del mercado (%)</span><input id="ioShare" type="number" min="1" max="100" value="${s.sharePct}"></label>
      <label class="field"><span class="lbl">Precios de máximo (horas)</span><input id="ioAge" type="number" min="1" value="${s.maxAgeH}"></label>
      <label class="field"><span class="lbl">Sin historial</span><span class="check"><input id="ioIns" type="checkbox"${s.includeInsufficient ? ' checked' : ''}> Mostrar en largo plazo (riesgo «datos insuficientes»)</span></label>
    </div><p class="hint">La especialización y la tarifa de estación se toman de Ajustes. Más tiers, categorías o ciudades = más consultas a la API y más tiempo.</p>`;
    V.ops = u.chips(u.$('#ioOps'), Object.entries(SM.recommend.OPS).map(([value, label]) => ({ value, label })), s.ops);
    V.cats = u.chips(u.$('#ioCats'), u.catOptions().filter(c => c.value !== 'refined'), s.categories);
    V.ench = u.chips(u.$('#ioEnch'), ENCH, s.enchants);
    V.cities = u.chips(u.$('#ioCities'), cities.map(c => ({ value: c, label: c })), s.cities);
    u.$('#ioGo').onclick = runOpps;
    u.$('#ioRecalc').onclick = () => { const s2 = readForm(); SM.recommend.saveSettings(s2); if (!SM.recommend.recalc(s2)) return u.toast('Primero busca oportunidades.', 'err'); renderOpps(); u.toast('Recalculado sin consultar la API'); };
    u.$('#ioStrats').onclick = e => { const b = e.target.closest('[data-st]'); if (b) { V.strat = b.dataset.st; V.shown = 30; renderOpps(); } };
    u.$('#ioTypes').onclick = e => { const b = e.target.closest('[data-ty]'); if (b) { V.type = b.dataset.ty; V.shown = 30; renderOpps(); } };
    u.$('#ioSort').onchange = () => { V.sort = u.$('#ioSort').value; renderOpps(); };
    u.$('#ioJson').onclick = () => { const L = SM.intel && SM.intel.last; if (!L) return; SM.export.json('silver-master-recomendaciones.json', { calculatedAt: new Date(L.at).toISOString(), settings: L.settings, strategies: Object.fromEntries(Object.entries(L.strategies).map(([k, v]) => [k, v.recs.map(SM.recommend.toJSON)])) }); };
    renderOpps();
  }
  function readForm() {
    const u = U(), n = id => +u.$('#' + id).value;
    const s = Object.assign(SM.recommend.settings(), {
      capital: n('ioCap') || 0, reserve: n('ioRes') || 0, maxPctPerOp: n('ioPct') || 100, maxPerItem: n('ioMaxItem') || 0, minRoi: u.$('#ioRoi').value === '' ? -1e9 : n('ioRoi'), minProfit: n('ioProfit') || 0,
      ops: V.ops.values(), categories: V.cats.values(), tierMin: n('ioTMin'), tierMax: n('ioTMax'), enchants: V.ench.values(), cities: V.cities.values(),
      craftWhere: u.$('#ioWhere').value, baseCity: u.$('#ioBase').value, saleMode: u.$('#ioSale').value, premium: u.$('#ioPrem').checked, focus: u.$('#ioFocus').checked,
      riskMax: u.$('#ioRisk').value, longDays: Math.max(4, n('ioLong') || 7), sharePct: n('ioShare') || 30, maxAgeH: n('ioAge') || 12, includeInsufficient: u.$('#ioIns').checked
    });
    if (s.tierMin > s.tierMax) [s.tierMin, s.tierMax] = [s.tierMax, s.tierMin];
    return s;
  }
  async function runOpps() {
    const u = U(), s = readForm(), msg = u.$('#ioMsg'), bar = u.$('#ioBar');
    if (!s.ops.length) { msg.textContent = 'Elige al menos un tipo de operación.'; msg.className = 'msg err'; return; }
    if (!s.cities.length) { msg.textContent = 'Elige al menos una ciudad de interés.'; msg.className = 'msg err'; return; }
    if (!s.enchants.length || (!s.categories.length && s.ops.some(o => o !== 'refine'))) { msg.textContent = 'Elige encantamientos y categorías.'; msg.className = 'msg err'; return; }
    SM.recommend.saveSettings(s);
    u.$('#ioGo').disabled = true; SM.app.busy(true); msg.className = 'msg';
    try {
      const L = await SM.recommend.run(s, (m, d, t) => { bar.style.width = Math.round(d / t * 100) + '%'; msg.textContent = m + '… ' + d + ' de ' + t; });
      bar.style.width = '100%';
      const miss = (L.missing.craft || 0) + (L.missing.refine || 0) + (L.missing.bm || 0);
      msg.textContent = `Listo: ${L.candidates.length} operaciones con ganancia calculable. ${miss ? miss + ' objetos sin precios suficientes (ver Venta local → «Qué datos faltan» para el detalle).' : ''}`;
      renderOpps();
    } catch (e) { msg.textContent = '⚠ ' + e.message; msg.className = 'msg err'; }
    finally { u.$('#ioGo').disabled = false; SM.app.busy(false); }
  }
  function findRec(key) {
    const [id, st] = key.split('|').length > 4 ? [key.split('|').slice(0, 4).join('|'), key.split('|')[4]] : [key, V.strat];
    const L = SM.intel && SM.intel.last; if (!L) return null;
    return (L.strategies[st] || L.strategies[V.strat]).recs.find(r => r.id === id) || [].concat(...Object.values(L.strategies).map(x => x.recs)).find(r => r.id === id);
  }
  function renderOpps() {
    const u = U(), L = SM.intel && SM.intel.last;
    u.$('#ioRes2').hidden = !L;
    if (!L) return;
    u.$('#ioStrats').innerHTML = SM.recommend.STRATS.map(st => `<button type="button" data-st="${st.key}"${st.key === V.strat ? ' aria-current="page"' : ''}>${u.esc(st.label)} <span class="cnt">${L.strategies[st.key].recs.length}</span></button>`).join('');
    const S = L.strategies[V.strat];
    const types = [['all', 'Todas']].concat(Object.entries(SM.recommend.OPS));
    u.$('#ioTypes').innerHTML = types.map(([k, l]) => `<button type="button" class="chip" data-ty="${k}" aria-pressed="${V.type === k}">${u.esc(l)}</button>`).join('');
    const P = S.portfolio;
    u.$('#ioPort').innerHTML = `<p class="small">${u.esc(S.strat.desc)} ${S.strat.key === 'long' ? 'Plazo: ' + L.settings.longDays + ' días.' : ''}</p>
      <div class="kpis"><div class="kpi"><span class="lbl">Cartera sugerida</span><b>${P.count}</b><span class="s">operaciones que caben juntas</span></div>
      <div class="kpi"><span class="lbl">Capital usado</span><b>${u.fmt(P.used)}</b><span class="s">de ${u.fmt(P.available)} disponibles</span></div>
      <div class="kpi"><span class="lbl">Ganancia esperada en el plazo</span><b class="${P.expected >= 0 ? 'pos' : 'neg'}">${u.fmt(P.expected)}</b><span class="s">escenario intermedio</span></div>
      <div class="kpi"><span class="lbl">Sin usar</span><b>${u.fmt(P.free)}</b><span class="s">no hubo más operaciones que cumplan</span></div></div>
      <p class="hint">Puntaje = ganancia esperada en el plazo × riesgo (bajo ×1 · moderado ×0,75 · alto ×0,4) × confianza (alta ×1 · media ×0,85 · baja ×0,6). No se elige solo por margen. La cartera toma las de mayor puntaje sin pasar tu capital.</p>`;
    let recs = S.recs.filter(r => V.type === 'all' || r.op === V.type);
    const sorters = { score: (a, b) => b.score - a.score, profit: (a, b) => b.estimatedNetProfit - a.estimatedNetProfit, roi: (a, b) => (b.estimatedRoiPercent || 0) - (a.estimatedRoiPercent || 0),
      capital: (a, b) => a.totalInvestment - b.totalInvestment, rotation: (a, b) => (a.estimatedSaleHours ?? 1e9) - (b.estimatedSaleHours ?? 1e9), risk: (a, b) => SM.risk.ORDER[a.risk] - SM.risk.ORDER[b.risk] || b.score - a.score, liquidity: (a, b) => (b.liquidity || 0) - (a.liquidity || 0) };
    recs = recs.slice().sort(sorters[V.sort] || sorters.score);
    u.$('#ioList').innerHTML = recs.length ? recs.slice(0, V.shown).map(card).join('') + (recs.length > V.shown ? `<button class="btn" id="ioMore">Ver ${Math.min(30, recs.length - V.shown)} más (${recs.length - V.shown} restantes)</button>` : '')
      : `<p class="muted">Nada cumple los filtros en este plazo${V.type !== 'all' ? ' y tipo' : ''}. Prueba otro plazo, baja el ROI mínimo o acepta más riesgo y pulsa «Recalcular sin consultar».</p>`;
    const more = u.$('#ioMore'); if (more) more.onclick = () => { V.shown += 30; renderOpps(); };
    bindCards(u.$('#ioList'));
  }
  function card(r) {
    const u = U();
    return `<article class="rec${r.inPortfolio ? ' inport' : ''}" data-id="${u.esc(r.id)}|${r.strategy}">
      <header><div><b>${u.esc(r.name)}</b> <span class="tag">T${r.tier}.${r.enchantment}</span> <span class="tag">${u.esc(r.opLabel)}</span>${r.inPortfolio ? ' <span class="tag pos">en la cartera</span>' : ''}</div>${riskBadge(r)}</header>
      <p class="route small">${u.esc(r.sourceCity)}${r.craftCity && r.craftCity !== r.sourceCity ? ' → fabricar en ' + u.esc(r.craftCity) : ''} → <b>${u.esc(locLabel(r.targetCity))}</b> · ${r.saleMode === 'order' ? 'orden de venta' : 'venta inmediata'}</p>
      <div class="kv4">
        <div><span class="lbl">Costo / u</span><b>${u.fmt(r.buyPrice)}</b></div><div><span class="lbl">Venta / u</span><b class="silver">${u.fmt(r.targetSellPrice)}</b></div>
        <div><span class="lbl">Cantidad</span><b>${r.quantity}</b></div><div><span class="lbl">Capital</span><b>${u.fmt(r.totalInvestment)}</b></div>
        <div><span class="lbl">Ganancia neta</span><b class="${u.signCls(r.estimatedNetProfit)}">${u.fmt(r.estimatedNetProfit)}</b></div><div><span class="lbl">ROI</span><b>${u.pct(r.estimatedRoiPercent)}</b></div>
        <div><span class="lbl">Venta estimada</span><b>${u.esc(fmtH(r.estimatedSaleHours))}</b></div><div><span class="lbl">Datos</span>${confBadge(r.confidence)}</div>
      </div>
      <p class="small why">${u.esc(r.reasons[1] || r.reasons[0])}</p>
      <div class="btns"><button class="btn sm" data-act="detail">Detalle</button>${['craft', 'refine', 'bm'].includes(r.op) ? '<button class="btn sm" data-act="calc">Calculadora</button>' : ''}<button class="btn sm" data-act="sim">Simulador</button><button class="btn sm" data-act="demand">Rotación</button><button class="btn sm primary" data-act="plan">Guardar como operación</button></div>
    </article>`;
  }
  function bindCards(host) {
    U().$$('.rec', host).forEach(el => el.onclick = e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const r = findRec(el.dataset.id); if (!r) return;
      act(b.dataset.act, r);
    });
  }
  function act(a, r) {
    const u = U();
    if (a === 'detail') return detail(r);
    if (a === 'calc') return SM.views.calc.open(SM.crafting.item(r.itemId), true, { units: r.quantity, craftCity: r.craftCity || undefined, sellMarket: r.targetCity, saleMode: r.saleMode, focus: SM.intel.last.settings.focus });
    if (a === 'sim') { V.simPrefill = r; SM.app.go('intel', true); sub('sim'); return; }
    if (a === 'demand') { V.demandPrefill = r; sub('demand'); return; }
    if (a === 'plan') { SM.journal.planOp(r); u.toast('Guardada en Operaciones como planificada'); return; }
  }
  function detail(r) {
    if (!r) return;
    const u = U(), fc = r.forecast;
    const costRows = Object.entries(r.costs).filter(([, v]) => v).map(([k, v]) => `<tr><td>${u.esc({ materials: 'Materiales (con retorno)', fee: 'Tarifa de estación', transport: 'Transporte', other: 'Otros', purchase: 'Compra del objeto', buySetup: 'Publicación orden de compra', salesTax: 'Impuesto de venta', setupFee: 'Publicación orden de venta' }[k] || k)}</td><td class="n">${u.fmt(v)}</td></tr>`).join('');
    const fcTable = fc && fc.ok ? `<div class="tablewrap"><table class="grid-table"><thead><tr><th>Plazo</th>${SM.forecast.SCEN.map(s => `<th class="n">${s.label}</th>`).join('')}<th class="n">Inmovilizado (interm.)</th></tr></thead><tbody>${fc.table.map(t => `<tr><td>${t.key}</td>${SM.forecast.SCEN.map(s => `<td class="n">${t[s.key].sold} u · ${Math.round(t[s.key].pct)}%</td>`).join('')}<td class="n">${u.fmt(t.mid.immobilized)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${u.esc(fc ? fc.reason || 'Sin historial.' : 'Sin historial.')}</p>`;
    u.modal(r.name + ' ' + r.tier + '.' + r.enchantment + ' · ' + r.opLabel, `
      <p>${riskBadge(r)} ${confBadge(r.confidence)} · puntaje ${u.fmt(r.score)}</p>
      <h3>Por qué</h3><ul class="as-list">${r.reasons.map(x => `<li>${u.esc(x)}</li>`).join('')}</ul>
      <h3>Costos del lote (${r.quantity} u)</h3><div class="tablewrap"><table class="log">${costRows}
        <tr><td>Capital requerido</td><td class="n"><b>${u.fmt(r.totalInvestment)}</b></td></tr><tr><td>Ingreso bruto</td><td class="n">${u.fmt(r.grossRevenue)}</td></tr>
        <tr><td><b>Ganancia neta estimada</b></td><td class="n"><b class="${u.signCls(r.estimatedNetProfit)}">${u.fmt(r.estimatedNetProfit)}</b></td></tr><tr><td>Precio mínimo para no perder</td><td class="n">${u.fmt(r.breakevenPrice)}</td></tr></table></div>
      <h3>Rotación estimada</h3>${fc && fc.ok ? `<p class="small">Volumen observado (AODP): ${fc.observedVolume.perDay7.toFixed(1)} u/día (7 d), ${fc.observedVolume.perDay30.toFixed(1)} u/día (30 d) · Demanda estimada (interm.): ${fc.demand.mid.toFixed(1)} u/día · Tu velocidad proyectada: ${fc.rate.cons.toFixed(1)} / ${fc.rate.mid.toFixed(1)} / ${fc.rate.opt.toFixed(1)} u/día.</p>` : ''}${fcTable}
      <h3>Riesgo (${r.riskScore ?? '—'} puntos)</h3><ul class="as-list">${r.riskFactors.length ? r.riskFactors.map(f => `<li><b>${u.esc(f.label)}</b> +${f.pts}: ${u.esc(f.detail)}</li>`).join('') : '<li>Ningún factor de riesgo según las reglas actuales.</li>'}</ul>
      <h3>Supuestos</h3><ul class="as-list small">${r.assumptions.map(x => `<li>${u.esc(x)}</li>`).join('')}</ul>
      <p class="small muted">Datos de ${new Date(r.dataTimestamp).toLocaleString('es-CL')} (el más viejo usado). Estimación, no garantía.</p>
      <details><summary>JSON de la recomendación</summary><pre class="json">${u.esc(JSON.stringify(SM.recommend.toJSON(r), null, 2))}</pre></details>
      <div class="btns"><button class="btn primary" id="mdPlan">Guardar como operación</button></div>`);
    u.$('#mdPlan').onclick = () => { SM.journal.planOp(r); u.closeModal(); u.toast('Guardada en Operaciones como planificada'); };
  }

  /* ================= DEMANDA Y ROTACIÓN ================= */
  function initDemand() {
    const u = U();
    if (!V.inited.demand) {
      V.inited.demand = true;
      const markets = SM.crafting.marketLocations();
      u.$('#idForm').innerHTML = `<div id="idPicker"></div><div class="fields">
        <label class="field"><span class="lbl">Mercado de venta</span><select id="idLoc">${u.options(markets.map(l => ({ value: l, label: locLabel(l) })), SM.storage.profile().city)}</select></label>
        <label class="field"><span class="lbl">Tipo de venta</span><select id="idMode"><option value="instant">Venta inmediata (orden de compra)</option><option value="order">Publicar orden de venta</option></select></label>
        <label class="field"><span class="lbl">Cantidad a vender</span><input id="idQty" type="number" min="1" value="20"></label>
        <label class="field"><span class="lbl">Tu costo por unidad</span><input id="idCost" type="number" min="0" placeholder="opcional"><span class="hint">Para el capital inmovilizado.</span></label>
        <label class="field"><span class="lbl">Tu parte del mercado (%)</span><input id="idShare" type="number" min="1" max="100" value="${SM.recommend.settings().sharePct}"></label>
      </div><div class="btns"><button class="btn primary" id="idGo">Analizar</button></div>`;
      V.dPicker = u.itemPicker(u.$('#idPicker'), it => V.dItem = it);
      u.$('#idGo').onclick = runDemand;
    }
    const r = V.demandPrefill; V.demandPrefill = null;
    if (r) {
      V.dItem = SM.crafting.item(r.itemId) || r; V.dPicker.set(V.dItem);
      if (SM.crafting.marketLocations().includes(r.targetCity)) u.$('#idLoc').value = r.targetCity;
      u.$('#idMode').value = r.saleMode; u.$('#idQty').value = r.quantity; u.$('#idCost').value = r.buyPrice;
      runDemand();
    }
  }
  async function runDemand() {
    const u = U(), it = V.dItem, out = u.$('#idOut');
    if (!it) return u.toast('Elige un objeto.', 'err');
    const loc = u.$('#idLoc').value, mode = u.$('#idMode').value, qty = Math.max(1, +u.$('#idQty').value || 1), cost = +u.$('#idCost').value || 0, share = +u.$('#idShare').value || 30;
    const markets = SM.crafting.marketLocations();
    out.innerHTML = '<p class="muted">Consultando precios e historial…</p>'; SM.app.busy(true);
    try {
      const [p, hd, hh] = await Promise.all([
        SM.api.getPrices([it.item_id], markets, [1]),
        SM.api.getHistory([it.item_id], markets, [1], 24),
        SM.api.getHistory([it.item_id], [loc], [1], 1)
      ]);
      const idx = SM.market.index(p.rows);
      const H = {}; hd.rows.forEach(r => { if ((r.quality || 1) === 1) H[r.location] = r; });
      const hourly = hh.rows.find(r => r.location === loc) || null;
      // comparación de mercados
      const cmp = markets.map(l => {
        const r = SM.market.row(idx, it.item_id, l, 1), so = SM.market.sellOrder(r), bo = SM.market.buyOrder(r), h = H[l];
        const tr = h ? SM.forecast.trends(h, null) : null;
        return { l, so, bo, spread: so && bo ? so.price - bo.price : null, avg: tr ? tr.avgPrice : null, var7: tr ? tr['7d'] : null, vol: h ? SM.market.dailyVolume(h, 7) : null, flags: SM.risk.checkRow(r).filter(f => f.includes('desfasado')) };
      });
      const priceNow = mode === 'order' ? (SM.market.sellOrder(SM.market.row(idx, it.item_id, loc, 1)) || {}).price : (SM.market.buyOrder(SM.market.row(idx, it.item_id, loc, 1)) || {}).price;
      const fc = SM.forecast.forecast({ histRow: H[loc], qty, unitCost: cost, sharePct: share, mode, salePrice: priceNow });
      const tr = SM.forecast.trends(H[loc], hourly);
      const series = fc.series || [];
      const byCity = {}; cmp.forEach(c => { const o = mode === 'order' ? c.so : c.bo; if (o) byCity[c.l] = o.price; });
      const rk = SM.risk.evaluate({ hasPrice: !!priceNow, ageMinutes: (() => { const r = SM.market.row(idx, it.item_id, loc, 1), o = mode === 'order' ? SM.market.sellOrder(r) : SM.market.buyOrder(r); return o ? SM.market.ageMinutes(o.date) : null; })(),
        dailyVolume: fc.observedVolume.perDay7, historyDays: fc.observed, cv: tr.cv, inventoryRatio: SM.forecast.inventoryRatio(fc, 3), outlier: SM.risk.outlier(priceNow, series.map(d => d.price)),
        trendPctPerDay: (SM.demand.priceTrend(series, 14) || {}).pctPerDay, redZone: loc === 'Black Market' || loc === 'Caerleon', cityGap: SM.risk.cityGap(byCity, loc), competition: mode === 'order' && fc.ok ? fc.pos : null });
      const own = await SM.snapshots.series(it.item_id, loc, 1);
      const pctC = v => v === null || v === undefined ? '—' : `<span class="${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
      const ptsDaily = (H[loc] && H[loc].data || []).filter(d => Date.parse(d.timestamp + 'Z') >= Date.now() - 30 * 86400000);
      out.innerHTML = `
        <h3>Comparación de mercados · ${u.esc(it.name)} ${it.tier}.${it.enchantment}</h3>
        <div class="tablewrap"><table class="grid-table"><thead><tr><th>Mercado</th><th class="n">Orden de compra</th><th class="n">Orden de venta</th><th class="n">Diferencia</th><th class="n">Prom. 30 d</th><th class="n">Var. 7 d</th><th class="n">Activ. /día</th><th>Antigüedad</th></tr></thead><tbody>
        ${cmp.map(c => `<tr${c.l === loc ? ' class="hl"' : ''}><td>${u.esc(locLabel(c.l))}${c.flags.length ? ' <span class="warn small" title="' + u.esc(c.flags.join('; ')) + '">⚠</span>' : ''}</td><td class="n">${c.bo ? u.fmt(c.bo.price) : '—'}</td><td class="n">${c.so ? u.fmt(c.so.price) : '—'}</td><td class="n">${c.spread === null ? '—' : u.fmt(c.spread)}</td><td class="n">${c.avg ? u.fmt(c.avg) : '—'}</td><td class="n">${pctC(c.var7)}</td><td class="n">${c.vol === null ? '—' : c.vol.toFixed(1)}</td><td>${u.ageBadgeMin(Math.min(...[c.so, c.bo].filter(Boolean).map(o => SM.market.ageMinutes(o.date)).concat([Infinity])) === Infinity ? null : Math.min(...[c.so, c.bo].filter(Boolean).map(o => SM.market.ageMinutes(o.date))))}</td></tr>`).join('')}
        </tbody></table></div>
        <h3>${u.esc(locLabel(loc))}: demanda y rotación</h3>
        <div class="kpis">
          <div class="kpi"><span class="lbl">1 · Volumen observado</span><b>${fc.observedVolume.perDay7.toFixed(1)} u/día</b><span class="s">7 días · ${fc.observedVolume.total30} u en 30 días registradas por AODP (no es el total real del servidor)</span></div>
          <div class="kpi"><span class="lbl">2 · Demanda estimada</span><b>${fc.ok ? fc.demand.mid.toFixed(1) + ' u/día' : '—'}</b><span class="s">${fc.ok ? 'conservador ' + fc.demand.cons.toFixed(1) + ' · optimista ' + fc.demand.opt.toFixed(1) : u.esc(fc.reason)}</span></div>
          <div class="kpi"><span class="lbl">3 · Tu velocidad proyectada</span><b>${fc.ok ? fc.rate.mid.toFixed(1) + ' u/día' : '—'}</b><span class="s">${fc.ok ? 'vendes ' + qty + ' u en ~' + u.esc(fmtH(fc.estimatedSaleHours)) : ''}</span></div>
          <div class="kpi"><span class="lbl">Precio actual usado</span><b class="silver">${u.fmt(priceNow)}</b><span class="s">${mode === 'order' ? 'orden de venta más barata' : 'orden de compra más alta'}</span></div>
        </div>
        <p class="small">Tendencia del precio promedio: 24 h ${pctC(tr['24h'])} · 3 d ${pctC(tr['3d'])} · 7 d ${pctC(tr['7d'])} · 14 d ${pctC(tr['14d'])} · 30 d ${pctC(tr['30d'])} · volatilidad ${tr.cv === null ? '—' : tr.cv.toFixed(0) + '%'}</p>
        <div class="chartbox">${SM.history.chart(ptsDaily, u.fmt)}</div>
        <h3>Salida del inventario (${qty} u)</h3>
        ${fc.ok ? `<div class="tablewrap"><table class="grid-table"><thead><tr><th>Plazo</th>${SM.forecast.SCEN.map(s => `<th class="n">${s.label}</th>`).join('')}<th class="n">Capital inmovilizado (interm.)</th></tr></thead><tbody>${fc.table.map(t => `<tr><td>${t.key}</td>${SM.forecast.SCEN.map(s => `<td class="n">${t[s.key].sold} u · ${Math.round(t[s.key].pct)}%</td>`).join('')}<td class="n">${cost ? u.fmt(t.mid.immobilized) : '—'}</td></tr>`).join('')}</tbody></table></div>
          <details class="small"><summary>Supuestos</summary><ul class="as-list">${fc.assumptions.map(a => `<li>${u.esc(a)}</li>`).join('')}</ul></details>` : `<p class="muted">${u.esc(fc.reason)}</p>`}
        <h3>Riesgo</h3><p>${riskBadge(rk)} ${rk.score !== null ? '· ' + rk.score + ' puntos' : ''}</p><ul class="as-list small">${rk.factors.map(f => `<li><b>${u.esc(f.label)}</b> +${f.pts}: ${u.esc(f.detail)}</li>`).join('') || '<li>Sin factores de riesgo según las reglas actuales.</li>'}</ul>
        <h3>Historial propio en este dispositivo</h3>
        ${own.length ? `<p class="small">${own.length} observaciones desde ${new Date(own[0].t).toLocaleString('es-CL')}.</p><div class="chartbox">${ownChart(own)}</div>` : '<p class="muted small">Aún no hay observaciones propias de este objeto en este mercado. Se guardan solas cada vez que consultas precios.</p>'}`;
    } catch (e) { out.innerHTML = `<p class="neg">⚠ ${u.esc(e.message)}</p>`; }
    finally { SM.app.busy(false); }
  }
  function ownChart(obs) {
    const pts = obs.filter(o => o.sMin).map(o => ({ timestamp: new Date(o.t).toISOString().slice(0, 19), avg_price: o.sMin, item_count: 0 }));
    return pts.length >= 2 ? SM.history.chart(pts, U().fmt).replace('volumen', 'orden de venta más barata (observada por ti)') : '<p class="muted small">Se necesitan al menos 2 observaciones con orden de venta.</p>';
  }

  /* ================= SIMULADOR ================= */
  function initSim() {
    const u = U();
    if (!V.inited.sim) {
      V.inited.sim = true;
      const s = SM.recommend.settings();
      u.$('#isForm').innerHTML = `<div class="fields">
        <label class="field"><span class="lbl">Capital</span><input id="smCap" type="number" min="0" step="100000" value="${s.capital}"></label>
        <label class="field"><span class="lbl">Reserva</span><input id="smRes" type="number" min="0" step="100000" value="${s.reserve}"></label>
        <label class="field"><span class="lbl">Máx. por operación (%)</span><input id="smPct" type="number" min="1" max="100" value="${s.maxPctPerOp}"></label>
        <label class="field"><span class="lbl">Presupuesto máx. por artículo</span><input id="smMaxItem" type="number" min="0" value="${s.maxPerItem}"></label>
        <label class="field"><span class="lbl">Costo por unidad</span><input id="smCost" type="number" min="0" value="10000"><span class="hint">Materiales con retorno + estación + transporte (lo da la Calculadora).</span></label>
        <label class="field"><span class="lbl">Precio de venta por unidad</span><input id="smPrice" type="number" min="0" value="13500"></label>
        <label class="field"><span class="lbl">Tipo de venta</span><select id="smMode"><option value="instant">Venta inmediata</option><option value="order">Publicar orden de venta</option></select></label>
        <label class="field"><span class="lbl">Premium</span><span class="check"><input id="smPrem" type="checkbox"${s.premium ? ' checked' : ''}> Tengo Premium</span></label>
        <label class="field"><span class="lbl">Unidades por crafteo (lote)</span><input id="smLot" type="number" min="1" value="1"></label>
        <label class="field"><span class="lbl">Velocidad de venta (u/día)</span><input id="smRate" type="number" min="0" step="0.1" placeholder="opcional"><span class="hint">De «Demanda y rotación». Vacío = solo capital.</span></label>
        <label class="field"><span class="lbl">Horizonte de venta (días)</span><input id="smDays" type="number" min="1" max="30" value="3"></label>
        <label class="field"><span class="lbl">ROI mínimo deseado (%)</span><input id="smRoi" type="number" value="${s.minRoi}"></label>
      </div>`;
      u.$$('#isForm input, #isForm select').forEach(el => el.addEventListener('input', runSim));
      u.$$('#isForm select, #isForm input[type=checkbox]').forEach(el => el.addEventListener('change', runSim));
    }
    const r = V.simPrefill; V.simPrefill = null;
    if (r) {
      const set = (id, v) => { if (v !== null && v !== undefined) u.$('#' + id).value = v; };
      set('smCost', Math.round(r.buyPrice)); set('smPrice', r.targetSellPrice); u.$('#smMode').value = r.saleMode; set('smLot', (r.plan && r.plan.lot) || 1);
      set('smRate', r.ratePerDay ? +r.ratePerDay.toFixed(2) : ''); set('smDays', r.horizonDays); u.$('#isFrom').textContent = 'Datos de: ' + r.name + ' ' + r.tier + '.' + r.enchantment + ' · ' + r.opLabel;
    }
    runSim();
  }
  function runSim() {
    const u = U(), n = id => u.$('#' + id).value === '' ? null : +u.$('#' + id).value;
    const ctx = SM.engine.context({ premium: u.$('#smPrem').checked });
    const pl = SM.invest.plan({ capital: n('smCap') || 0, reserve: n('smRes') || 0, maxPctPerOp: n('smPct') || 100, maxPerItem: n('smMaxItem') || 0, unitCost: n('smCost'), salePrice: n('smPrice') || 0,
      mode: u.$('#smMode').value, taxPct: ctx.taxPct, setupPct: ctx.setupPct, lot: n('smLot') || 1, ratePerDay: n('smRate'), horizonDays: n('smDays') || 3 });
    const out = u.$('#isOut');
    if (!pl.ok) { out.innerHTML = `<p class="neg">${u.esc(pl.reason)}</p>`; return; }
    const rate = n('smRate'), days = n('smDays') || 3, minRoi = n('smRoi');
    const sell = d => rate ? Math.min(pl.qty, Math.floor(rate * d)) : null;
    const q = (t, a) => `<div class="qa"><span class="q">${t}</span><span class="a">${a}</span></div>`;
    out.innerHTML = `
      ${q('¿Cuánta plata necesito?', `<b>${u.fmt(pl.investment)}</b> para ${pl.qty} unidades.`)}
      ${q('¿Cuántas unidades puedo comprar o fabricar?', `${pl.byCapital} con tu capital${pl.byDemand !== null ? ` · ${pl.byDemand} según la demanda en ${days} día(s)` : ''} → <b>${pl.qty}</b> (limitado por ${pl.limitedBy}).`)}
      ${q('¿Cuántas podría vender?', rate ? `24 h: <b>${sell(1)}</b> · 48 h: <b>${sell(2)}</b> · 72 h: <b>${sell(3)}</b> (a ${rate} u/día).` : 'Escribe la velocidad de venta para estimarlo.')}
      ${q('¿Cuánto podría ganar después de todos los costos?', `<b class="${u.signCls(pl.profit)}">${u.fmt(pl.profit)}</b> · ROI ${u.pct(pl.roi)} (impuesto ${u.fmt(pl.tax)}${pl.setup ? ', publicación ' + u.fmt(pl.setup) : ''}).${minRoi !== null && pl.roi !== null && pl.roi < minRoi ? ' <span class="neg">No llega a tu ROI mínimo.</span>' : ''}`)}
      ${q('¿Precio mínimo para no perder?', `<b>${u.fmt(pl.breakeven)}</b> por unidad (${pl.netUnit > pl.unitCost ? 'hoy estás ' + u.pct((n('smPrice') / pl.breakeven - 1) * 100) + ' sobre ese mínimo' : '<span class="neg">el precio actual está por debajo</span>'}).`)}
      ${q('¿Cuánto capital quedaría inmovilizado?', rate ? `Si a los ${days} día(s) vendiste ${sell(days)}: <b>${u.fmt((pl.qty - sell(days)) * pl.unitCost)}</b> en ${pl.qty - sell(days)} unidades.` : 'Depende de cuánto vendas: mira la tabla.')}
      <h3>¿Y si el precio cae o vendes solo una parte?</h3>
      <p class="small muted">Plata recibida menos lo invertido. Lo no vendido queda como inventario (capital inmovilizado, entre paréntesis).</p>
      <div class="tablewrap"><table class="grid-table"><thead><tr><th>Precio</th>${[25, 50, 75, 100].map(s => `<th class="n">Vendes ${s}%</th>`).join('')}</tr></thead><tbody>
      ${pl.sens.map(r => `<tr><td>${r.drop ? '−' + r.drop + '%' : 'Actual'}</td>${r.cells.map(c => `<td class="n"><span class="${u.signCls(c.cash)}">${u.fmt(c.cash)}</span>${c.immobilized ? `<br><span class="small muted">(${u.fmt(c.immobilized)})</span>` : ''}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <p class="small">Si vendes todo más tarde: con el precio −5% ganas ${u.fmt(pl.sens[1].cells[3].profitIfAllLater)}, −10% ${u.fmt(pl.sens[2].cells[3].profitIfAllLater)}, −15% ${u.fmt(pl.sens[3].cells[3].profitIfAllLater)}.</p>
      <ul class="as-list small">${pl.notes.map(x => `<li>${u.esc(x)}</li>`).join('')}<li>Impuestos: ${ctx.taxPct}% de venta${u.$('#smMode').value === 'order' ? ' + ' + ctx.setupPct + '% de publicación' : ''} (Premium ${u.$('#smPrem').checked ? 'sí' : 'no'}). El costo por unidad ya trae materiales, estación y transporte: no se vuelven a descontar.</li></ul>`;
  }

  /* ================= OPERACIONES ================= */
  function renderOps() {
    const u = U(), all = SM.journal.all(), ctx = SM.engine.context();
    const g = { planned: [], active: [], closed: [] }; all.forEach(b => g[SM.journal.statusOf(b)].push(b));
    const learn = SM.forecast.learningFactor();
    const pl = b => b.plan || {};
    const row = b => {
      const s = SM.journal.stats(b), st = SM.journal.statusOf(b), p = pl(b), name = SM.crafting.label(b.item_id);
      const realH = s.sold ? s.days * 24 : null;
      return `<article class="op op-${st}" data-op="${u.esc(b.id)}">
        <header><b>${u.esc(name)}</b> <span class="tag">${{ planned: 'Planificada', active: 'Activa', closed: 'Cerrada' }[st]}</span>${p.risk ? ' ' + riskBadge(p.risk) : ''}</header>
        <p class="small route">${u.esc(b.note || '')}</p>
        <div class="kv4">
          <div><span class="lbl">Unidades</span><b>${st === 'planned' ? b.units : s.sold + ' / ' + b.units}</b></div>
          <div><span class="lbl">Capital</span><b>${u.fmt(b.totalCost)}</b></div>
          <div><span class="lbl">${st === 'planned' ? 'Ganancia est.' : 'Ganancia realizada'}</span><b class="${u.signCls(st === 'planned' ? p.estProfit : s.realizedProfit)}">${u.fmt(st === 'planned' ? p.estProfit : s.realizedProfit)}</b></div>
          <div><span class="lbl">${st === 'planned' ? 'Venta est.' : 'Estimado vs real'}</span><b>${st === 'planned' ? u.esc(fmtH(p.estHours)) : u.esc(fmtH(p.estHours)) + ' / ' + (realH ? u.esc(fmtH(realH)) : '—')}</b></div>
        </div>
        ${st !== 'planned' && p.estProfit !== undefined ? `<p class="small muted">Proyectado: ${u.fmt(p.estProfit)} (${u.pct(p.estRoi)}) · Real hasta ahora: ${u.fmt(s.realizedProfit)}${s.roiSold !== null ? ' (' + u.pct(s.roiSold) + ' sobre lo vendido)' : ''} · ${s.perDay.toFixed(1)} u/día${p.rate ? ' vs ' + p.rate.toFixed(1) + ' proyectadas' : ''}</p>` : ''}
        <div class="btns">${st === 'planned' ? '<button class="btn sm primary" data-a="activate">Activar</button>' : ''}${st === 'active' ? '<button class="btn sm primary" data-a="sale">Registrar venta</button><button class="btn sm" data-a="close">Cerrar</button>' : ''}<button class="btn sm ghost" data-a="del">Eliminar</button></div>
        <div class="opform" hidden></div>
      </article>`;
    };
    u.$('#iopLearn').innerHTML = `<p class="small">${u.esc(learn.note)} ${learn.samples >= 3 ? 'Este ajuste ya se aplica a todas las estimaciones de rotación.' : ''}</p>`;
    u.$('#iopList').innerHTML = ['active', 'planned', 'closed'].map(k => `<h3>${{ active: 'Activas', planned: 'Planificadas', closed: 'Cerradas' }[k]} (${g[k].length})</h3>${g[k].length ? g[k].map(row).join('') : '<p class="muted small">' + { active: 'Activa una operación planificada cuando la compres o fabriques.', planned: 'Guarda oportunidades desde «Oportunidades».', closed: 'Aún no hay operaciones cerradas.' }[k] + '</p>'}`).join('');
    u.$$('#iopList .op').forEach(el => el.onclick = e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const id = el.dataset.op, f = el.querySelector('.opform'), op = SM.journal.all().find(x => x.id === id);
      if (b.dataset.a === 'activate') { f.hidden = false; f.innerHTML = `<div class="fields"><label class="field"><span class="lbl">Unidades reales</span><input data-f="u" type="number" min="1" value="${op.units}"></label><label class="field"><span class="lbl">Costo total real</span><input data-f="c" type="number" min="0" value="${Math.round(op.totalCost)}"></label></div><button class="btn sm primary" data-a="activateyes">Confirmar</button>`; }
      if (b.dataset.a === 'activateyes') { SM.journal.activate(id, { units: +f.querySelector('[data-f=u]').value, totalCost: +f.querySelector('[data-f=c]').value }); u.toast('Operación activa'); renderOps(); }
      if (b.dataset.a === 'sale') { f.hidden = false; f.innerHTML = `<div class="fields"><label class="field"><span class="lbl">Unidades vendidas</span><input data-f="u" type="number" min="1" value="${SM.journal.stats(op).remaining}"></label><label class="field"><span class="lbl">Precio por unidad</span><input data-f="p" type="number" min="0" value="${(op.plan && op.plan.targetPrice) || ''}"></label><label class="field"><span class="lbl">Tipo</span><select data-f="m"><option value="instant">Venta inmediata</option><option value="order"${op.plan && op.plan.saleMode === 'order' ? ' selected' : ''}>Orden de venta</option></select></label></div><button class="btn sm primary" data-a="saleyes">Guardar venta</button>`; }
      if (b.dataset.a === 'saleyes') { SM.journal.addSale(id, { units: +f.querySelector('[data-f=u]').value, unitPrice: +f.querySelector('[data-f=p]').value, mode: f.querySelector('[data-f=m]').value }, { taxPct: ctx.taxPct, setupPct: ctx.setupPct }); u.toast('Venta registrada'); renderOps(); }
      if (b.dataset.a === 'close') { SM.journal.close(id); renderOps(); }
      if (b.dataset.a === 'del') { f.hidden = false; f.innerHTML = '<p class="small">¿Eliminar esta operación y sus ventas?</p><button class="btn sm" data-a="delyes">Sí, eliminar</button>'; }
      if (b.dataset.a === 'delyes') { SM.journal.removeBatch(id); renderOps(); }
    });
  }

  /* ================= HISTORIAL PROPIO ================= */
  async function renderOwn() {
    const u = U(), st = await SM.snapshots.stats();
    u.$('#iownStats').innerHTML = `<div class="kpis">
      <div class="kpi"><span class="lbl">Observaciones guardadas</span><b>${st.count.toLocaleString('es-CL')}</b><span class="s">máximo ${st.max.toLocaleString('es-CL')} (se borran las más viejas)</span></div>
      <div class="kpi"><span class="lbl">Objetos distintos</span><b>${st.items.toLocaleString('es-CL')}</b><span class="s">${st.mode === 'indexeddb' ? 'guardado en este dispositivo' : 'solo en memoria: este navegador no permite guardar'}</span></div>
      <div class="kpi"><span class="lbl">Desde</span><b style="font-size:15px">${st.since ? new Date(st.since).toLocaleString('es-CL') : '—'}</b><span class="s">hasta ${st.until ? new Date(st.until).toLocaleString('es-CL') : '—'}</span></div></div>`;
    u.$('#iownTop').innerHTML = st.top.length ? `<div class="tablewrap"><table class="grid-table"><thead><tr><th>Objeto</th><th>Mercado</th><th class="n">Observaciones</th></tr></thead><tbody>${st.top.map(t => `<tr class="clickable" data-o="${u.esc(t.item + '|' + t.city)}"><td>${u.esc(SM.crafting.label(t.item))}</td><td>${u.esc(locLabel(t.city))}</td><td class="n">${t.n}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Todavía no hay observaciones. Cualquier búsqueda en la app (Scanner, Calculadora, Oportunidades…) las va guardando.</p>';
    u.$$('#iownTop [data-o]').forEach(tr => tr.onclick = async () => { const [item, city] = tr.dataset.o.split('|'); const obs = await SM.snapshots.series(item, city, 1); u.$('#iownChart').innerHTML = `<h3>${u.esc(SM.crafting.label(item))} · ${u.esc(locLabel(city))}</h3>${ownChart(obs)}<p class="small muted">${obs.length} observaciones. Orden de compra más alta observada: ${obs.filter(o => o.bMax).length ? u.fmt(Math.max(...obs.filter(o => o.bMax).map(o => o.bMax))) : '—'}.</p>`; });
    u.$('#iownExp').onclick = async () => SM.export.json('silver-master-historial-propio.json', await SM.snapshots.exportJSON());
    u.$('#iownImp').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const n = await SM.snapshots.importJSON(JSON.parse(await f.text())); u.toast(n + ' observaciones importadas'); renderOwn(); } catch (er) { u.toast(er.message, 'err'); } e.target.value = ''; };
    u.$('#iownClr').onclick = () => { u.$('#iownClrC').hidden = false; };
    u.$('#iownClrYes').onclick = async () => { await SM.snapshots.clear(); u.$('#iownClrC').hidden = true; u.toast('Historial propio borrado'); renderOwn(); };
  }

  /* ================= RIESGO (configuración del asistente) ================= */
  function renderRisk() {
    const u = U(), R = SM.risk.rules(), oa = SM.storage.get('ops-alerts', { dropPct: 10 });
    u.$('#irForm').innerHTML = `<div class="fields">${Object.keys(SM.risk.DEFAULT_RULES).map(k => `<label class="field"><span class="lbl">${u.esc(SM.risk.RULE_INFO[k])}</span><input data-r="${k}" type="number" step="any" value="${R[k]}"></label>`).join('')}
      <label class="field"><span class="lbl">Alerta: caída del precio de una operación activa (%)</span><input id="irDrop" type="number" min="1" value="${oa.dropPct}"></label></div>
      <div class="btns"><button class="btn primary" id="irSave">Guardar reglas</button><button class="btn ghost" id="irReset">Volver a los valores por defecto</button></div>
      <h3>Lo que no se puede medir con los datos disponibles</h3><ul class="as-list small">${SM.risk.NOT_MEASURABLE.map(x => `<li>${u.esc(x)}</li>`).join('')}</ul>
      <h3>Pesos del puntaje de recomendaciones</h3><p class="small">Riesgo: ${Object.entries(SM.recommend.RISK_MULT).map(([k, v]) => k + ' ×' + v).join(' · ')}. Confianza: ${Object.entries(SM.recommend.CONF_MULT).map(([k, v]) => k + ' ×' + v).join(' · ')}.</p>`;
    u.$('#irSave').onclick = () => { const r = {}; u.$$('#irForm [data-r]').forEach(i => r[i.dataset.r] = +i.value); SM.risk.saveRules(r); SM.storage.set('ops-alerts', { dropPct: +u.$('#irDrop').value || 10 }); if (SM.intel && SM.intel.last) SM.recommend.recalc(); u.toast('Reglas guardadas'); };
    u.$('#irReset').onclick = () => { SM.storage.remove('risk-rules'); SM.storage.remove('ops-alerts'); renderRisk(); u.toast('Reglas por defecto'); };
  }

  /* ================= ASISTENTE ================= */
  function initChat() {
    const u = U();
    if (V.inited.chat) return;
    V.inited.chat = true;
    u.$('#icSugg').innerHTML = SM.assistant.EXAMPLES.map(e => `<button type="button" class="chip">${u.esc(e)}</button>`).join('');
    u.$('#icSugg').onclick = e => { const b = e.target.closest('.chip'); if (b) { u.$('#icIn').value = b.textContent; send(); } };
    u.$('#icForm').onsubmit = e => { e.preventDefault(); send(); };
    say('bot', '<p>Hola. Respondo con los datos y cálculos de la app: no invento precios. Si no tengo datos, los consulto a Albion Online Data Project (puede tardar un poco). Toca una pregunta de ejemplo o escribe la tuya.</p>');
  }
  function say(who, html) {
    const u = U(), log = u.$('#icLog'), d = document.createElement('div');
    d.className = 'msgb ' + who; d.innerHTML = html; log.appendChild(d); d.scrollIntoView({ block: 'nearest' });
    U().$$('[data-as-open]', d).forEach(b => b.onclick = () => detail(findRec(b.dataset.asOpen)));
    return d;
  }
  async function send() {
    const u = U(), q = u.$('#icIn').value.trim(); if (!q) return;
    u.$('#icIn').value = ''; say('me', `<p>${u.esc(q)}</p>`);
    const wait = say('bot', '<p class="muted">Calculando…</p>'); u.$('#icSend').disabled = true; SM.app.busy(true);
    try { const html = await SM.assistant.ask(q, m => { wait.innerHTML = `<p class="muted">${u.esc(m)}</p>`; }); wait.innerHTML = html; U().$$('[data-as-open]', wait).forEach(b => b.onclick = () => detail(findRec(b.dataset.asOpen))); }
    finally { u.$('#icSend').disabled = false; SM.app.busy(false); }
  }

  SM.views = SM.views || {};
  SM.views.intel = { init, sub, detail, refreshAll, _V: V };
})(typeof window !== 'undefined' ? window : globalThis);
