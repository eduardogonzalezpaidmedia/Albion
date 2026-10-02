/* Silver Master — Calculadora sencilla (Mercado Negro).
   Escribes (o cargas) el precio que paga el Mercado Negro por un objeto y la app te dice:
   materiales y cantidades, dónde comprarlos más barato, si es FACTIBLE fabricarlo y cuántas fabricar
   según lo que se vendió cada día en los últimos 7 días. Todos los precios se pueden corregir a mano.
   Usa el mismo motor que la Calculadora (SM.engine.evaluate): no repite fórmulas. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const U = () => SM.ui;
  const BM = 'Black Market';
  const S = { item: null, idx: {}, hist: null, man: {}, days: {}, loaded: false };

  function init() {
    const u = U();
    S.picker = u.itemPicker(u.$('#spPicker'), it => choose(it), { placeholder: 'Buscar objeto: «bolsa 5.1», «capucha de mercenario 6»…' });
  }
  function open(it) { SM.app.go('simple', true); S.picker.set(it); choose(it); }

  function choose(it) {
    const u = U(), P = SM.storage.profile();
    S.item = it; S.idx = {}; S.hist = null; S.man = {}; S.days = {}; S.loaded = false;
    const cities = SM.data.cities.filter(c => c.type !== 'black_market').map(c => c.id);
    const bc = SM.crafting.bonusCity(it);
    u.$('#spBody').hidden = false;
    u.$('#spForm').innerHTML = `<div class="fields">
      <label class="field"><span class="lbl">Precio del Mercado Negro (por unidad)</span><input id="spPrice" type="number" min="0" inputmode="numeric" placeholder="Escríbelo o toca «Cargar precios»"><span class="hint" id="spPriceHint">Lo que paga la orden de compra del Mercado Negro.</span></label>
      <label class="field"><span class="lbl">Cantidad a fabricar</span><input id="spUnits" type="number" min="1" inputmode="numeric" value="10"></label>
      <label class="field"><span class="lbl">Fabricas en</span><select id="spCity">${u.options(cities, bc || P.city)}</select><span class="hint">${bc ? 'Ciudad con bono para este objeto: ' + u.esc(bc) : 'Sin ciudad con bono verificada'}</span></label>
      <label class="field"><span class="lbl">Foco</span><span class="check"><input id="spFocus" type="checkbox"${P.focus ? ' checked' : ''}> Usar foco</span></label>
      <label class="field"><span class="lbl">Tarifa de fabricación (total)</span><input id="spFee" type="number" min="0" inputmode="numeric" value="0"><span class="hint">Cópiala de la ventana de fabricación del juego.</span></label>
      <label class="field"><span class="lbl">Tu parte de las ventas (%)</span><input id="spShare" type="number" min="1" max="100" value="${(SM.storage.prefs().demand || {}).sharePct || 30}"><span class="hint">Cuánto de lo que se vende al día te llevas tú.</span></label>
    </div>`;
    ['spPrice', 'spUnits', 'spFee', 'spShare'].forEach(id => u.$('#' + id).addEventListener('input', render));
    ['spCity', 'spFocus'].forEach(id => u.$('#' + id).addEventListener('change', render));
    u.$('#spLoad').onclick = load;
    u.$('#spFull').onclick = () => SM.views.calc.open(S.item, true, { units: +u.$('#spUnits').value || 10, craftCity: u.$('#spCity').value, sellMarket: BM, focus: u.$('#spFocus').checked });
    u.$('#spMsg').textContent = '';
    renderDays(); render(); load();
  }

  async function load() {
    const u = U(), it = S.item; if (!it) return;
    const recipe = SM.crafting.recipe(it.item_id);
    const mats = recipe ? recipe.materials.map(m => m.item_id) : [];
    const btn = u.$('#spLoad'); btn.disabled = true; SM.app.busy(true);
    u.$('#spMsg').textContent = 'Cargando precios en línea…'; u.$('#spMsg').className = 'msg';
    try {
      const [p1, p2, h] = await Promise.all([
        SM.api.getPrices(mats, SM.crafting.buyLocations(), [1], { force: S.loaded }),
        SM.api.getPrices([it.item_id], [BM], [1], { force: S.loaded }),
        SM.api.getHistory([it.item_id], [BM], [1], 24, { force: S.loaded })
      ]);
      if (S.item !== it) return;
      S.idx = SM.market.index(p1.rows); SM.market.index(p2.rows, S.idx);
      S.hist = h.rows.find(r => r.location === BM && r.item_id === it.item_id) || null;
      S.loaded = true;
      const bo = SM.market.buyOrder(SM.market.row(S.idx, it.item_id, BM, 1));
      const inp = u.$('#spPrice');
      if (bo && !inp.value) inp.value = bo.price;
      u.$('#spPriceHint').innerHTML = bo ? `En línea: <b>${u.fmt(bo.price)}</b> ${u.ageBadge(bo.date)} <button type="button" class="btn sm" id="spUse">Usar</button>` : 'En línea no hay precio del Mercado Negro para este objeto: escríbelo tú.';
      const use = u.$('#spUse'); if (use) use.onclick = () => { inp.value = bo.price; render(); };
      u.$('#spMsg').textContent = 'Precios en línea cargados ' + new Date().toLocaleTimeString('es-CL') + (p1.stale || p2.stale ? ' (sin conexión: se usó lo guardado)' : '') + ' · Puedes corregir cualquier precio a mano.';
    } catch (e) { u.$('#spMsg').textContent = '⚠ No pude cargar precios en línea (' + e.message + '). Escríbelos a mano.'; u.$('#spMsg').className = 'msg err'; }
    finally { btn.disabled = false; SM.app.busy(false); renderDays(); render(); }
  }

  function evaluate() {
    const u = U(), n = id => +u.$('#' + id).value || 0;
    const man = {}; Object.entries(S.man).forEach(([id, p]) => { if (p > 0) man[id] = { price: p }; });
    const ctx = SM.engine.context({ craftCity: u.$('#spCity').value, focus: u.$('#spFocus').checked, units: Math.max(1, n('spUnits')), manualPrices: man,
      manualSale: n('spPrice') || null, sellMarkets: [BM], saleMode: 'instant', maxAgeH: null, fee: { value: n('spFee'), mode: 'total' }, transport: { legs: [], perUnit: 0 } });
    return { e: SM.engine.evaluate(S.item, S.idx, ctx), ctx };
  }

  function render() {
    const u = U(); if (!S.item) return;
    const { e, ctx } = evaluate(), c = e.calc, cities = SM.crafting.buyLocations();
    /* ---- materiales ---- */
    u.$('#spMats').innerHTML = c.lines.map(l => {
      const all = SM.market.byLocation(S.idx, l.item_id, cities, 1).filter(x => x.sell).sort((a, b) => a.sell.price - b.sell.price);
      const best = all[0], mine = S.man[l.item_id];
      return `<div class="sp-mat">
        <div class="sp-mh"><b>${u.esc(SM.crafting.label(l.item_id))}</b><span class="sp-q">Comprar <b>${l.toBuy === null ? '—' : l.toBuy.toLocaleString('es-CL')}</b></span></div>
        <p class="small muted">${l.perCraft} por crafteo × ${c.crafts} = ${u.fmtQ(l.gross)}${l.returnable ? ' · vuelven ' + u.fmtQ(l.recovered) + ' (' + u.pct(c.returnRate * 100) + ')' : ' · no retorna'}</p>
        <p class="small">${best ? `Más barato en línea: <b>${u.esc(best.location)}</b> a <span class="silver">${u.fmt(best.sell.price)}</span> ${u.ageBadge(best.sell.date)}` : '<span class="warn">Sin precio en línea: escríbelo abajo.</span>'}</p>
        ${all.length > 1 ? `<details class="small"><summary>Ver las ${all.length} ciudades</summary><ul class="miss-list">${all.map(x => `<li><span>${u.esc(x.location)}</span><span><span class="silver">${u.fmt(x.sell.price)}</span> ${u.ageBadge(x.sell.date)}</span></li>`).join('')}</ul></details>` : ''}
        <label class="field inline sp-in"><span class="lbl">Tu precio (por unidad)</span><input type="number" min="0" inputmode="numeric" data-mat="${u.esc(l.item_id)}" value="${mine > 0 ? mine : ''}" placeholder="${best ? best.sell.price : 'Sin datos'}"></label>
        <p class="small sp-cost">Costo de este material: <b>${u.fmt(l.cost)}</b>${mine > 0 ? ' <span class="tag">precio tuyo</span>' : ''}</p>
      </div>`;
    }).join('') || '<p class="muted">Este objeto no tiene receta en los datos del juego.</p>';
    u.$$('#spMats [data-mat]').forEach(inp => inp.addEventListener('change', () => { const v = +inp.value; if (v > 0) S.man[inp.dataset.mat] = v; else delete S.man[inp.dataset.mat]; render(); }));

    /* ---- veredicto ---- */
    const be = c.totalCost !== null ? SM.invest.breakeven(c.totalCost / c.made, 'instant', ctx.taxPct, ctx.setupPct) : null;
    const price = +u.$('#spPrice').value || 0;
    let verdict;
    if (!price) verdict = { cls: 'wait', t: 'Falta el precio del Mercado Negro', d: 'Escríbelo arriba o carga los precios en línea.' };
    else if (c.totalCost === null) verdict = { cls: 'wait', t: 'Faltan precios de materiales', d: 'Completa «Tu precio» en los materiales marcados sin precio.' };
    else if (c.profit > 0 && c.roi >= 5) verdict = { cls: 'yes', t: 'FACTIBLE', d: `Ganas ${u.fmt(c.profitPerUnit)} por unidad (${u.pct(c.roi)}).` };
    else if (c.profit > 0) verdict = { cls: 'meh', t: 'FACTIBLE, PERO JUSTO', d: `El margen es de solo ${u.pct(c.roi)}: cualquier cambio de precio lo deja en pérdida.` };
    else verdict = { cls: 'no', t: 'NO ES FACTIBLE', d: `Pierdes ${u.fmt(Math.abs(c.profitPerUnit))} por unidad. El Mercado Negro tendría que pagar al menos ${u.fmt(be)}.` };
    const k = (l, v, s, cls) => `<div class="kpi ${cls || ''}"><span class="lbl">${l}</span><b>${v}</b><span class="s">${s || ''}</span></div>`;
    u.$('#spResult').innerHTML = `<div class="sp-verdict v-${verdict.cls}"><b>${verdict.t}</b><span>${verdict.d}</span></div>
      <div class="kpis">
        ${k('Costo total', u.fmt(c.totalCost), `${c.made} unidades · materiales ${u.fmt(c.materialCost)}${c.craftingFee ? ' + tarifa ' + u.fmt(c.craftingFee) : ''}`)}
        ${k('Costo por unidad', c.totalCost === null ? 'Sin datos' : u.fmt(c.totalCost / c.made), 'con el retorno de ' + u.pct(c.returnRate * 100))}
        ${k('Recibes del Mercado Negro', u.fmt(c.sale ? c.sale.net : null), c.sale ? `${u.fmt(c.sale.gross)} − impuesto ${ctx.taxPct}% (${u.fmt(c.sale.tax)})` : '')}
        ${k('Ganancia del lote', u.fmt(c.profit), c.roi === null ? '' : 'ROI ' + u.pct(c.roi), c.profit > 0 ? 'pos' : c.profit < 0 ? 'neg' : '')}
        ${k('Precio mínimo para no perder', u.fmt(be), 'por unidad en el Mercado Negro')}
      </div>
      <p class="hint">Retorno ${u.pct(c.returnRate * 100)} en ${u.esc(ctx.craftCity)}${e.rr.bonusKind ? ' (con bono de ciudad)' : ' (sin bono)'}${ctx.focus ? ' con foco' : ''}. No incluye el riesgo de llevar la carga a Caerleon. La orden del Mercado Negro puede llenarse o bajar antes de que llegues.</p>`;

    renderSales(c);
  }

  /* ---- ventas por día (7 días): datos en línea que puedes reemplazar por los tuyos ---- */
  function dayRows() {
    const days = SM.demand.dailySeries(S.hist, 7);
    return days.map((d, i) => ({ t: d.t, online: d.count, price: d.price, value: S.days[i] !== undefined ? S.days[i] : d.count, mine: S.days[i] !== undefined }));
  }
  function renderDays() {
    const u = U(), rows = dayRows(), hasOnline = rows.some(r => r.online > 0);
    u.$('#spDays').innerHTML = `<p class="small">${hasOnline ? 'Vienen con lo que registró Albion Data. Cambia cualquier día por lo que tú viste en el juego.' : (S.loaded ? 'Albion Data no registró ventas de este objeto en el Mercado Negro.' : 'Aún sin datos en línea.') + ' Escribe cuántas unidades se vendieron cada día.'}</p>
      <div class="sp-days">${rows.map((r, i) => `<label class="sp-day"><span class="sp-d">${new Date(r.t).toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', timeZone: 'UTC' })}</span><input type="number" min="0" inputmode="numeric" data-day="${i}" value="${r.mine || r.online ? r.value : ''}" placeholder="0"><span class="small muted">${S.loaded ? 'en línea: ' + r.online.toLocaleString('es-CL') : ''}</span></label>`).join('')}</div>
      <div class="btns"><button type="button" class="btn sm ghost" id="spDaysReset">Volver a los datos en línea</button><button type="button" class="btn sm ghost" id="spDaysClear">Borrar todo</button></div>`;
    u.$$('#spDays [data-day]').forEach(inp => inp.addEventListener('input', () => { const i = +inp.dataset.day; if (inp.value === '') delete S.days[i]; else S.days[i] = Math.max(0, Math.round(+inp.value || 0)); renderSales(evaluate().e.calc); }));
    u.$('#spDaysReset').onclick = () => { S.days = {}; renderDays(); renderSales(evaluate().e.calc); };
    u.$('#spDaysClear').onclick = () => { S.days = {}; for (let i = 0; i < 7; i++) S.days[i] = 0; renderDays(); u.$$('#spDays [data-day]').forEach(x => x.value = ''); renderSales(evaluate().e.calc); };
  }
  function renderSales(c) {
    const u = U(), box = u.$('#spSales'), rows = dayRows();
    const vals = rows.map(r => r.value), total = vals.reduce((a, b) => a + b, 0), mineN = rows.filter(r => r.mine).length;
    if (!total) { box.innerHTML = '<p class="warn">Sin ventas anotadas todavía. Escribe las unidades vendidas de cada día para calcular la cantidad sugerida.</p>'; return; }
    const max = Math.max(...vals), avg = total / 7, min = Math.min(...vals);
    const share = Math.min(100, Math.max(1, +u.$('#spShare').value || 30)) / 100;
    const y = c.yieldN || 1, lot = q => Math.max(0, Math.floor(q / y) * y);
    const sug1 = lot(avg * share), sug3 = lot(avg * share * 3), safe = lot(min * share), units = c.made;
    const rec = c.profit > 0 ? `Fabrica <b>${Math.max(sug1, y)}</b> para venderlas en ~1 día, o hasta <b>${Math.max(sug3, y)}</b> si aceptas esperar unos 3 días.`
      : c.profit === null ? 'Falta el precio del Mercado Negro o de algún material para saber si conviene.' : 'Como hoy deja pérdida, no conviene fabricar aunque haya ventas.';
    const k = (l, v, s2) => `<div class="kpi"><span class="lbl">${l}</span><b>${v}</b><span class="s">${s2 || ''}</span></div>`;
    box.innerHTML = `<div class="sp-bars">${rows.map(r => `<div class="sp-bar"><span class="sp-d">${new Date(r.t).toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', timeZone: 'UTC' })}</span><span class="sp-track"><i style="width:${max ? Math.round(r.value / max * 100) : 0}%"></i></span><span class="sp-n"><b>${r.value.toLocaleString('es-CL')}</b>${r.mine ? ' <span class="tag">tuyo</span>' : ''}</span></div>`).join('')}</div>
      <div class="kpis">
        ${k('Promedio por día', avg.toLocaleString('es-CL', { maximumFractionDigits: 1 }), total.toLocaleString('es-CL') + ' en 7 días')}
        ${k('Día más flojo', min.toLocaleString('es-CL'), 'día más fuerte: ' + max.toLocaleString('es-CL'))}
        ${k('Tu parte por día', (avg * share).toLocaleString('es-CL', { maximumFractionDigits: 1 }), Math.round(share * 100) + '% del promedio')}
      </div>
      <div class="sp-rec"><b>Cantidad sugerida</b><p>${rec}</p>
        <p class="small muted">Cantidad prudente (según el día más flojo): ${safe}. Tú pusiste ${units}${sug3 && units > sug3 ? ': es más de lo que el mercado mostró en 3 días, parte puede quedarse sin vender.' : '.'}</p>
        ${c.profit > 0 ? `<div class="btns"><button class="btn sm" data-q="${Math.max(sug1, y)}">Usar ${Math.max(sug1, y)}</button><button class="btn sm" data-q="${Math.max(sug3, y)}">Usar ${Math.max(sug3, y)}</button></div>` : ''}</div>
      <p class="hint">${mineN === 7 ? 'Calculado con los datos que tú anotaste.' : mineN ? `Calculado con ${mineN} día(s) tuyos y ${7 - mineN} de Albion Data.` : 'Calculado con lo que registró Albion Online Data Project (no son todas las ventas del servidor).'} Es una orientación, no una garantía.</p>`;
    u.$$('#spSales [data-q]').forEach(b2 => b2.onclick = () => { u.$('#spUnits').value = b2.dataset.q; render(); u.toast('Cantidad cambiada a ' + b2.dataset.q); });
  }

  SM.views = SM.views || {};
  SM.views.simple = { init, open };
})(typeof window !== 'undefined' ? window : globalThis);
