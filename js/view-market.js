/* Silver Master — vistas Market Scanner, Black Market, Mercado global y Silver Opportunity Finder. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const U = () => SM.ui;
  const TIERS = [2, 3, 4, 5, 6, 7, 8].map(t => ({ value: t, label: 'T' + t }));
  const ENCH = [0, 1, 2, 3, 4].map(e => ({ value: e, label: '.' + e }));
  const locLabel = l => l === 'Black Market' ? 'Mercado Negro' : l;

  /* ---------- Filtros compartidos ---------- */
  function filterForm(host, prefix, defaults) {
    const u = U(), P = SM.storage.profile();
    const cities = SM.data.cities.filter(c => c.type !== 'black_market').map(c => c.id);
    host.innerHTML = `
      <div class="fields">
        <div class="field" style="grid-column:1/-1"><span class="lbl">Categorías</span><div class="chips" id="${prefix}Cats"></div></div>
        <label class="field"><span class="lbl">Tier mínimo</span><select id="${prefix}TMin">${u.options(TIERS, defaults.tierMin || 4)}</select></label>
        <label class="field"><span class="lbl">Tier máximo</span><select id="${prefix}TMax">${u.options(TIERS, defaults.tierMax || 8)}</select></label>
        <div class="field"><span class="lbl">Encantamiento</span><div class="chips" id="${prefix}Ench"></div></div>
        <label class="field"><span class="lbl">Fabricas en</span><select id="${prefix}City">${u.options(cities, P.city)}</select></label>
        <div class="field" style="grid-column:1/-1"><span class="lbl">Comprar materiales en</span><div class="chips" id="${prefix}Buy"></div></div>
        ${defaults.noSell ? '' : `<div class="field" style="grid-column:1/-1"><span class="lbl">Mercados de venta</span><div class="chips" id="${prefix}Sell"></div></div>
        <label class="field"><span class="lbl">Tipo de venta</span><select id="${prefix}Mode"><option value="instant">Venta inmediata (orden de compra)</option><option value="order">Publicar orden de venta</option></select></label>`}
        <label class="field"><span class="lbl">Cantidad</span><select id="${prefix}QMode"><option value="fixed">Cantidad fija</option><option value="capital">Lo que alcance mi capital</option></select></label>
        <label class="field"><span class="lbl">Cantidad fija</span><input id="${prefix}Units" type="number" min="1" value="${defaults.units || 10}"></label>
        <label class="field"><span class="lbl">Capital disponible</span><input id="${prefix}Cap" type="number" min="0" step="100000" value="${P.capital}"></label>
        <label class="field"><span class="lbl">ROI mínimo (%)</span><input id="${prefix}Roi" type="number" step="1" value="${defaults.minRoi ?? 10}"></label>
        <label class="field"><span class="lbl">Profit mínimo (lote)</span><input id="${prefix}Profit" type="number" step="1000" value="${defaults.minProfit ?? 50000}"></label>
        <label class="field"><span class="lbl">Precios de máximo (horas)</span><input id="${prefix}Age" type="number" min="1" value="${SM.storage.prefs().maxAgeHours || 12}"></label>
        <label class="field"><span class="lbl">Tiempo máximo del ciclo (min)</span><input id="${prefix}Time" type="number" min="0" placeholder="Sin límite"></label>
        <label class="field"><span class="lbl">Premium</span><select id="${prefix}Prem"><option value="0"${P.premium ? '' : ' selected'}>No</option><option value="1"${P.premium ? ' selected' : ''}>Sí</option></select></label>
        <label class="field"><span class="lbl">Foco</span><select id="${prefix}Focus"><option value="0"${P.focus ? '' : ' selected'}>No</option><option value="1"${P.focus ? ' selected' : ''}>Sí</option></select></label>
        <label class="field"><span class="lbl">Solo favoritos</span><span class="check"><input id="${prefix}Fav" type="checkbox"> Escanear solo ⭐</span></label>
      </div>`;
    const cats = u.chips(u.$('#' + prefix + 'Cats'), u.catOptions(), defaults.categories || ['weapons', 'armor', 'head', 'shoes']);
    const ench = u.chips(u.$('#' + prefix + 'Ench'), ENCH, defaults.enchants || [0, 1, 2, 3]);
    const buy = u.chips(u.$('#' + prefix + 'Buy'), SM.crafting.buyLocations().map(l => ({ value: l, label: l })), SM.crafting.buyLocations().filter(l => l !== 'Brecilien'));
    const sell = defaults.noSell ? null : u.chips(u.$('#' + prefix + 'Sell'), SM.crafting.marketLocations().map(l => ({ value: l, label: locLabel(l) })), defaults.sellMarkets || SM.crafting.marketLocations());
    return () => {
      const v = id => u.$('#' + prefix + id);
      const qm = v('QMode').value;
      return {
        categories: cats.values(), enchants: ench.values(), tierMin: +v('TMin').value, tierMax: +v('TMax').value,
        craftCity: v('City').value, buyLocations: buy.values(),
        sellMarkets: sell ? sell.values() : defaults.sellMarkets, saleMode: sell ? v('Mode').value : 'instant',
        quantityMode: qm, units: +v('Units').value || 10, maxCapital: qm === 'capital' ? null : null,
        minRoi: v('Roi').value === '' ? null : +v('Roi').value, minProfit: +v('Profit').value || 0,
        maxAgeH: +v('Age').value || 12, maxMinutes: v('Time').value === '' ? null : +v('Time').value,
        premium: v('Prem').value === '1', focus: v('Focus').value === '1', onlyFavorites: v('Fav').checked,
        capitalOverride: +v('Cap').value || 0
      };
    };
  }

  function progress(bar, msg) {
    return (step, d, t) => { U().$(bar).style.width = Math.round(d / t * 100) + '%'; U().$(msg).textContent = step + '… ' + d + ' de ' + t; U().$(msg).className = 'msg'; };
  }

  async function runScan(f, bar, msg, btn) {
    const u = U();
    if (!f.buyLocations.length) { u.$(msg).textContent = 'Elige al menos una ciudad para comprar materiales.'; u.$(msg).className = 'msg err'; return null; }
    if (f.sellMarkets && !f.sellMarkets.length) { u.$(msg).textContent = 'Elige al menos un mercado de venta.'; u.$(msg).className = 'msg err'; return null; }
    // el capital del filtro reemplaza al del perfil solo para este escaneo
    const P = SM.storage.profile(); const saved = P.capital;
    if (f.capitalOverride) { P.capital = f.capitalOverride; SM.storage.saveProfile(P); }
    u.$(btn).disabled = true; SM.app.busy(true);
    try {
      const res = await SM.scanner.scan(f, progress(bar, msg));
      if (f.maxMinutes) res.rows = res.rows.filter(e => (e.calc.minutes || 0) <= f.maxMinutes);
      if (f.quantityMode !== 'capital' && f.capitalOverride) res.rows = res.rows.filter(e => e.calc.totalCost <= f.capitalOverride);
      u.$(bar).style.width = '100%';
      u.$(msg).textContent = res.message || `Revisé ${res.scanned.toLocaleString('es-CL')} objetos: ${res.rows.length} cumplen tus filtros; ${res.invalid.toLocaleString('es-CL')} con DATOS INSUFICIENTES (sin receta, sin precios recientes o sin precio de venta).`;
      SM.app.setStale(res.stale || (res.errors || []).length);
      SM.app.showAlerts(SM.alerts.check(res.rows, res.idx));
      return res;
    } catch (e) {
      u.$(msg).textContent = '⚠ No se pudo actualizar el mercado: ' + e.message; u.$(msg).className = 'msg err'; return null;
    } finally {
      if (f.capitalOverride) { const p2 = SM.storage.profile(); p2.capital = saved; SM.storage.saveProfile(p2); }
      u.$(btn).disabled = false; SM.app.busy(false);
    }
  }

  function scanCols(extra) {
    const u = U();
    return [
      { key: 'item', label: 'Objeto', get: e => e.item.name, html: e => `${u.esc(e.item.name)} <span class="tag">T${e.item.tier}.${e.item.enchantment}</span>${e.cappedByLiquidity ? ' <span class="small muted">limitado por liquidez</span>' : ''}` },
      { key: 'buy', label: 'Compra', get: e => Object.values(e.buys).map(b => b && b.location).filter((v, i, a) => a.indexOf(v) === i).join(', '), html: e => u.esc([...new Set(Object.values(e.buys).map(b => b && b.location))].join(', ')) },
      { key: 'craft', label: 'Fabricación', get: e => e.rr.rate, html: e => `${u.esc(e.context ? e.context.craftCity : '')} · ${u.pct(e.rr.rate * 100)}${e.rr.bonusKind ? ' · bono' : ''}${e.calc.focusUsed ? ' · foco' : ''}` },
      { key: 'sale', label: 'Venta', get: e => e.sale.price, html: e => `${u.esc(locLabel(e.sale.location))} <span class="silver">${u.fmt(e.sale.price)}</span>` },
      { key: 'units', label: 'Cant.', num: true, get: e => e.calc.made },
      { key: 'capital', label: 'Capital', num: true, get: e => e.calc.totalCost, html: e => u.fmt(e.calc.totalCost) },
      { key: 'profit', label: 'Profit', num: true, get: e => e.calc.profit, html: e => `<span class="${u.signCls(e.calc.profit)}">${u.fmt(e.calc.profit)}</span>` },
      { key: 'roi', label: 'ROI', num: true, get: e => e.calc.roi, html: e => u.pct(e.calc.roi) },
      { key: 'sph', label: 'Silver/h', num: true, get: e => e.calc.silverPerHour, html: e => u.fmt(e.calc.silverPerHour) },
      { key: 'liq', label: 'Liquidez /día', num: true, get: e => e.liquidity ?? null, html: e => e.liquidity === undefined || e.liquidity === null ? '<span class="muted">—</span>' : e.liquidity.toLocaleString('es-CL', { maximumFractionDigits: 1 }) },
      { key: 'age', label: 'Antigüedad', get: e => e.oldestMinutes, html: e => u.ageBadgeMin(e.oldestMinutes) },
      { key: 'conf', label: 'Confianza', get: e => ({ Alta: 3, Media: 2, Baja: 1 })[e.confidence] || 0, html: e => u.confBadge(e.confidence) }
    ].concat(extra || []);
  }
  const csvCols = [
    { label: 'Objeto', get: e => e.item.name }, { label: 'ID', get: e => e.item.item_id }, { label: 'Tier', get: e => e.item.tier }, { label: 'Encantamiento', get: e => e.item.enchantment },
    { label: 'Cantidad', get: e => e.calc.made }, { label: 'Retorno %', get: e => (e.rr.rate * 100).toFixed(2) }, { label: 'Mercado venta', get: e => e.sale.location },
    { label: 'Precio venta', get: e => e.sale.price }, { label: 'Costo total', get: e => Math.round(e.calc.totalCost) }, { label: 'Ingreso neto', get: e => Math.round(e.calc.sale.net) },
    { label: 'Profit', get: e => Math.round(e.calc.profit) }, { label: 'ROI %', get: e => e.calc.roi.toFixed(2) }, { label: 'Silver/h', get: e => e.calc.silverPerHour ? Math.round(e.calc.silverPerHour) : '' },
    { label: 'Liquidez/día', get: e => e.liquidity ?? '' }, { label: 'Antigüedad min', get: e => e.oldestMinutes === null ? '' : Math.round(e.oldestMinutes) }, { label: 'Confianza', get: e => e.confidence }
  ];
  const openInCalc = e => SM.views.calc.open(e.item, true, { units: e.calc.units, craftCity: e.context ? e.context.craftCity : undefined, sellMarket: e.sale.location, saleMode: e.calc.sale && e.calc.sale.mode, quality: 1 });

  /* ---------- Market Scanner ---------- */
  const scanner = { res: null };
  scanner.init = function () {
    const u = U();
    scanner.get = filterForm(u.$('#scanFilters'), 'sc', { categories: ['weapons', 'armor', 'head', 'shoes'] });
    u.$('#scanGo').onclick = async () => {
      const f = scanner.get();
      const res = await runScan(f, '#scanBar', '#scanMsg', '#scanGo'); if (!res) return;
      res.rows.forEach(e => e.context = { craftCity: f.craftCity });
      scanner.res = res; u.$('#scanRes').hidden = false;
      u.table(u.$('#scanTable'), res.rows, scanCols(), { sortKey: 'profit', onRow: openInCalc, empty: 'Ninguna oportunidad cumple tus filtros. Prueba bajar el ROI o el profit mínimo.' });
    };
    u.$('#scanCsv').onclick = () => scanner.res && SM.export.csv('silver-master-scanner.csv', scanner.res.rows, csvCols);
    u.$('#scanJson').onclick = () => scanner.res && SM.export.json('silver-master-scanner.json', scanner.res.rows.map(e => ({ item: e.item.item_id, name: e.item.name, calc: e.calc, sale: e.sale, buys: e.buys, returnRate: e.rr, liquidity: e.liquidity, confidence: e.confidence })));
  };

  /* ---------- Black Market ---------- */
  const bm = { res: null };
  bm.init = function () {
    const u = U();
    bm.get = filterForm(u.$('#bmFilters'), 'bm', { categories: ['weapons', 'armor', 'head', 'shoes', 'offhands', 'capes', 'bags'], sellMarkets: ['Black Market'], noSell: true, minRoi: 5, minProfit: 10000 });
    u.$('#bmGo').onclick = async () => {
      const f = Object.assign(bm.get(), { sellMarkets: ['Black Market'], saleMode: 'instant' });
      const res = await runScan(f, '#bmBar', '#bmMsg', '#bmGo'); if (!res) return;
      res.rows.forEach(e => e.context = { craftCity: f.craftCity });
      bm.res = res; u.$('#bmRes').hidden = false;
      u.table(u.$('#bmTable'), res.rows, [
        { key: 'item', label: 'Objeto', get: e => e.item.name, html: e => u.esc(e.item.name) },
        { key: 'tier', label: 'Tier', num: true, get: e => e.item.tier },
        { key: 'ench', label: 'Enchant', num: true, get: e => e.item.enchantment },
        { key: 'units', label: 'Cantidad', num: true, get: e => e.calc.made },
        { key: 'cost', label: 'Costo fabricación', num: true, get: e => e.calc.materialCost + e.calc.craftingFee, html: e => u.fmt(e.calc.materialCost + e.calc.craftingFee) },
        { key: 'tr', label: 'Transporte', num: true, get: e => e.calc.transport, html: e => u.fmt(e.calc.transport) },
        { key: 'bm', label: 'Precio MN', num: true, get: e => e.sale.price, html: e => `<span class="silver">${u.fmt(e.sale.price)}</span><br>${u.ageBadge(e.sale.date)}` },
        { key: 'profit', label: 'Profit', num: true, get: e => e.calc.profit, html: e => `<span class="${u.signCls(e.calc.profit)}">${u.fmt(e.calc.profit)}</span>` },
        { key: 'roi', label: 'ROI', num: true, get: e => e.calc.roi, html: e => u.pct(e.calc.roi) },
        { key: 'liq', label: 'Vend./día MN', num: true, get: e => e.liquidity ?? null, html: e => e.liquidity === undefined || e.liquidity === null ? '—' : e.liquidity.toLocaleString('es-CL', { maximumFractionDigits: 1 }) },
        { key: 'conf', label: 'Confianza', get: e => e.confidence, html: e => u.confBadge(e.confidence) },
        { key: 'hist', label: 'Historial', sortable: false, get: () => '', html: () => '<button class="btn ghost" data-h="1">Ver</button>' }
      ], { sortKey: 'profit', onRow: openInCalc, empty: 'Ninguna oportunidad en el Mercado Negro con estos filtros.' });
      u.$$('#bmTable [data-h]').forEach(b => b.onclick = ev => { const tr = ev.target.closest('tr'); const e = res.rows[+tr.dataset.i]; SM.views.history.open(e.item, 'Black Market'); });
    };
    u.$('#bmCsv').onclick = () => bm.res && SM.export.csv('silver-master-black-market.csv', bm.res.rows, csvCols);
    u.$('#bmJson').onclick = () => bm.res && SM.export.json('silver-master-black-market.json', bm.res.rows.map(e => ({ item: e.item.item_id, calc: e.calc, sale: e.sale })));
  };

  /* ---------- Mercado global ---------- */
  const global = { item: null };
  global.init = function () {
    const u = U();
    global.picker = u.itemPicker(u.$('#globalPicker'), it => { global.item = it; global.run(); });
    u.$('#globalQ').innerHTML = u.options(SM.crafting.QUALITIES.map(q => ({ value: q.q, label: q.label })), 1);
    u.$('#globalGo').onclick = () => global.run(true);
    u.$('#globalQ').onchange = () => global.run();
    u.$('#globalQty').oninput = () => global.item && global.render();
  };
  global.open = function (it) { global.item = it; global.picker.set(it); SM.app.go('global', true); global.run(); };
  global.run = async function (force) {
    const u = U(), it = global.item; if (!it) return;
    u.$('#globalBody').innerHTML = '<section class="panel"><p class="muted">Consultando AODP…</p></section>';
    const q = it.quality_supported ? +u.$('#globalQ').value : 1;
    const r = SM.crafting.recipe(it.item_id);
    try {
      const p1 = await SM.api.getPrices([it.item_id], SM.crafting.marketLocations(), [q], { force });
      const p2 = r ? await SM.api.getPrices(r.materials.map(m => m.item_id), SM.crafting.buyLocations(), [1], { force }) : { rows: [] };
      global.idx = SM.market.index(p1.rows); SM.market.index(p2.rows, global.idx);
      global.q = q; global.valid = SM.market.locationsWithData(p1.rows.concat(p2.rows));
      SM.app.setStale(p1.stale || p2.stale);
      global.render();
    } catch (e) { u.$('#globalBody').innerHTML = `<section class="panel"><p class="insufficient">⚠ No se pudo actualizar el mercado: ${u.esc(e.message)}</p></section>`; }
  };
  global.render = function () {
    const u = U(), it = global.item, idx = global.idx, q = global.q;
    const locs = SM.crafting.marketLocations();
    const rows = SM.market.byLocation(idx, it.item_id, locs, q);
    const bestBuy = rows.filter(x => x.sell && x.location !== 'Black Market').sort((a, b) => a.sell.price - b.sell.price)[0];
    const bestSell = rows.filter(x => x.buy).sort((a, b) => b.buy.price - a.buy.price)[0];
    const r = SM.crafting.recipe(it.item_id), qty = Math.max(1, +u.$('#globalQty').value || 1);
    const crafts = r ? Math.ceil(qty / r.quantity_produced) : 0;
    const buyLocs = SM.crafting.buyLocations();
    u.$('#globalBody').innerHTML = `
      <section class="panel"><div class="ph"><h2>${u.esc(it.name)} <span class="tag">T${it.tier}.${it.enchantment}</span></h2><button class="btn ghost" id="gCalc">Abrir en calculadora</button></div>
        <div class="tablewrap"><table class="grid-table"><thead><tr><th>Mercado</th><th class="n">Orden de compra</th><th>Actualizado</th><th class="n">Orden de venta</th><th>Actualizado</th><th>Datos en AODP</th></tr></thead>
        <tbody>${rows.map(x => `<tr class="${bestSell && x === bestSell ? 'best' : ''}"><td><b>${u.esc(locLabel(x.location))}</b>${bestSell && x === bestSell ? ' <span class="small pos">mejor para vender ya</span>' : ''}${bestBuy && x === bestBuy ? ' <span class="small pos">más barato para comprar</span>' : ''}</td>
          <td class="n silver">${x.buy ? u.fmt(x.buy.price) : '<span class="muted">Sin datos</span>'}</td><td>${x.buy ? u.ageBadge(x.buy.date) : ''}</td>
          <td class="n silver">${x.sell ? u.fmt(x.sell.price) : '<span class="muted">Sin datos</span>'}</td><td>${x.sell ? u.ageBadge(x.sell.date) : ''}</td>
          <td>${global.valid.has(x.location) ? '<span class="pos small">con datos</span>' : '<span class="muted small">sin datos para esta consulta</span>'}</td></tr>`).join('')}</tbody></table></div></section>
      ${r ? `<section class="panel"><div class="ph"><h2>Dónde comprar los materiales</h2><span class="muted small">Para ${qty} unidad(es) = ${crafts} crafteo(s), sin retorno. El más barato no siempre es el mejor si sumas transporte.</span></div>
        <div class="tablewrap"><table class="grid-table"><thead><tr><th>Material</th><th class="n">Cantidad</th>${buyLocs.map(l => `<th class="n">${u.esc(l)}</th>`).join('')}</tr></thead>
        <tbody>${r.materials.map(m => {
          const need = m.quantity * crafts;
          const ps = buyLocs.map(l => SM.market.sellOrder(SM.market.row(idx, m.item_id, l, 1)));
          const min = Math.min(...ps.filter(Boolean).map(p => p.price));
          return `<tr><td>${u.esc(SM.crafting.label(m.item_id))}</td><td class="n">${need.toLocaleString('es-CL')}</td>${ps.map(p => p ? `<td class="n${p.price === min ? ' pos' : ''}"><span>${u.fmt(p.price)}</span><br><span class="small">total ${u.fmt(p.price * need)}</span><br>${u.ageBadge(p.date)}</td>` : '<td class="n muted">Sin datos</td>').join('')}</tr>`;
        }).join('')}</tbody></table></div></section>` : ''}`;
    u.$('#gCalc').onclick = () => SM.views.calc.open(it, true);
  };

  /* ---------- Finder ---------- */
  const finder = { res: null };
  finder.init = function () {
    const u = U(), P = SM.storage.profile();
    const cities = SM.data.cities.filter(c => c.type !== 'black_market').map(c => c.id);
    u.$('#finderForm').innerHTML = `<div class="fields">
      <label class="field"><span class="lbl">Capital</span><input id="fCap" type="number" min="0" step="100000" value="${P.capital}"></label>
      <label class="field"><span class="lbl">Ciudad</span><select id="fCity">${u.options(cities, P.city)}</select></label>
      <label class="field"><span class="lbl">Tiempo (horas)</span><input id="fHours" type="number" min="0" step="0.5" value="${P.hours}"></label>
      <label class="field"><span class="lbl">Premium</span><select id="fPrem"><option value="0">No</option><option value="1"${P.premium ? ' selected' : ''}>Sí</option></select></label>
      <label class="field"><span class="lbl">Foco</span><select id="fFocus"><option value="0">No</option><option value="1"${P.focus ? ' selected' : ''}>Sí</option></select></label>
      <label class="field"><span class="lbl">Riesgo</span><select id="fRisk">${u.options(Object.entries(SM.finder.RISK).map(([k, v]) => ({ value: k, label: v.label })), P.risk)}</select><span class="hint" id="fRiskHint"></span></label>
      <label class="field"><span class="lbl">Tier mínimo</span><select id="fTMin">${u.options(TIERS, 4)}</select></label>
      <label class="field"><span class="lbl">Tier máximo</span><select id="fTMax">${u.options(TIERS, 6)}</select></label>
      <div class="field" style="grid-column:1/-1"><span class="lbl">Categorías</span><div class="chips" id="fCats"></div></div>
      <div class="field" style="grid-column:1/-1"><span class="lbl">Mercados</span><div class="chips" id="fMk"></div></div>
    </div>`;
    const cats = u.chips(u.$('#fCats'), u.catOptions(), ['weapons', 'armor', 'head', 'shoes', 'potions', 'refined']);
    const mk = u.chips(u.$('#fMk'), SM.crafting.marketLocations().map(l => ({ value: l, label: locLabel(l) })), SM.crafting.marketLocations());
    const hint = () => { const r = SM.finder.RISK[u.$('#fRisk').value]; u.$('#fRiskHint').textContent = `Precios de hasta ${r.maxAgeH} h · al menos ${r.minLiquidity} ventas/día · cantidad ≤ ${r.liquidityCapDays} día(s) de ventas × ${Math.round(r.marketShare * 100)}%. Reglas de la app, editables en js/finder.js.`; };
    u.$('#fRisk').onchange = hint; hint();
    u.$('#finderGo').onclick = async () => {
      const o = { capital: +u.$('#fCap').value || 0, city: u.$('#fCity').value, hours: +u.$('#fHours').value || 0, premium: u.$('#fPrem').value === '1', focus: u.$('#fFocus').value === '1', risk: u.$('#fRisk').value, tierMin: +u.$('#fTMin').value, tierMax: +u.$('#fTMax').value, categories: cats.values(), markets: mk.values() };
      if (!o.markets.length) { u.$('#finderMsg').textContent = 'Elige al menos un mercado.'; return; }
      const P2 = SM.storage.profile(), saved = P2.capital; P2.capital = o.capital; SM.storage.saveProfile(P2);
      u.$('#finderGo').disabled = true; SM.app.busy(true);
      try {
        const r = SM.finder.RISK[o.risk];
        const res = await SM.scanner.scan({ categories: o.categories, tierMin: o.tierMin, tierMax: o.tierMax, craftCity: o.city, sellMarkets: o.markets, saleMode: 'instant', premium: o.premium, focus: o.focus, maxAgeH: r.maxAgeH, quantityMode: 'capital', liquidityCapDays: r.liquidityCapDays, marketShare: r.marketShare, minLiquidity: r.minLiquidity, minRoi: r.minRoi, minProfit: 1, liquidityTop: 80 }, progress('#finderBar', '#finderMsg'));
        res.rows.forEach(e => { e.fits = !o.hours || !e.calc.minutes || e.calc.minutes <= o.hours * 60; e.context = { craftCity: o.city }; });
        finder.res = res; u.$('#finderRes').hidden = false; u.$('#finderBar').style.width = '100%';
        u.$('#finderMsg').textContent = `${res.rows.length} alternativas con tu capital y riesgo ${r.label.toLowerCase()} (de ${res.scanned} objetos revisados).`;
        SM.app.setStale(res.stale);
        u.table(u.$('#finderTable'), res.rows, [
          { key: 'item', label: 'Alternativa', get: e => e.item.name, html: e => `Fabricar ${e.calc.made} × ${u.esc(e.item.name)} <span class="tag">T${e.item.tier}.${e.item.enchantment}</span> y vender en ${u.esc(locLabel(e.sale.location))}` },
          { key: 'capital', label: 'Capital necesario', num: true, get: e => e.calc.totalCost, html: e => u.fmt(e.calc.totalCost) },
          { key: 'profit', label: 'Profit', num: true, get: e => e.calc.profit, html: e => `<span class="${u.signCls(e.calc.profit)}">${u.fmt(e.calc.profit)}</span>` },
          { key: 'roi', label: 'ROI', num: true, get: e => e.calc.roi, html: e => u.pct(e.calc.roi) },
          { key: 'sph', label: 'Silver/h', num: true, get: e => e.calc.silverPerHour, html: e => u.fmt(e.calc.silverPerHour) },
          { key: 'time', label: 'Tiempo', num: true, get: e => e.calc.minutes, html: e => (e.calc.minutes || 0) + ' min' + (e.fits ? '' : ' <span class="neg small">excede</span>') },
          { key: 'liq', label: 'Liquidez /día', num: true, get: e => e.liquidity ?? null, html: e => e.liquidity == null ? '—' : e.liquidity.toLocaleString('es-CL', { maximumFractionDigits: 1 }) },
          { key: 'age', label: 'Datos', get: e => e.oldestMinutes, html: e => u.ageBadgeMin(e.oldestMinutes) },
          { key: 'conf', label: 'Confianza', get: e => e.confidence, html: e => u.confBadge(e.confidence) }
        ], { sortKey: 'profit', onRow: openInCalc, empty: 'No hay alternativas con estos límites. Prueba otro riesgo, más tiers o más categorías.' });
      } catch (e) { u.$('#finderMsg').textContent = '⚠ ' + e.message; u.$('#finderMsg').className = 'msg err'; }
      finally { const p3 = SM.storage.profile(); p3.capital = saved; SM.storage.saveProfile(p3); u.$('#finderGo').disabled = false; SM.app.busy(false); }
    };
    u.$('#finderCsv').onclick = () => finder.res && SM.export.csv('silver-master-alternativas.csv', finder.res.rows, csvCols);
  };

  SM.views = SM.views || {};
  Object.assign(SM.views, { scanner, bm, global, finder });
})(typeof window !== 'undefined' ? window : globalThis);
