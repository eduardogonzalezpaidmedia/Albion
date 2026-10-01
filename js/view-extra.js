/* Silver Master — vistas Refinado local, Reventa y Diario de producción. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const U = () => SM.ui;
  const TIERS = [2, 3, 4, 5, 6, 7, 8].map(t => ({ value: t, label: 'T' + t }));
  const ENCH = [0, 1, 2, 3, 4].map(e => ({ value: e, label: '.' + e }));
  const locLabel = l => l === 'Black Market' ? 'Mercado Negro' : l;
  const RES = [
    { value: 'ore', label: 'Metal (mineral)' }, { value: 'wood', label: 'Tablas (madera)' }, { value: 'fiber', label: 'Tela (fibra)' },
    { value: 'hide', label: 'Cuero (piel)' }, { value: 'rock', label: 'Piedra' }
  ];
  const progress = (bar, msg) => (step, d, t) => { U().$(bar).style.width = Math.round(d / t * 100) + '%'; U().$(msg).textContent = step + '… ' + d + ' de ' + t; U().$(msg).className = 'msg'; };
  const demandCell = e => {
    const u = U();
    if (!e.demand) return '<span class="muted">—</span>';
    if (!e.demand.ok) return '<span class="muted small">sin historial</span>';
    return `<b>${e.demand.best}</b><br><span class="small muted">${Math.round(e.demand.probCurrent * 100)}% vender ${e.calc.made}</span>`;
  };
  const trendCell = e => e.demand && e.demand.ok && e.demand.trend ? `<span class="trend t-${e.demand.trend}">${e.demand.trend === 'sube' ? '▲ sube' : e.demand.trend === 'baja' ? '▼ baja' : '■ estable'}</span>` : '<span class="muted">—</span>';

  /* ---------- Refinado local ---------- */
  const refine = { res: null };
  refine.init = function () {
    const u = U(), P = SM.storage.profile();
    const cities = SM.data.cities.filter(c => c.type !== 'black_market').map(c => c.id);
    u.$('#refForm').innerHTML = `<div class="fields">
      <label class="field" style="grid-column:span 2"><span class="lbl">Dónde</span><select id="rfMode"><option value="bonus">Cada recurso en su ciudad con bono</option><option value="city">Todo en una ciudad que elijo</option></select></label>
      <label class="field" id="rfCityF" hidden><span class="lbl">Ciudad</span><select id="rfCity">${u.options(cities, P.city)}</select></label>
      <div class="field" style="grid-column:1/-1"><span class="lbl">Recursos</span><div class="chips" id="rfRes"></div></div>
      <label class="field"><span class="lbl">Tier mínimo</span><select id="rfTMin">${u.options(TIERS, 4)}</select></label>
      <label class="field"><span class="lbl">Tier máximo</span><select id="rfTMax">${u.options(TIERS, 8)}</select></label>
      <div class="field"><span class="lbl">Encantamiento</span><div class="chips" id="rfEnch"></div></div>
      <label class="field"><span class="lbl">Foco</span><span class="check"><input id="rfFocus" type="checkbox"${P.focus ? ' checked' : ''}> Usar foco</span></label>
      <label class="field"><span class="lbl">Tipo de venta</span><select id="rfSale"><option value="instant">Venta inmediata (orden de compra)</option><option value="order">Publicar orden de venta</option></select></label>
      <label class="field"><span class="lbl">Cantidad</span><select id="rfQMode"><option value="fixed">Cantidad fija</option><option value="capital">Lo que alcance mi capital</option></select></label>
      <label class="field"><span class="lbl">Cantidad fija</span><input id="rfUnits" type="number" min="1" value="100"></label>
      <label class="field"><span class="lbl">Capital</span><input id="rfCap" type="number" min="0" step="100000" value="${P.capital}"></label>
      <label class="field"><span class="lbl">Profit mínimo (lote)</span><input id="rfProfit" type="number" value="0"></label>
      <label class="field"><span class="lbl">ROI mínimo (%)</span><input id="rfRoi" type="number" value="0"></label>
      <label class="field"><span class="lbl">Precios de máximo (horas)</span><input id="rfAge" type="number" min="1" value="${SM.storage.prefs().maxAgeHours || 12}"></label>
    </div><p class="hint">Compras el recurso en bruto y el refinado del tier anterior en la ciudad, refinas ahí y vendes ahí mismo: sin transporte. Bonos de refinado verificados: Thetford metal, Fort Sterling tablas, Lymhurst tela, Martlock cuero, Bridgewatch piedra.</p>`;
    refine.res_ = u.chips(u.$('#rfRes'), RES, RES.map(r => r.value));
    refine.ench = u.chips(u.$('#rfEnch'), ENCH, [0, 1, 2, 3]);
    u.$('#rfMode').onchange = () => { u.$('#rfCityF').hidden = u.$('#rfMode').value !== 'city'; };
    u.$('#refGo').onclick = refine.run;
    u.$('#refCsv').onclick = () => refine.res && SM.export.csv('silver-master-refinado-local.csv', refine.res, [
      { label: 'Refinado', get: e => e.item.name }, { label: 'ID', get: e => e.item.item_id }, { label: 'Ciudad', get: e => e.context.craftCity },
      { label: 'Retorno %', get: e => (e.rr.rate * 100).toFixed(2) }, { label: 'Cantidad', get: e => e.calc.made }, { label: 'Costo', get: e => Math.round(e.calc.totalCost) },
      { label: 'Precio venta', get: e => e.sale.price }, { label: 'Profit', get: e => Math.round(e.calc.profit) }, { label: 'ROI %', get: e => e.calc.roi.toFixed(2) },
      { label: 'Liquidez/día', get: e => e.liquidity ?? '' }, { label: 'Cantidad óptima', get: e => e.demand && e.demand.ok ? e.demand.best : '' }]);
  };
  refine.run = async function () {
    const u = U(), v = id => u.$('#' + id);
    const res = refine.res_.values(), ench = refine.ench.values();
    if (!res.length) { v('refMsg').textContent = 'Elige al menos un recurso.'; v('refMsg').className = 'msg err'; return; }
    const items = SM.data.items.filter(it => it.category === 'refined' && res.includes(it.crafting_station) && it.tier >= +v('rfTMin').value && it.tier <= +v('rfTMax').value && ench.includes(it.enchantment));
    if (!items.length) { v('refMsg').textContent = 'Ningún refinado coincide con los filtros (la piedra solo existe en .0).'; v('refMsg').className = 'msg err'; return; }
    const groups = {};
    if (v('rfMode').value === 'city') groups[v('rfCity').value] = items;
    else items.forEach(it => { const c = SM.crafting.bonusCity(it); if (c) (groups[c] = groups[c] || []).push(it); });
    const P = SM.storage.profile(), saved = P.capital;
    if (v('rfQMode').value === 'capital') { P.capital = +v('rfCap').value || 0; SM.storage.saveProfile(P); }
    v('refGo').disabled = true; SM.app.busy(true);
    let rows = [], scanned = 0, invalid = 0, stale = false;
    try {
      for (const city of Object.keys(groups)) {
        const r = await SM.scanner.scan({
          itemIds: groups[city].map(i => i.item_id), tierMin: 2, tierMax: 8, craftCity: city, buyLocations: [city], sellMarkets: [city],
          saleMode: v('rfSale').value, focus: v('rfFocus').checked, quantityMode: v('rfQMode').value, units: +v('rfUnits').value || 100,
          minProfit: +v('rfProfit').value || 0, minRoi: v('rfRoi').value === '' ? null : +v('rfRoi').value, maxAgeH: +v('rfAge').value || 12
        }, progress('#refBar', '#refMsg'));
        r.rows.forEach(e => e.context = { craftCity: city });
        rows = rows.concat(r.rows); scanned += r.scanned; invalid += r.invalid; stale = stale || r.stale;
      }
      rows.sort((a, b) => b.calc.profit - a.calc.profit);
      refine.res = rows;
      v('refBar').style.width = '100%';
      v('refMsg').textContent = `Revisé ${scanned} refinados en ${Object.keys(groups).join(', ')}: ${rows.length} dejan ganancia vendiendo en la misma ciudad; ${invalid} con DATOS INSUFICIENTES.`;
      SM.app.setStale(stale);
      u.$('#refRes').hidden = false;
      u.table(u.$('#refTable'), rows, [
        { key: 'item', label: 'Refinado', get: e => e.item.name, html: e => `${u.esc(e.item.name)} <span class="tag">T${e.item.tier}.${e.item.enchantment}</span>` },
        { key: 'city', label: 'Ciudad', get: e => e.context.craftCity, html: e => `${u.esc(e.context.craftCity)}${e.rr.bonusKind ? ' <span class="small pos">bono</span>' : ''}` },
        { key: 'rr', label: 'Retorno', num: true, get: e => e.rr.rate, html: e => u.pct(e.rr.rate * 100) },
        { key: 'units', label: 'Cant.', num: true, get: e => e.calc.made },
        { key: 'cost', label: 'Costo / u', num: true, get: e => e.calc.totalCost / e.calc.made, html: e => u.fmt(e.calc.totalCost / e.calc.made) },
        { key: 'price', label: 'Venta / u', num: true, get: e => e.sale.price, html: e => `<span class="silver">${u.fmt(e.sale.price)}</span>` },
        { key: 'profit', label: 'Profit', num: true, get: e => e.calc.profit, html: e => `<span class="${u.signCls(e.calc.profit)}">${u.fmt(e.calc.profit)}</span>` },
        { key: 'roi', label: 'ROI', num: true, get: e => e.calc.roi, html: e => u.pct(e.calc.roi) },
        { key: 'liq', label: 'Liquidez /día', num: true, get: e => e.liquidity ?? null, html: e => e.liquidity == null ? '—' : e.liquidity.toLocaleString('es-CL', { maximumFractionDigits: 1 }) },
        { key: 'opt', label: 'Cant. óptima', num: true, get: e => e.demand && e.demand.ok ? e.demand.best : null, html: demandCell },
        { key: 'trend', label: 'Precio', get: e => e.demand && e.demand.trend, html: trendCell },
        { key: 'age', label: 'Antigüedad', get: e => e.oldestMinutes, html: e => u.ageBadgeMin(e.oldestMinutes) }
      ], { sortKey: 'profit', empty: 'Ningún refinado deja ganancia en la misma ciudad con estos filtros.', onRow: e => SM.views.calc.open(e.item, true, { units: e.calc.units, craftCity: e.context.craftCity, sellMarket: e.context.craftCity, buyFrom: e.context.craftCity, saleMode: e.calc.sale.mode, focus: v('rfFocus').checked }) });
    } catch (e) { v('refMsg').textContent = '⚠ ' + e.message; v('refMsg').className = 'msg err'; }
    finally { if (v('rfQMode').value === 'capital') { const p2 = SM.storage.profile(); p2.capital = saved; SM.storage.saveProfile(p2); } v('refGo').disabled = false; SM.app.busy(false); }
  };

  /* ---------- Reventa (flipping) ---------- */
  const flip = { res: null };
  flip.init = function () {
    const u = U(), P = SM.storage.profile(), F = SM.storage.prefs();
    const d = Object.assign({ days: 3, sharePct: 30 }, F.demand || {});
    u.$('#flipForm').innerHTML = `<div class="fields">
      <label class="field" style="grid-column:span 2"><span class="lbl">Tipo de reventa</span><select id="flMode"><option value="same">En la misma ciudad (orden de compra → orden de venta)</option><option value="cross">Entre ciudades (compro en una, vendo en otra)</option></select></label>
      <label class="field" id="flSaleF" hidden><span class="lbl">Venta en destino</span><select id="flSale"><option value="instant">Venta inmediata (orden de compra)</option><option value="order">Publicar orden de venta</option></select></label>
      <div class="field" style="grid-column:1/-1"><span class="lbl">Qué revender</span><div class="chips" id="flCats"></div></div>
      <label class="field"><span class="lbl">Tier mínimo</span><select id="flTMin">${u.options(TIERS, 4)}</select></label>
      <label class="field"><span class="lbl">Tier máximo</span><select id="flTMax">${u.options(TIERS, 8)}</select></label>
      <div class="field"><span class="lbl">Encantamiento</span><div class="chips" id="flEnch"></div></div>
      <div class="field" style="grid-column:1/-1"><span class="lbl">Mercados</span><div class="chips" id="flLocs"></div></div>
      <label class="field"><span class="lbl">Capital</span><input id="flCap" type="number" min="0" step="100000" value="${P.capital}"></label>
      <label class="field" id="flTrF" hidden><span class="lbl">Transporte por unidad</span><input id="flTr" type="number" min="0" value="${F.transportPerUnit || 0}"></label>
      <label class="field"><span class="lbl">Ganancia mínima por unidad</span><input id="flMin" type="number" min="0" value="100"></label>
      <label class="field"><span class="lbl">ROI mínimo (%)</span><input id="flRoi" type="number" value="5"></label>
      <label class="field"><span class="lbl">Ignorar ROI sobre (%)</span><input id="flMaxRoi" type="number" value="200"><span class="hint">Márgenes enormes suelen ser precios viejos.</span></label>
      <label class="field"><span class="lbl">Precios de máximo (horas)</span><input id="flAge" type="number" min="1" value="3"></label>
      <label class="field"><span class="lbl">Vender en (días)</span><input id="flDays" type="number" min="1" value="${d.days}"></label>
      <label class="field"><span class="lbl">Tu parte de las ventas (%)</span><input id="flShare" type="number" min="1" max="100" value="${d.sharePct}"></label>
    </div><p class="hint">Misma ciudad: pones una orden de compra 1 plata sobre la más alta y revendes 1 plata bajo la orden de venta más barata; pagas publicación en ambas órdenes e impuesto al vender. Entre ciudades: compras al instante la orden de venta más barata de una ciudad y vendes en otra. Las órdenes de compra pueden tardar en llenarse.</p>`;
    flip.cats = u.chips(u.$('#flCats'), [{ value: 'materials', label: 'Recursos y materiales' }].concat(u.catOptions()), ['materials', 'refined', 'potions']);
    flip.ench = u.chips(u.$('#flEnch'), ENCH, [0, 1, 2, 3]);
    flip.locs = u.chips(u.$('#flLocs'), SM.crafting.marketLocations().map(l => ({ value: l, label: locLabel(l) })), SM.crafting.marketLocations().filter(l => l !== 'Black Market'));
    u.$('#flMode').onchange = () => { const c = u.$('#flMode').value === 'cross'; u.$('#flSaleF').hidden = !c; u.$('#flTrF').hidden = !c; };
    u.$('#flipGo').onclick = flip.run;
    u.$('#flipCsv').onclick = () => flip.res && SM.export.csv('silver-master-reventa.csv', flip.res, [
      { label: 'Objeto', get: r => SM.crafting.label(r.id) }, { label: 'ID', get: r => r.id }, { label: 'Comprar en', get: r => r.buyLoc }, { label: 'Tipo compra', get: r => r.buyType },
      { label: 'Precio compra', get: r => r.buy }, { label: 'Vender en', get: r => r.sellLoc }, { label: 'Tipo venta', get: r => r.sellType }, { label: 'Precio venta', get: r => r.sell },
      { label: 'Ganancia/u', get: r => Math.round(r.profit) }, { label: 'ROI %', get: r => r.roi.toFixed(2) }, { label: 'Liquidez/día', get: r => r.liquidity ?? '' },
      { label: 'Cantidad sugerida', get: r => r.qty ?? '' }, { label: 'Ganancia total', get: r => r.totalProfit ? Math.round(r.totalProfit) : '' }]);
  };
  flip.run = async function () {
    const u = U(), v = id => u.$('#' + id);
    const cats = flip.cats.values(), ench = flip.ench.values(), locs = flip.locs.values();
    const tmin = +v('flTMin').value, tmax = +v('flTMax').value;
    const mode = v('flMode').value;
    if (locs.length < (mode === 'cross' ? 2 : 1)) { v('flipMsg').textContent = mode === 'cross' ? 'Elige al menos dos mercados.' : 'Elige al menos un mercado.'; v('flipMsg').className = 'msg err'; return; }
    let ids = SM.data.items.filter(it => cats.includes(it.category) && it.tier >= tmin && it.tier <= tmax && ench.includes(it.enchantment)).map(it => it.item_id);
    if (cats.includes('materials')) ids = ids.concat(SM.data.materials.map(m => m.item_id).filter(id => { const t = SM.crafting.tierOf(id); return t && t >= tmin && t <= tmax && ench.includes(SM.crafting.enchOf(id)) && !/ARTEFACT|TOKEN|QUESTITEM/.test(id); }));
    ids = [...new Set(ids)];
    if (!ids.length) { v('flipMsg').textContent = 'Nada que revisar con estos filtros.'; v('flipMsg').className = 'msg err'; return; }
    const ctx = SM.engine.context();
    v('flipGo').disabled = true; SM.app.busy(true);
    try {
      const r = await SM.flipping.scan({ ids, locations: locs, mode, saleMode: v('flSale').value, maxAgeH: +v('flAge').value || 3,
        minProfit: +v('flMin').value || 0, minRoi: +v('flRoi').value || 0, maxRoi: +v('flMaxRoi').value || 200, capital: +v('flCap').value || 0,
        days: +v('flDays').value || 3, sharePct: +v('flShare').value || 30, transportPerUnit: mode === 'cross' ? (+v('flTr').value || 0) : 0,
        taxPct: ctx.taxPct, setupPct: ctx.setupPct }, progress('#flipBar', '#flipMsg'));
      flip.res = r.rows; v('flipBar').style.width = '100%';
      v('flipMsg').textContent = `Revisé ${r.scanned.toLocaleString('es-CL')} objetos: ${r.rows.length} oportunidades de reventa (la mejor combinación de cada objeto).`;
      SM.app.setStale(r.stale);
      u.$('#flipRes').hidden = false;
      u.table(u.$('#flipTable'), r.rows, [
        { key: 'item', label: 'Objeto', get: x => SM.crafting.name(x.id), html: x => `${u.esc(SM.crafting.name(x.id))} <span class="tag">T${SM.crafting.tierOf(x.id)}.${SM.crafting.enchOf(x.id)}</span>` },
        { key: 'buy', label: 'Comprar', get: x => x.buy, html: x => `${u.esc(locLabel(x.buyLoc))} · <span class="silver">${u.fmt(x.buy)}</span><br><span class="small muted">${u.esc(x.buyType)}</span>` },
        { key: 'sell', label: 'Vender', get: x => x.sell, html: x => `${u.esc(locLabel(x.sellLoc))} · <span class="silver">${u.fmt(x.sell)}</span><br><span class="small muted">${u.esc(x.sellType)}</span>` },
        { key: 'profit', label: 'Ganancia / u', num: true, get: x => x.profit, html: x => `<span class="pos">${u.fmt(x.profit)}</span>` },
        { key: 'roi', label: 'ROI', num: true, get: x => x.roi, html: x => u.pct(x.roi) },
        { key: 'liq', label: 'Liquidez /día', num: true, get: x => x.liquidity, html: x => x.liquidity == null ? '—' : x.liquidity.toLocaleString('es-CL', { maximumFractionDigits: 1 }) },
        { key: 'qty', label: 'Cantidad sugerida', num: true, get: x => x.qty, html: x => x.qty == null ? '—' : u.fmt(x.qty) },
        { key: 'total', label: 'Ganancia total', num: true, get: x => x.totalProfit, html: x => x.totalProfit == null ? '—' : `<b class="pos">${u.fmt(x.totalProfit)}</b>` },
        { key: 'cap', label: 'Capital', num: true, get: x => x.capitalNeeded, html: x => u.fmt(x.capitalNeeded) },
        { key: 'age', label: 'Antigüedad', get: x => x.age, html: x => u.ageBadgeMin(x.age) }
      ], { sortKey: 'total', empty: 'No hay reventas con ganancia con estos filtros. Prueba bajar la ganancia mínima o subir las horas.', onRow: x => SM.views.global.open(SM.crafting.item(x.id) || { item_id: x.id, name: SM.crafting.name(x.id), tier: SM.crafting.tierOf(x.id), enchantment: SM.crafting.enchOf(x.id), quality_supported: false, category: 'materials' }) });
    } catch (e) { v('flipMsg').textContent = '⚠ ' + e.message; v('flipMsg').className = 'msg err'; }
    finally { v('flipGo').disabled = false; SM.app.busy(false); }
  };

  /* ---------- Diario de producción ---------- */
  const journal = { item: null, open: {} };
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const parseDate = s => { const t = Date.parse(s + 'T12:00:00'); return isFinite(t) ? t : Date.now(); };
  journal.init = function () {
    const u = U();
    u.$('#jForm').innerHTML = `<div id="jPicker"></div>
      <div class="fields">
        <label class="field"><span class="lbl">Dónde lo vendes</span><select id="jLoc">${u.options(SM.crafting.marketLocations().map(l => ({ value: l, label: locLabel(l) })), SM.storage.profile().city)}</select></label>
        <label class="field"><span class="lbl">Unidades fabricadas</span><input id="jUnits" type="number" min="1" value="10"></label>
        <label class="field"><span class="lbl">Costo total del lote</span><input id="jCost" type="number" min="0" value="0"><span class="hint">Materiales + tarifa + transporte.</span></label>
        <label class="field"><span class="lbl">Fecha</span><input id="jDate" type="date" value="${today()}"></label>
        <label class="field" style="grid-column:span 2"><span class="lbl">Nota</span><input id="jNote" type="text" placeholder="Opcional"></label>
      </div>
      <div class="btns"><button class="btn primary" id="jAdd">Agregar lote</button></div>`;
    journal.picker = u.itemPicker(u.$('#jPicker'), it => journal.item = it);
    u.$('#jAdd').onclick = () => {
      if (!journal.item) return u.toast('Elige qué fabricaste.', 'err');
      SM.journal.addBatch({ item_id: journal.item.item_id, location: u.$('#jLoc').value, units: +u.$('#jUnits').value, totalCost: +u.$('#jCost').value, date: parseDate(u.$('#jDate').value), note: u.$('#jNote').value });
      u.toast('Lote agregado'); journal.render();
    };
    u.$('#jCsv').onclick = () => SM.export.csv('silver-master-diario.csv', SM.journal.all(), [
      { label: 'Fecha', get: b => new Date(b.date).toISOString().slice(0, 10) }, { label: 'Objeto', get: b => SM.crafting.label(b.item_id) }, { label: 'ID', get: b => b.item_id },
      { label: 'Mercado', get: b => b.location }, { label: 'Unidades', get: b => b.units }, { label: 'Costo total', get: b => Math.round(b.totalCost) },
      { label: 'Vendidas', get: b => SM.journal.stats(b).sold }, { label: 'Neto recibido', get: b => Math.round(SM.journal.stats(b).net) },
      { label: 'Ganancia realizada', get: b => Math.round(SM.journal.stats(b).realizedProfit) }, { label: 'Ventas por día', get: b => SM.journal.stats(b).perDay.toFixed(2) }, { label: 'Nota', get: b => b.note }]);
    u.$('#jJson').onclick = () => SM.export.json('silver-master-diario.json', SM.journal.exportJSON());
    u.$('#jImport').onchange = async ev => {
      const f = ev.target.files[0]; if (!f) return;
      try { const n = SM.journal.importJSON(JSON.parse(await f.text()), 'merge'); u.toast(n + ' lotes importados'); journal.render(); }
      catch (e) { u.toast(e.message, 'err'); }
      ev.target.value = '';
    };
    journal.render();
  };
  journal.prefill = function (it, e) {
    SM.app.go('journal');
    const u = U();
    journal.item = it; journal.picker.set(it);
    u.$('#jUnits').value = e.calc.made; u.$('#jCost').value = Math.round(e.calc.totalCost);
    const loc = e.sale && e.sale.location !== 'Manual' ? e.sale.location : SM.storage.profile().city;
    if (SM.crafting.marketLocations().includes(loc)) u.$('#jLoc').value = loc;
    u.$('#jForm').scrollIntoView({ behavior: 'smooth' });
    u.toast('Revisa los datos y toca «Agregar lote».');
  };
  journal.render = function () {
    const u = U(), list = SM.journal.all(), T = SM.journal.totals(list);
    u.$('#jKpis').innerHTML = `
      <div class="kpi"><span class="lbl">Lotes</span><b>${T.batches}</b><span class="s">${u.fmt(T.units)} unidades fabricadas</span></div>
      <div class="kpi"><span class="lbl">Invertido</span><b>${u.fmt(T.invested)}</b><span class="s">stock sin vender a costo: ${u.fmt(T.stockValue)}</span></div>
      <div class="kpi"><span class="lbl">Recibido (neto)</span><b>${u.fmt(T.net)}</b><span class="s">${u.fmt(T.sold)} unidades vendidas</span></div>
      <div class="kpi ${u.signCls(T.realizedProfit)}"><span class="lbl">Ganancia realizada</span><b>${u.fmt(T.realizedProfit)}</b><span class="s">sobre lo ya vendido</span></div>`;
    const ctx = SM.engine.context();
    u.$('#jList').innerHTML = list.length ? list.map(b => {
      const s = SM.journal.stats(b), it = SM.crafting.item(b.item_id);
      return `<div class="jb" data-b="${u.esc(b.id)}">
        <div class="ph"><div><b>${u.esc(SM.crafting.label(b.item_id))}</b> <span class="tag">${u.esc(locLabel(b.location))}</span> <span class="muted small">${new Date(b.date).toLocaleDateString('es-CL')}${b.note ? ' · ' + u.esc(b.note) : ''}</span></div>
          <span class="${s.done ? 'pos' : 'muted'} small">${s.done ? 'Vendido completo' : s.remaining + ' por vender'}</span></div>
        <div class="kv4">
          <span>Fabricadas <b>${u.fmt(b.units)}</b></span><span>Vendidas <b>${u.fmt(s.sold)}</b></span><span>Costo/u <b>${u.fmt(s.unitCost)}</b></span><span>Precio prom. <b>${s.avgPrice ? u.fmt(s.avgPrice) : '—'}</b></span>
          <span>Ganancia <b class="${u.signCls(s.realizedProfit)}">${u.fmt(s.realizedProfit)}</b></span><span>ROI <b>${u.pct(s.roiSold)}</b></span><span>Ventas/día <b>${s.sold ? s.perDay.toLocaleString('es-CL', { maximumFractionDigits: 1 }) : '—'}</b></span><span>Días <b>${s.days.toLocaleString('es-CL', { maximumFractionDigits: 1 })}</b></span>
        </div>
        <div class="btns"><button class="btn" data-act="sale">Registrar venta</button><button class="btn ghost" data-act="share">Mi parte real del mercado</button><button class="btn ghost" data-act="sales">Ver ventas (${b.sales.length})</button>${it ? '<button class="btn ghost" data-act="calc">Calculadora</button>' : ''}<button class="btn ghost" data-act="del">Eliminar</button></div>
        <div class="jsub" data-sub hidden></div>
      </div>`;
    }).join('') : '<p class="muted">Todavía no registras lotes. Agrega uno arriba o desde la Calculadora con «Registrar en el diario».</p>';
    u.$$('#jList .jb').forEach(el => el.onclick = ev => {
      const btn = ev.target.closest('[data-act]'); if (!btn) return;
      const id = el.dataset.b, b = SM.journal.all().find(x => x.id === id), sub = el.querySelector('[data-sub]');
      const act = btn.dataset.act;
      if (act === 'calc') return SM.views.calc.open(SM.crafting.item(b.item_id), true, { units: b.units, sellMarket: b.location });
      if (act === 'del') { sub.hidden = false; sub.innerHTML = '<p>¿Eliminar este lote y sus ventas? <button class="btn" data-act="delyes">Sí, eliminar</button> <button class="btn ghost" data-act="close">No</button></p>'; return; }
      if (act === 'delyes') { SM.journal.removeBatch(id); journal.render(); return; }
      if (act === 'close') { sub.hidden = true; return; }
      if (act === 'sale') {
        const s = SM.journal.stats(b);
        sub.hidden = false;
        sub.innerHTML = `<div class="fields"><label class="field"><span class="lbl">Unidades</span><input data-f="u" type="number" min="1" value="${Math.max(1, s.remaining)}"></label>
          <label class="field"><span class="lbl">Precio c/u</span><input data-f="p" type="number" min="0" placeholder="Precio de venta"></label>
          <label class="field"><span class="lbl">Tipo</span><select data-f="m"><option value="order">Orden de venta</option><option value="instant">Venta inmediata</option></select></label>
          <label class="field"><span class="lbl">Fecha</span><input data-f="d" type="date" value="${today()}"></label></div>
          <div class="btns"><button class="btn primary" data-act="saleok">Guardar venta</button><button class="btn ghost" data-act="close">Cancelar</button></div>
          <p class="hint">El neto se calcula con tu impuesto actual (${ctx.taxPct}%) y, si es orden de venta, la publicación (${ctx.setupPct}%).</p>`;
        return;
      }
      if (act === 'saleok') {
        const q = k => sub.querySelector('[data-f="' + k + '"]');
        if (!(+q('p').value > 0)) return u.toast('Escribe el precio de venta.', 'err');
        SM.journal.addSale(id, { units: +q('u').value, unitPrice: +q('p').value, mode: q('m').value, date: parseDate(q('d').value) }, { taxPct: ctx.taxPct, setupPct: ctx.setupPct });
        u.toast('Venta registrada'); journal.render(); return;
      }
      if (act === 'sales') {
        sub.hidden = false;
        sub.innerHTML = b.sales.length ? '<div class="tablewrap"><table><thead><tr><th>Fecha</th><th class="n">Unidades</th><th class="n">Precio</th><th>Tipo</th><th class="n">Neto</th><th></th></tr></thead><tbody>' +
          b.sales.map(x => `<tr><td>${new Date(x.date).toLocaleDateString('es-CL')}</td><td class="n">${x.units}</td><td class="n">${u.fmt(x.unitPrice)}</td><td>${x.mode === 'order' ? 'Orden de venta' : 'Inmediata'}</td><td class="n">${u.fmt(x.net)}</td><td><button class="btn ghost" data-act="delsale" data-s="${u.esc(x.id)}">Quitar</button></td></tr>`).join('') + '</tbody></table></div>'
          : '<p class="muted small">Sin ventas registradas.</p>';
        return;
      }
      if (act === 'delsale') { SM.journal.removeSale(id, btn.dataset.s); journal.render(); return; }
      if (act === 'share') {
        sub.hidden = false; sub.innerHTML = '<p class="muted">Consultando ventas del mercado en AODP…</p>';
        SM.api.getHistory([b.item_id], [b.location], [1], 24).then(h => {
          const r = SM.journal.realShare(b, h.rows.find(x => x.location === b.location) || h.rows[0]);
          if (!r) { sub.innerHTML = '<p class="insufficient">No se puede calcular todavía: registra al menos una venta, y AODP debe tener ventas de este objeto en ese mercado en las mismas fechas.</p>'; return; }
          const pct = Math.min(100, r.share * 100);
          sub.innerHTML = `<p>Vendiste <b>${u.fmt(r.mine)}</b> de <b>${u.fmt(r.market)}</b> unidades que AODP registró en ${u.esc(locLabel(b.location))} en esas fechas: tu parte real fue de <b class="pos">${pct.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%</b>.</p>
            <p class="hint">AODP no registra todas las ventas del juego, así que este número puede salir algo alto. Con varios lotes se vuelve más confiable.</p>
            <div class="btns"><button class="btn primary" data-act="useshare" data-v="${Math.max(1, Math.round(pct))}">Usar ${Math.max(1, Math.round(pct))}% en «Cantidad óptima»</button></div>`;
        }).catch(e => { sub.innerHTML = '<p class="insufficient">⚠ ' + u.esc(e.message) + '</p>'; });
        return;
      }
      if (act === 'useshare') { const F = SM.storage.prefs(); F.demand = Object.assign({ days: 3, sharePct: 30, confidencePct: 80, salvagePct: 50 }, F.demand || {}, { sharePct: +btn.dataset.v }); SM.storage.savePrefs(F); u.toast('Tu parte del mercado quedó en ' + btn.dataset.v + '%'); }
    });
  };

  SM.views = SM.views || {};
  Object.assign(SM.views, { refine, flip, journal });
})(typeof window !== 'undefined' ? window : globalThis);
