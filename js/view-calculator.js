/* Silver Master — vista Crafting Calculator. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const U = () => SM.ui;
  const S = { item: null, idx: {}, fetchedAt: null, stale: false, picker: null, last: null };

  function init() {
    S.picker = U().itemPicker(U().$('#calcPicker'), it => open(it, true));
  }

  function params() {
    const $ = U().$;
    const v = id => $('#' + id);
    const P = SM.storage.profile();
    const buy = v('cBuy').value, sell = v('cSell').value;
    const bon = v('cBonus').value;
    return {
      units: Math.max(1, Math.round(+v('cUnits').value || 1)),
      craftCity: v('cCity').value,
      bonusOverride: bon === 'auto' ? null : bon === 'yes',
      focus: v('cFocus').checked,
      dailyBonus: +v('cDaily').value || 0,
      manualRatePct: v('cRrMode').value === 'manual' ? (v('cRrPct').value === '' ? 0 : +v('cRrPct').value) : null,
      buyLocations: buy === 'cheapest' ? SM.crafting.buyLocations() : [buy],
      sellMarkets: sell === 'best' ? SM.crafting.marketLocations() : [sell],
      saleMode: v('cMode').value,
      quality: S.item.quality_supported ? +v('cQ').value : 1,
      fee: { value: +v('cFee').value || 0, mode: 'total' },
      transport: { legs: [+v('cTr').value || 0], perUnit: 0 },
      otherCosts: +v('cOther').value || 0,
      minutes: +v('cMin').value || 0,
      premium: P.premium
    };
  }

  function manualMap() { const m = SM.storage.manualPrices(); const o = {}; for (const k in m) o[k] = m[k]; return o; }

  async function fetchPrices(force) {
    const it = S.item; if (!it) return;
    const r = SM.crafting.recipe(it.item_id);
    const q = S.item.quality_supported && U().$('#cQ') ? +U().$('#cQ').value : 1;
    const btn = U().$('#cFetch'); if (btn) { btn.disabled = true; btn.textContent = 'Consultando…'; }
    try {
      const p1 = await SM.api.getPrices(r ? r.materials.map(m => m.item_id) : [], SM.crafting.buyLocations(), [1], { force });
      const p2 = await SM.api.getPrices([it.item_id], SM.crafting.marketLocations(), [q], { force });
      S.idx = SM.market.index(p1.rows); SM.market.index(p2.rows, S.idx);
      S.fetchedAt = Date.now(); S.stale = p1.stale || p2.stale;
      SM.app.setStale(S.stale || p1.errors.length || p2.errors.length);
    } catch (e) { U().toast('No se pudo consultar AODP: ' + e.message, 'err'); SM.app.setStale(true); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Actualizar precios (AODP)'; } }
    renderMats(); update();
  }

  function open(it, fetch, preset) {
    SM.app.go('calc', true);          // primero: inicializa la vista si nunca se abrió
    S.item = it; S.idx = {}; S.fetchedAt = null; S.hist = null; S.chainLoaded = false;
    S.picker.set(it);
    renderShell(preset || {});
    renderMats(); update();
    if (fetch !== false) fetchPrices(false);
  }

  function renderShell(pre) {
    const u = U(), it = S.item, P = SM.storage.profile(), F = SM.storage.prefs();
    F.demand = Object.assign({ days: 3, sharePct: 30, confidencePct: 80, salvagePct: 50 }, F.demand || {}); F.minutes = Object.assign({ buy: 10, transport1: 10, craft: 5, transport2: 10, sell: 10 }, F.minutes || {});
    const cities = SM.data.cities.filter(c => c.type !== 'black_market').map(c => c.id);
    const fav = SM.storage.favorites().includes(it.item_id);
    const st = SM.data.stations[it.crafting_station] || it.crafting_station || '—';
    const r = SM.crafting.recipe(it.item_id);
    const m = F.minutes, mins = (+m.buy || 0) + (+m.transport1 || 0) + (+m.craft || 0) + (+m.transport2 || 0) + (+m.sell || 0);
    const bc = SM.crafting.bonusCity(it);
    u.$('#calcBody').innerHTML = `
    <section class="panel">
      <div class="item-head">
        <div><h2>${u.esc(it.name)}</h2>
          <div class="row"><span class="tag">T${it.tier}.${it.enchantment}</span><span class="tag">${u.esc(SM.crafting.CATEGORY_LABEL[it.category] || it.category)}</span><span class="tag">${u.esc(st)}</span><span class="tag">${u.esc(it.item_id)}</span></div>
          <p class="muted small">Receta: ${r ? r.materials.map(x => x.quantity + ' × ' + u.esc(SM.crafting.label(x.item_id))).join(' + ') + ' → ' + r.quantity_produced + ' unidad(es)' : 'sin receta'}${bc ? ' · Ciudad con bono verificado: <b>' + u.esc(bc) + '</b>' : ''}</p>
        </div>
        <div class="row"><button class="star" id="cFav" aria-pressed="${fav}" title="Favorito">★</button><button class="btn primary" id="cFetch">Actualizar precios (AODP)</button></div>
      </div>
      <div class="fields">
        <label class="field"><span class="lbl">Cantidad a fabricar</span><input id="cUnits" type="number" min="1" value="${pre.units || 10}"></label>
        ${it.quality_supported ? `<label class="field"><span class="lbl">Calidad para vender</span><select id="cQ">${u.options(SM.crafting.QUALITIES.map(q => ({ value: q.q, label: q.label })), pre.quality || 1)}</select><span class="hint">La calidad al fabricar es aleatoria.</span></label>` : ''}
        <label class="field"><span class="lbl">Fabricas en</span><select id="cCity">${u.options(cities, pre.craftCity || P.city)}</select></label>
        <label class="field"><span class="lbl">Bono de ciudad</span><select id="cBonus"><option value="auto">Automático</option><option value="yes">Sí, aplica</option><option value="no">No aplica</option></select><span class="hint" id="cBonusHint"></span></label>
        <label class="field"><span class="lbl">Foco</span><span class="check"><input id="cFocus" type="checkbox"${(pre.focus ?? P.focus) ? ' checked' : ''}> Usar foco</span><span class="hint" id="cFocusHint"></span></label>
        <label class="field"><span class="lbl">Bono diario de producción (puntos)</span><input id="cDaily" type="number" min="0" step="1" value="${F.dailyBonus || 0}"></label>
        <label class="field"><span class="lbl">Retorno de recursos</span><select id="cRrMode"><option value="auto">Automático (fórmula)</option><option value="manual">Manual</option></select></label>
        <label class="field" id="cRrPctF" hidden><span class="lbl">Retorno manual (%)</span><input id="cRrPct" type="number" min="0" max="100" step="0.1" value="15.2"></label>
        <label class="field"><span class="lbl">Comprar materiales en</span><select id="cBuy"><option value="cheapest">La ciudad más barata</option>${u.options(SM.crafting.buyLocations())}</select></label>
        <label class="field"><span class="lbl">Vender en</span><select id="cSell"><option value="best">El mejor mercado</option>${u.options(SM.crafting.marketLocations().map(l => ({ value: l, label: l === 'Black Market' ? 'Mercado Negro' : l })), pre.sellMarket)}</select></label>
        <label class="field"><span class="lbl">Tipo de venta</span><select id="cMode"><option value="instant">Venta inmediata (orden de compra)</option><option value="order"${pre.saleMode === 'order' ? ' selected' : ''}>Publicar orden de venta</option></select></label>
        <label class="field"><span class="lbl">Tarifa de fabricación (total)</span><input id="cFee" type="number" min="0" value="0"><span class="hint">Cópiala de la ventana de fabricación.</span></label>
        <label class="field"><span class="lbl">Transporte (total)</span><input id="cTr" type="number" min="0" value="0"></label>
        <label class="field"><span class="lbl">Otros costos</span><input id="cOther" type="number" min="0" value="0"></label>
        <label class="field"><span class="lbl">Tiempo del ciclo (min)</span><input id="cMin" type="number" min="0" value="${mins}"><span class="hint">Compra + transporte + fabricación + venta.</span></label>
      </div>
    </section>
    <section class="panel"><div class="ph"><h2>Materiales</h2><span class="muted small" id="cPricesAge"></span></div><div id="cMats"></div></section>
    <section class="panel"><div class="ph"><h2>Resultado</h2><div class="btns"><button class="btn" id="cLog">Detalle del cálculo</button><button class="btn" id="cCsv">CSV</button><button class="btn" id="cJson">JSON</button><button class="btn ghost" id="cHist">Historial</button><button class="btn ghost" id="cRoute">Rutas</button><button class="btn ghost" id="cJournal">Registrar en el diario</button></div></div><div id="cResult"></div></section>
    ${SM.chain && SM.chain.craftableMaterials(it.item_id).length ? `<section class="panel"><div class="ph"><h2>Cadena de producción</h2><span class="muted small">¿Comprar el material refinado o refinarlo tú?</span></div>
      <div class="fields">
        <label class="field"><span class="lbl">Refinar en</span><select id="chWhere"><option value="bonus">La ciudad con bono de cada recurso</option><option value="same">La misma ciudad donde fabricas</option></select></label>
        <label class="field"><span class="lbl">Foco al refinar</span><span class="check"><input id="chFocus" type="checkbox"> Usar foco</span></label>
      </div>
      <div class="btns"><button class="btn primary" id="chGo">Comparar comprar vs refinar</button></div>
      <div id="cChain"></div></section>` : ''}
    <section class="panel"><div class="ph"><h2>Cantidad óptima</h2><span class="muted small">¿Cuántas fabricar según lo que se vende y hacia dónde va el precio? Estimación, no garantía.</span></div>
      <div class="fields">
        <label class="field"><span class="lbl">Vender en máximo (días)</span><input id="oDays" type="number" min="1" max="14" value="${F.demand.days}"></label>
        <label class="field"><span class="lbl">Tu parte de las ventas (%)</span><input id="oShare" type="number" min="1" max="100" value="${F.demand.sharePct}"><span class="hint">Cuánto de lo que se vende al día crees que te llevas tú.</span></label>
        <label class="field"><span class="lbl">Seguridad que quieres (%)</span><input id="oConf" type="number" min="50" max="99" value="${F.demand.confidencePct}"></label>
        <label class="field"><span class="lbl">Recuperas de lo no vendido (% del costo)</span><input id="oSalv" type="number" min="0" max="100" value="${F.demand.salvagePct}"><span class="hint">Si no se vende a tiempo: rematas, lo usas o lo vendes después.</span></label>
      </div>
      <div class="btns"><button class="btn primary" id="oGo">Calcular con el historial (30 días)</button></div>
      <div id="cOpt"></div></section>
    <section class="panel"><div class="ph"><h2>Comparación de ventas</h2><span class="muted small">Profit y ROI vendiendo en cada mercado, con los mismos costos.</span></div>
      <div class="row gap"><label class="field inline"><span class="lbl">Tu precio de venta (manual)</span><input id="cManualSale" type="number" min="0" placeholder="Sin datos"></label><p class="hint">Si lo escribes, reemplaza el precio de AODP en el resultado.</p></div>
      <div id="cSales"></div></section>`;
    if (pre.sellMarket) u.$('#cSell').value = pre.sellMarket;
    if (pre.buyFrom && SM.crafting.buyLocations().includes(pre.buyFrom)) u.$('#cBuy').value = pre.buyFrom;
    const on = (id, ev, fn) => u.$('#' + id).addEventListener(ev, fn);
    ['cUnits', 'cDaily', 'cRrPct', 'cFee', 'cTr', 'cOther', 'cMin', 'cManualSale'].forEach(id => on(id, 'input', () => { renderMatsQty(); update(); }));
    ['cCity', 'cBonus', 'cFocus', 'cBuy', 'cSell', 'cMode'].forEach(id => on(id, 'change', () => { renderMats(); update(); }));
    on('cRrMode', 'change', () => { u.$('#cRrPctF').hidden = u.$('#cRrMode').value !== 'manual'; renderMats(); update(); });
    if (u.$('#cQ')) on('cQ', 'change', () => fetchPrices(false));
    on('cFetch', 'click', () => fetchPrices(true));
    on('cFav', 'click', () => { const onf = SM.storage.toggleFavorite(it.item_id); u.$('#cFav').setAttribute('aria-pressed', onf); u.toast(onf ? 'Agregado a favoritos' : 'Quitado de favoritos'); SM.app.renderHome(); });
    on('cLog', 'click', () => S.last && u.modal('Detalle del cálculo', u.calcLog(S.last)));
    on('cCsv', 'click', () => S.last && exportCalc('csv'));
    on('cJson', 'click', () => S.last && exportCalc('json'));
    on('cHist', 'click', () => SM.views.history.open(it));
    on('cRoute', 'click', () => SM.views.routes.open(it));
    on('oGo', 'click', runOptimal);
    if (u.$('#chGo')) { on('chGo', 'click', runChain); on('chWhere', 'change', () => S.chainLoaded && renderChain()); on('chFocus', 'change', () => S.chainLoaded && renderChain()); }
    on('cJournal', 'click', () => { if (!S.last || !S.last.calc.ok) return u.toast('Primero necesitas un resultado completo.', 'err'); SM.views.journal.prefill(S.item, S.last); });
    ['oDays', 'oShare', 'oConf', 'oSalv'].forEach(id => on(id, 'input', () => S.hist && renderOptimal()));
  }

  function evalWith(over) {
    const c = SM.engine.context(Object.assign(params(), { manualPrices: manualMap(), maxAgeH: null }, over || {}));
    return SM.engine.evaluate(S.item, S.idx, c);
  }

  function renderMats() {
    const u = U(); if (!S.item || !u.$('#cMats')) return;
    const e = evalWith();
    const man = SM.storage.manualPrices();
    const r = e.recipe;
    if (!r) { u.$('#cMats').innerHTML = '<p class="insufficient">DATOS INSUFICIENTES: este objeto no tiene receta.</p>'; return; }
    u.$('#cMats').innerHTML = `<div class="tablewrap"><table class="grid-table">
      <thead><tr><th>Material</th><th class="n">Por crafteo</th><th class="n">Bruto</th><th class="n">Recuperado</th><th class="n">A comprar</th><th>AODP (más barato)</th><th class="n">Tu precio</th><th class="n">Costo</th></tr></thead>
      <tbody>${r.materials.map((m, i) => {
        const b = SM.market.cheapestBuy(S.idx, m.item_id, params().buyLocations, null);
        return `<tr><td>${u.esc(SM.crafting.label(m.item_id))}${m.returnable === false ? '<br><span class="small muted">no se devuelve</span>' : ''}</td>
        <td class="n">${m.quantity}</td><td class="n" id="mg${i}"></td><td class="n" id="mr${i}"></td><td class="n" id="mb${i}"></td>
        <td>${b ? '<span class="silver">' + u.fmt(b.price) + '</span> · ' + u.esc(b.location) + ' ' + u.ageBadge(b.date) : '<span class="muted">Sin datos</span>'}</td>
        <td class="n"><input type="number" min="0" data-mat="${u.esc(m.item_id)}" value="${man[m.item_id] ? man[m.item_id].price : ''}" placeholder="${b ? b.price : 'Sin datos'}" aria-label="Tu precio de ${u.esc(SM.crafting.label(m.item_id))}"></td>
        <td class="n" id="mc${i}"></td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="hint">Tu precio reemplaza al de AODP y queda guardado para todos los objetos que usan ese material. Borra el número para volver a AODP.</p>`;
    u.$$('[data-mat]', u.$('#cMats')).forEach(inp => inp.addEventListener('input', () => {
      const v = +inp.value; SM.storage.setManualPrice(inp.dataset.mat, inp.value === '' || !(v > 0) ? null : v); renderMatsQty(); update();
    }));
    u.$('#cPricesAge').textContent = S.fetchedAt ? 'Consultado ' + new Date(S.fetchedAt).toLocaleTimeString('es-CL') + (S.stale ? ' (dato guardado)' : '') : 'Sin consultar';
    renderMatsQty();
  }
  function renderMatsQty() {
    const u = U(); const e = evalWith();
    e.calc.lines.forEach((l, i) => {
      const s = (id, v) => { const el = u.$('#' + id + i); if (el) el.textContent = v; };
      s('mg', u.fmtQ(l.gross)); s('mr', u.fmtQ(l.recovered)); s('mb', u.fmt(l.toBuy)); s('mc', u.fmt(l.cost));
    });
  }

  function update() {
    const u = U(); if (!S.item || !u.$('#cResult')) return;
    const ms = +u.$('#cManualSale').value;
    const e = evalWith(ms > 0 ? { manualSale: ms } : {});
    S.last = e;
    const c = e.calc, rr = e.rr;
    u.$('#cBonusHint').innerHTML = rr.autoBonus.kind ? 'Detectado: esta ciudad tiene bono' : rr.autoBonus.verified ? 'Detectado: sin bono aquí' : 'Bono no verificado para esta ciudad';
    u.$('#cFocusHint').textContent = e.recipe && e.recipe.focus_base ? 'Foco base ' + u.fmt(e.recipe.focus_base) + ' por crafteo · con tu especialización ' + u.fmt(SM.returnRate.focusCost(e.recipe.focus_base, SM.engine.context().focusEfficiency)) : 'Sin dato de foco';
    const P = SM.storage.profile();
    const focusWarn = c.focusUsed && P.focusAvailable > 0 && c.focusUsed > P.focusAvailable ? `<p class="insufficient">Este lote usa ${u.fmt(c.focusUsed)} de foco y tienes ${u.fmt(P.focusAvailable)}.</p>` : '';
    u.$('#cResult').innerHTML = `
      ${c.ok ? '' : `<p class="insufficient">DATOS INSUFICIENTES — ${u.esc(c.reasons.join(' · '))}. No se muestra una rentabilidad ficticia.</p>`}
      <div class="flow"><span class="st">Compra · ${u.esc(params().buyLocations.length > 1 ? 'más barato' : params().buyLocations[0])}</span><span class="ar">→</span><span class="st">Fabrica · ${u.esc(params().craftCity)} · retorno ${u.pct(rr.rate === null ? null : rr.rate * 100)} <span class="mode ${rr.mode === 'MANUAL' ? 'manual' : 'auto'}">${rr.mode}</span></span><span class="ar">→</span><span class="st">Vende · ${e.sale ? u.esc(e.sale.location === 'Black Market' ? 'Mercado Negro' : e.sale.location) + ' a <span class="silver">' + u.fmt(e.sale.price) + '</span>' : 'Sin datos'}</span></div>
      <div class="kpis">
        <div class="kpi"><span class="lbl">Costo total</span><b>${u.fmt(c.totalCost)}</b><span class="s">materiales ${u.fmt(c.materialCost)} · tarifa ${u.fmt(c.craftingFee)} · transporte ${u.fmt(c.transport)}</span></div>
        <div class="kpi"><span class="lbl">Ingreso neto</span><b>${u.fmt(c.sale ? c.sale.net : null)}</b><span class="s">${c.sale ? 'impuesto ' + u.fmt(c.sale.tax) + (c.sale.setup ? ' · publicación ' + u.fmt(c.sale.setup) : '') : 'Sin datos'}</span></div>
        <div class="kpi ${u.signCls(c.profit)}"><span class="lbl">Profit del lote</span><b>${u.fmt(c.profit)}</b><span class="s">${u.fmt(c.profitPerUnit)} por unidad · ${c.made} unidades</span></div>
        <div class="kpi"><span class="lbl">ROI</span><b>${u.pct(c.roi)}</b><span class="s">profit / capital utilizado</span></div>
        <div class="kpi"><span class="lbl">Silver/hora</span><b>${u.fmt(c.silverPerHour)}</b><span class="s">con ${c.minutes || 0} min de ciclo</span></div>
        ${c.focusUsed ? `<div class="kpi"><span class="lbl">Beneficio económico</span><b>${c.focusSilver === null ? 'Sin valor' : u.fmt(c.economicProfit)}</b><span class="s">foco usado ${u.fmt(c.focusUsed)}${c.focusSilver === null ? ' · define el valor del foco en Ajustes' : ' · valor ' + u.fmt(c.focusSilver)}</span></div>` : ''}
      </div>${focusWarn}`;
    renderSales();
  }

  function renderSales() {
    const u = U(); const q = S.item.quality_supported && u.$('#cQ') ? +u.$('#cQ').value : 1;
    const rows = SM.crafting.marketLocations().map(loc => {
      const r = SM.market.row(S.idx, S.item.item_id, loc, q);
      const buy = SM.market.buyOrder(r), sell = loc === 'Black Market' ? null : SM.market.sellOrder(r);
      const ei = buy ? evalWith({ sellMarkets: [loc], saleMode: 'instant', maxAgeH: null }) : null;
      const eo = sell ? evalWith({ sellMarkets: [loc], saleMode: 'order', maxAgeH: null }) : null;
      return { loc, buy, sell, ei, eo };
    });
    u.$('#cSales').innerHTML = `<div class="tablewrap"><table class="grid-table">
      <thead><tr><th>Mercado</th><th class="n">Orden de compra<br><span class="small">venta inmediata</span></th><th>Actualizado</th><th class="n">Profit</th><th class="n">ROI</th><th class="n">Orden de venta<br><span class="small">precio anunciado</span></th><th>Actualizado</th><th class="n">Profit</th><th class="n">ROI</th></tr></thead>
      <tbody>${rows.map(x => `<tr><td><b>${u.esc(x.loc === 'Black Market' ? 'Mercado Negro' : x.loc)}</b></td>
        <td class="n silver">${x.buy ? u.fmt(x.buy.price) : '<span class="muted">Sin datos</span>'}</td><td>${x.buy ? u.ageBadge(x.buy.date) : ''}</td>
        <td class="n ${x.ei ? u.signCls(x.ei.calc.profit) : ''}">${x.ei ? u.fmt(x.ei.calc.profit) : '—'}</td><td class="n">${x.ei ? u.pct(x.ei.calc.roi) : '—'}</td>
        <td class="n silver">${x.loc === 'Black Market' ? '<span class="muted">No aplica</span>' : x.sell ? u.fmt(x.sell.price) : '<span class="muted">Sin datos</span>'}</td><td>${x.sell ? u.ageBadge(x.sell.date) : ''}</td>
        <td class="n ${x.eo ? u.signCls(x.eo.calc.profit) : ''}">${x.eo ? u.fmt(x.eo.calc.profit) : '—'}</td><td class="n">${x.eo ? u.pct(x.eo.calc.roi) : '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">La orden de compra es lo que obtienes vendiendo ahora. La orden de venta es el precio anunciado: para cobrarlo publicas una orden (paga publicación) y esperas a que alguien compre.</p>`;
  }

  async function runOptimal() {
    const u = U(), e = S.last;
    if (!SM.demand) { u.$('#cOpt').innerHTML = '<p class="insufficient">Falta el archivo js/demand.js. Súbelo a tu repositorio y recarga.</p>'; return; }
    if (!e || !e.calc.ok) { u.$('#cOpt').innerHTML = '<p class="insufficient">Primero necesitas un resultado completo (precios de materiales y de venta).</p>'; return; }
    let loc = e.sale.location;
    if (loc === 'Manual') { const s = u.$('#cSell').value; loc = s === 'best' ? SM.storage.profile().city : s; }
    const q = S.item.quality_supported && u.$('#cQ') ? +u.$('#cQ').value : 1;
    u.$('#oGo').disabled = true; u.$('#cOpt').innerHTML = '<p class="muted">Consultando historial de ' + u.esc(loc === 'Black Market' ? 'Mercado Negro' : loc) + '…</p>';
    try {
      const h = await SM.api.getHistory([S.item.item_id], [loc], [q], 24);
      S.hist = { row: h.rows.find(r => r.location === loc) || h.rows[0] || null, loc };
      renderOptimal();
    } catch (err) { u.$('#cOpt').innerHTML = '<p class="insufficient">⚠ No se pudo consultar el historial: ' + u.esc(err.message) + '</p>'; }
    finally { u.$('#oGo').disabled = false; }
  }
  function renderOptimal() {
    const u = U(), e = S.last; if (!S.hist || !e || !e.calc.ok) return;
    const v = id => +u.$('#' + id).value;
    const F = SM.storage.prefs(); F.demand = { days: v('oDays') || 3, sharePct: v('oShare') || 30, confidencePct: v('oConf') || 80, salvagePct: v('oSalv') }; SM.storage.savePrefs(F);
    const c = e.calc;
    const a = SM.demand.analyze({ histRow: S.hist.row, days: F.demand.days, share: F.demand.sharePct / 100, confidence: F.demand.confidencePct / 100,
      salePrice: e.sale.price, mode: c.sale.mode, netUnit: c.sale.net / c.made, unitCost: c.totalCost / c.made, salvagePct: F.demand.salvagePct / 100, yieldN: c.yieldN });
    if (!a.ok) { u.$('#cOpt').innerHTML = '<p class="insufficient">DATOS INSUFICIENTES — ' + u.esc(a.reason) + '</p>'; return; }
    const cur = a.evalQ(c.made);
    const tr = a.trend;
    const trTxt = tr ? `<span class="trend t-${tr.direction}">${tr.direction === 'sube' ? '▲ Sube' : tr.direction === 'baja' ? '▼ Baja' : '■ Estable'}</span> ${u.pct(tr.pctPerDay)} por día (últimos ${tr.points} días)` : 'Sin datos de precio suficientes';
    const rows = SM.demand.sampleRows(a, 9);
    const locN = S.hist.loc === 'Black Market' ? 'Mercado Negro' : S.hist.loc;
    u.$('#cOpt').innerHTML = `
      <div class="kpis">
        <div class="kpi"><span class="lbl">Se venden en ${a.days} días</span><b>${u.fmt(a.median)}</b><span class="s">mediana en ${u.esc(locN)} · en el 80% de los casos al menos ${u.fmt(a.p20)}</span></div>
        <div class="kpi"><span class="lbl">Precio</span><b style="font-size:16px">${trTxt}</b><span class="s">precio esperado al vender: ${u.pct((a.priceAdj - 1) * 100)} vs hoy</span></div>
        <div class="kpi"><span class="lbl">Tu precio frente al historial</span><b style="font-size:16px">${u.esc(a.pos.label)}</b><span class="s">${a.pos.rank === null ? '' : 'más alto que el ' + Math.round(a.pos.rank * 100) + '% de los días'} · tu parte efectiva ${u.pct(a.share * 100)}</span></div>
        <div class="kpi pos"><span class="lbl">Cantidad óptima</span><b>${a.best.q}</b><span class="s">mayor ganancia esperada: ${u.fmt(a.best.expProfit)} · vendes todo con ${Math.round(a.best.prob * 100)}% de prob.</span></div>
        <div class="kpi"><span class="lbl">Cantidad segura (${Math.round(a.conf * 100)}%)</span><b>${a.safe ? a.safe.q : '—'}</b><span class="s">${a.safe ? 'ganancia esperada ' + u.fmt(a.safe.expProfit) : 'ninguna cantidad llega a esa seguridad'}</span></div>
        <div class="kpi"><span class="lbl">Tu cantidad actual (${c.made})</span><b>${Math.round(cur.prob * 100)}%</b><span class="s">prob. de vender todo · esperas vender ${u.fmtQ(cur.expSold)}</span></div>
      </div>
      <div class="tablewrap"><table class="grid-table"><thead><tr><th class="n">Cantidad</th><th class="n">Prob. de vender todo en ${a.days} d</th><th class="n">Vendes (esperado)</th><th class="n">Ganancia esperada</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr class="${r.q === a.best.q ? 'opt' : a.safe && r.q === a.safe.q ? 'safe' : ''}"><td class="n">${r.q}${r.q === a.best.q ? ' ★' : ''}</td><td class="n">${Math.round(r.prob * 100)}%</td><td class="n">${u.fmtQ(r.expSold)}</td><td class="n ${u.signCls(r.expProfit)}">${u.fmt(r.expProfit)}</td><td><button class="btn ghost" data-useq="${r.q}">Usar</button></td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Cómo se calcula: se toman las ventas diarias de los últimos 30 días en ${u.esc(locN)} y se miran todas las ventanas de ${a.days} días. La probabilidad es la parte de esas ventanas en que tu porción (${u.pct(a.share * 100)}) alcanza para vender la cantidad. La ganancia esperada suma lo que vendes al precio esperado según la tendencia y lo que recuperas (${F.demand.salvagePct}% del costo) de lo que no vendes. ★ = mayor ganancia esperada. AODP solo registra parte de las ventas del juego. ${a.critical !== null ? 'Regla del modelo: conviene fabricar una unidad más mientras la probabilidad de venderla supere el ' + Math.round(a.critical * 100) + '% (pérdida por unidad no vendida ÷ (margen + pérdida)).' : ''}</p>`;
    u.$$('[data-useq]', u.$('#cOpt')).forEach(b => b.onclick = () => { u.$('#cUnits').value = b.dataset.useq; renderMatsQty(); update(); renderOptimal(); u.toast('Cantidad: ' + b.dataset.useq); });
  }

  function exportCalc(kind) {
    const e = S.last, c = e.calc, name = 'silver-master-' + e.item.item_id.replace('@', '_');
    if (kind === 'json') return SM.export.json(name + '.json', { item: e.item.item_id, name: e.item.name, returnRate: e.rr, buys: e.buys, sale: e.sale, calc: c, generated: new Date().toISOString() });
    const rows = c.lines.map(l => ({ k: SM.crafting.label(l.item_id), a: l.gross, b: l.recovered, cq: l.needed, p: l.price, cost: l.cost }));
    rows.push({ k: 'Costo total', cost: c.totalCost }, { k: 'Ingreso neto', cost: c.sale ? c.sale.net : null }, { k: 'Profit', cost: c.profit }, { k: 'ROI %', cost: c.roi });
    SM.export.csv(name + '.csv', rows, [{ label: 'Concepto', get: r => r.k }, { label: 'Bruto', get: r => r.a }, { label: 'Recuperado', get: r => r.b }, { label: 'Efectivo', get: r => r.cq }, { label: 'Precio', get: r => r.p }, { label: 'Valor', get: r => r.cost }]);
  }

  SM.views = SM.views || {};
  async function runChain() {
    const u = U(), it = S.item;
    u.$('#chGo').disabled = true; u.$('#cChain').innerHTML = '<p class="muted">Consultando precios de los recursos en bruto…</p>';
    try {
      const p = await SM.api.getPrices(SM.chain.subMaterialIds(it.item_id), SM.crafting.buyLocations(), [1]);
      SM.market.index(p.rows, S.idx); S.chainLoaded = true; renderChain();
    } catch (e) { u.$('#cChain').innerHTML = '<p class="insufficient">⚠ ' + u.esc(e.message) + '</p>'; }
    finally { u.$('#chGo').disabled = false; }
  }
  function renderChain() {
    const u = U(); if (!S.last) return;
    const base = SM.engine.context(Object.assign(params(), { manualPrices: manualMap(), maxAgeH: null }));
    const r = SM.chain.analyze(S.last, S.idx, base, { refineWhere: u.$('#chWhere').value, focus: u.$('#chFocus').checked });
    u.$('#cChain').innerHTML = `<div class="tablewrap"><table class="grid-table"><thead><tr><th>Material</th><th class="n">Cantidad</th><th>Refinar en</th><th class="n">Comprarlo c/u</th><th class="n">Refinarlo c/u</th><th class="n">Ahorro total</th><th>Conviene</th></tr></thead>
      <tbody>${r.rows.map(x => `<tr><td>${u.esc(SM.crafting.label(x.item.item_id))}</td><td class="n">${u.fmt(x.qty)}</td><td>${u.esc(x.city)} · ${u.pct(x.rr.rate * 100)}${x.rr.bonusKind ? ' <span class="small pos">bono</span>' : ''}</td>
        <td class="n">${u.fmt(x.buyUnit)}</td><td class="n">${x.refineUnit === null ? '<span class="muted">Sin datos</span>' : u.fmt(x.refineUnit)}</td>
        <td class="n ${u.signCls(x.saving)}">${x.saving === null ? '—' : u.fmt(x.saving)}</td><td>${x.better === 'refinar' ? '<b class="pos">Refinarlo tú</b>' : x.better === 'comprar' ? 'Comprarlo' : '<span class="muted">Datos insuficientes</span>'}</td></tr>`).join('')}</tbody></table></div>
      <div class="kpis"><div class="kpi"><span class="lbl">Profit comprando el refinado</span><b>${u.fmt(S.last.calc.profit)}</b></div>
        <div class="kpi ${r.totalSaving > 0 ? 'pos' : ''}"><span class="lbl">Ahorro refinando lo que conviene</span><b>${u.fmt(r.totalSaving)}</b></div>
        <div class="kpi ${u.signCls(r.chainProfit)}"><span class="lbl">Profit de la cadena completa</span><b>${u.fmt(r.chainProfit)}</b></div></div>
      <p class="hint">Refinarlo cuesta: recursos en bruto + refinado del tier anterior, con el retorno de refinado de esa ciudad. No incluye la tarifa de la estación de refinado ni el transporte entre ciudades: súmalos si aplican.</p>`;
  }

  SM.views.calc = { init, open, state: S };
})(typeof window !== 'undefined' ? window : globalThis);
