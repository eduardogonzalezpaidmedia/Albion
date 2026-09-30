/* Silver Master — vistas Route Analyzer e Historial. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const U = () => SM.ui;
  const locLabel = l => l === 'Black Market' ? 'Mercado Negro' : l;

  /* ---------- Rutas ---------- */
  const routes = { item: null, idx: null };
  routes.init = function () {
    const u = U();
    routes.picker = u.itemPicker(u.$('#routePicker'), it => routes.open(it));
    const P = SM.storage.profile(), F = SM.storage.prefs(), m = F.minutes;
    const cities = SM.data.cities.filter(c => c.type !== 'black_market').map(c => c.id);
    u.$('#routeForm').innerHTML = `<div class="fields">
      <label class="field"><span class="lbl">Cantidad</span><input id="rUnits" type="number" min="1" value="10"></label>
      <label class="field"><span class="lbl">1 · Comprar materiales en</span><select id="rBuy"><option value="cheapest">La ciudad más barata (por material)</option>${u.options(SM.crafting.buyLocations())}</select></label>
      <label class="field"><span class="lbl">Transporte 1 (plata)</span><input id="rT1" type="number" min="0" value="0"></label>
      <label class="field"><span class="lbl">2 · Fabricar en</span><select id="rCraft">${u.options(cities, P.city)}</select></label>
      <label class="field"><span class="lbl">Tarifa de fabricación (total)</span><input id="rFee" type="number" min="0" value="0"></label>
      <label class="field"><span class="lbl">Transporte 2 (plata)</span><input id="rT2" type="number" min="0" value="0"></label>
      <label class="field"><span class="lbl">3 · Vender en</span><select id="rSell">${u.options(SM.crafting.marketLocations().map(l => ({ value: l, label: locLabel(l) })), 'Black Market')}</select></label>
      <label class="field"><span class="lbl">Tipo de venta</span><select id="rMode"><option value="instant">Venta inmediata</option><option value="order">Orden de venta</option></select></label>
      <label class="field"><span class="lbl">Foco</span><span class="check"><input id="rFocus" type="checkbox"${P.focus ? ' checked' : ''}> Usar foco</span></label>
      <label class="field"><span class="lbl">Min. compra</span><input id="rMb" type="number" min="0" value="${m.buy}"></label>
      <label class="field"><span class="lbl">Min. transporte 1</span><input id="rM1" type="number" min="0" value="${m.transport1}"></label>
      <label class="field"><span class="lbl">Min. fabricación</span><input id="rMc" type="number" min="0" value="${m.craft}"></label>
      <label class="field"><span class="lbl">Min. transporte 2</span><input id="rM2" type="number" min="0" value="${m.transport2}"></label>
      <label class="field"><span class="lbl">Min. venta</span><input id="rMs" type="number" min="0" value="${m.sell}"></label>
    </div>
    <p class="hint">Peso, montura, distancia y número de viajes quedan para una próxima versión; por ahora el transporte se ingresa en plata.</p>`;
    u.$$('#routeForm input, #routeForm select').forEach(el => el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => routes.render()));
  };
  routes.route = function () {
    const u = U(), v = id => u.$('#' + id).value;
    return {
      buyFrom: v('rBuy'), craftCity: v('rCraft'), sellMarket: v('rSell'), saleMode: v('rMode'),
      transport1: +v('rT1') || 0, transport2: +v('rT2') || 0,
      minutes: { buy: +v('rMb') || 0, transport1: +v('rM1') || 0, craft: +v('rMc') || 0, transport2: +v('rM2') || 0, sell: +v('rMs') || 0 }
    };
  };
  routes.base = function () { const u = U(); return { units: Math.max(1, +u.$('#rUnits').value || 1), focus: u.$('#rFocus').checked, fee: { value: +u.$('#rFee').value || 0, mode: 'total' }, manualPrices: SM.storage.manualPrices(), maxAgeH: null }; };
  routes.open = async function (it) {
    const u = U(); routes.item = it; routes.picker.set(it); SM.app.go('routes', true);
    u.$('#routeBody').innerHTML = '<section class="panel"><p class="muted">Consultando precios en todas las ciudades…</p></section>';
    try { const r = await SM.routes.loadPrices(it, 1); routes.idx = r.idx; SM.app.setStale(r.stale); routes.render(); }
    catch (e) { u.$('#routeBody').innerHTML = `<section class="panel"><p class="insufficient">⚠ No se pudo actualizar el mercado: ${u.esc(e.message)}</p></section>`; }
  };
  routes.render = function () {
    const u = U(); if (!routes.item || !routes.idx) return;
    const route = routes.route(), base = routes.base();
    const e = SM.routes.analyze(routes.item, routes.idx, route, base), c = e.calc;
    const matCities = [...new Set(Object.values(e.buys).map(b => b && b.location).filter(Boolean))];
    u.$('#routeBody').innerHTML = `
      <section class="panel"><div class="ph"><h2>Ruta seleccionada</h2><button class="btn" id="rLog">Detalle del cálculo</button></div>
        <div class="flow"><span class="st">Comprar · ${u.esc(matCities.join(', ') || 'Sin datos')}</span><span class="ar">→</span><span class="st">Transporte 1 · ${u.fmt(route.transport1)}</span><span class="ar">→</span><span class="st">Fabricar · ${u.esc(route.craftCity)} (${u.pct(e.rr.rate * 100)})</span><span class="ar">→</span><span class="st">Transporte 2 · ${u.fmt(route.transport2)}</span><span class="ar">→</span><span class="st">Vender · ${u.esc(locLabel(route.sellMarket))}</span></div>
        ${c.ok ? '' : `<p class="insufficient">DATOS INSUFICIENTES — ${u.esc(c.reasons.join(' · '))}</p>`}
        <div class="tablewrap"><table class="log">
          <tr><td>Costo materiales</td><td class="n">${u.fmt(c.materialCost)}</td></tr>
          <tr><td>+ Transporte 1</td><td class="n">${u.fmt(route.transport1)}</td></tr>
          <tr><td>+ Fabricación</td><td class="n">${u.fmt(c.craftingFee)}</td></tr>
          <tr><td>+ Transporte 2</td><td class="n">${u.fmt(route.transport2)}</td></tr>
          <tr><td><b>= Costo total</b></td><td class="n"><b>${u.fmt(c.totalCost)}</b></td></tr>
          <tr><td>Venta bruta</td><td class="n">${u.fmt(c.sale ? c.sale.gross : null)}</td></tr>
          <tr><td>− Impuestos y publicación</td><td class="n">${c.sale ? u.fmt(c.sale.tax + c.sale.setup) : 'Sin datos'}</td></tr>
          <tr><td><b>Profit</b></td><td class="n"><b class="${u.signCls(c.profit)}">${u.fmt(c.profit)}</b></td></tr>
          <tr><td>ROI</td><td class="n">${u.pct(c.roi)}</td></tr>
          <tr><td>Silver/hora (${c.minutes} min)</td><td class="n">${u.fmt(c.silverPerHour)}</td></tr>
        </table></div></section>
      <section class="panel"><div class="ph"><h2>Comparar todas las rutas</h2><span class="muted small">Mismos materiales y transportes; cambia dónde fabricas, dónde y cómo vendes.</span></div><div id="rAll"></div></section>`;
    u.$('#rLog').onclick = () => u.modal('Detalle del cálculo', u.calcLog(e));
    const all = SM.routes.compareAll(routes.item, routes.idx, base, route).filter(x => x.calc.ok);
    u.table(u.$('#rAll'), all, [
      { key: 'craft', label: 'Fabricar en', get: x => x.route.craftCity, html: x => `${u.esc(x.route.craftCity)}${x.rr.bonusKind ? ' <span class="small pos">bono</span>' : ''}` },
      { key: 'sell', label: 'Vender en', get: x => x.route.sellMarket, html: x => u.esc(locLabel(x.route.sellMarket)) },
      { key: 'mode', label: 'Tipo', get: x => x.route.saleMode, html: x => x.route.saleMode === 'order' ? 'Orden de venta' : 'Inmediata' },
      { key: 'price', label: 'Precio', num: true, get: x => x.sale.price, html: x => `<span class="silver">${u.fmt(x.sale.price)}</span>` },
      { key: 'rr', label: 'Retorno', num: true, get: x => x.rr.rate, html: x => u.pct(x.rr.rate * 100) },
      { key: 'profit', label: 'Profit', num: true, get: x => x.calc.profit, html: x => `<span class="${u.signCls(x.calc.profit)}">${u.fmt(x.calc.profit)}</span>` },
      { key: 'roi', label: 'ROI', num: true, get: x => x.calc.roi, html: x => u.pct(x.calc.roi) },
      { key: 'sph', label: 'Silver/h', num: true, get: x => x.calc.silverPerHour, html: x => u.fmt(x.calc.silverPerHour) },
      { key: 'age', label: 'Antigüedad', get: x => x.oldestMinutes, html: x => u.ageBadgeMin(x.oldestMinutes) }
    ], { sortKey: 'profit', empty: 'No hay rutas con datos completos para este objeto.', onRow: x => { u.$('#rCraft').value = x.route.craftCity; u.$('#rSell').value = x.route.sellMarket; u.$('#rMode').value = x.route.saleMode; routes.render(); u.$('#routeBody').scrollIntoView({ behavior: 'smooth' }); } });
  };

  /* ---------- Historial ---------- */
  const history = { item: null, range: '7d' };
  history.init = function () {
    const u = U();
    history.picker = u.itemPicker(u.$('#histPicker'), it => { history.item = it; history.run(); });
    u.$('#histLoc').innerHTML = u.options(SM.crafting.marketLocations().map(l => ({ value: l, label: locLabel(l) })), SM.storage.profile().city);
    u.$('#histQ').innerHTML = u.options(SM.crafting.QUALITIES.map(q => ({ value: q.q, label: q.label })), 1);
    u.$('#histLoc').onchange = u.$('#histQ').onchange = () => history.run();
    u.$('#histRange').onclick = e => { const b = e.target.closest('button'); if (!b) return; history.range = b.dataset.r; u.$$('#histRange button').forEach(x => x.setAttribute('aria-pressed', x === b)); history.run(); };
  };
  history.open = function (it, loc) { const u = U(); history.item = it; history.picker.set(it); if (loc) u.$('#histLoc').value = loc; SM.app.go('history', true); history.run(); };
  history.run = async function () {
    const u = U(), it = history.item; if (!it) return;
    const loc = u.$('#histLoc').value, q = it.quality_supported ? +u.$('#histQ').value : 1;
    u.$('#histBody').innerHTML = '<section class="panel"><p class="muted">Consultando historial…</p></section>';
    try {
      const [h, now] = await Promise.all([SM.history.load(it.item_id, loc, q, history.range), SM.api.getPrices([it.item_id], [loc], [q])]);
      const s = SM.history.stats(h.points);
      const r = now.rows[0];
      const sell = SM.market.sellOrder(r), buy = SM.market.buyOrder(r);
      SM.app.setStale(h.stale || now.stale);
      u.$('#histBody').innerHTML = `<section class="panel">
        <div class="ph"><h2>${u.esc(it.name)} <span class="tag">T${it.tier}.${it.enchantment}</span> · ${u.esc(locLabel(loc))}</h2><span class="muted small">${h.points.length} puntos ${history.range === '24h' ? 'por hora' : 'por día'}${h.points.length && !h.covers ? ' · AODP no tiene datos para todo el rango' : ''}</span></div>
        <div class="kpis">
          <div class="kpi"><span class="lbl">Orden de venta actual</span><b>${u.fmt(sell ? sell.price : null)}</b><span class="s">${sell ? u.ageBadge(sell.date) : ''}</span></div>
          <div class="kpi"><span class="lbl">Orden de compra actual</span><b>${u.fmt(buy ? buy.price : null)}</b><span class="s">${buy ? u.ageBadge(buy.date) : ''}</span></div>
          <div class="kpi"><span class="lbl">Mínimo</span><b>${u.fmt(s && s.min)}</b><span class="s">precio promedio del período</span></div>
          <div class="kpi"><span class="lbl">Máximo</span><b>${u.fmt(s && s.max)}</b><span class="s">precio promedio del período</span></div>
          <div class="kpi"><span class="lbl">Promedio</span><b>${u.fmt(s && s.avg)}</b><span class="s">ponderado por volumen · ${s ? s.volume.toLocaleString('es-CL') : 0} vendidos</span></div>
          <div class="kpi"><span class="lbl">Última actualización</span><b style="font-size:15px">${s ? u.esc(new Date(s.lastDate + 'Z').toLocaleString('es-CL')) : 'Sin datos'}</b><span class="s">último punto del historial</span></div>
        </div>
        ${SM.history.chart(h.points, u.fmt)}</section>`;
    } catch (e) { u.$('#histBody').innerHTML = `<section class="panel"><p class="insufficient">⚠ No se pudo consultar el historial: ${u.esc(e.message)}</p></section>`; }
  };

  SM.views = SM.views || {};
  Object.assign(SM.views, { routes, history });
})(typeof window !== 'undefined' ? window : globalThis);
