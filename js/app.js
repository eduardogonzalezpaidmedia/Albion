/* Silver Master — arranque, navegación, inicio y ajustes. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const u = () => SM.ui;
  let busyN = 0;
  const inited = {};

  function applyApiConfig() {
    const P = SM.storage.profile(), F = SM.storage.prefs(), S = SM.data.settings;
    const srv = S.servers[P.server] || S.servers.americas;
    SM.api.configure({ serverKey: P.server, host: srv.host, proxyUrl: F.proxyUrl || '', cacheMinutes: F.cacheMinutes ?? S.cache_minutes });
  }

  function go(view, noScroll) {
    const U = u();
    U.$$('.view').forEach(v => v.hidden = v.id !== 'view-' + view);
    U.$$('#tabs button').forEach(b => { if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (!inited[view]) {
      inited[view] = true;
      const map = { calc: SM.views.calc, scanner: SM.views.scanner, bm: SM.views.bm, global: SM.views.global, routes: SM.views.routes, history: SM.views.history, finder: SM.views.finder, refine: SM.views.refine, flip: SM.views.flip, journal: SM.views.journal, local: SM.views.local, intel: SM.views.intel, simple: SM.views.simple, artifacts: SM.views.artifacts, potions: SM.views.potions, craft: SM.views.craft };
      if (map[view]) map[view].init();
      if (view === 'settings') renderSettings();
    }
    if (view === 'home') renderHome();
    try { if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view); } catch (e) { }
    if (!noScroll) window.scrollTo({ top: 0 });
    const btn = U.$('#tabs button[data-view="' + view + '"]'); if (btn) btn.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function busy(on) {
    busyN = Math.max(0, busyN + (on ? 1 : -1));
    const pill = u().$('#apiPill'); pill.classList.toggle('busy', busyN > 0);
  }
  function setStale(on) { u().$('#staleBanner').hidden = !on; }
  function showAlerts(hits) {
    const b = u().$('#alertBanner');
    if (!hits || !hits.length) { b.hidden = true; return; }
    b.innerHTML = '🔔 <b>Oportunidad detectada</b> · ' + hits.slice(0, 6).map(h => u().esc(h.text)).join(' · ') + (hits.length > 6 ? ' · y ' + (hits.length - 6) + ' más' : '');
    b.hidden = false;
  }

  function renderStatus(st) {
    const U = u(), pill = U.$('#apiPill');
    pill.classList.toggle('ok', st.state === 'connected'); pill.classList.toggle('err', st.state === 'error');
    U.$('#apiTxt').textContent = st.state === 'connected' ? 'API ● Conectada' + (st.mode === 'proxy' ? ' (proxy)' : '') : st.state === 'error' ? 'API ● Sin conexión' : 'API · comprobando';
    pill.title = st.message || 'Albion Online Data Project';
  }

  function renderHome() {
    const U = u(), P = SM.storage.profile(), S = SM.data.settings;
    const ctx = SM.engine.context();
    U.$('#homeProfile').innerHTML = [
      ['Servidor', (S.servers[P.server] || {}).label], ['Ciudad base', P.city], ['Premium', P.premium ? 'Sí' : 'No'],
      ['Foco', P.focus ? 'Sí' : 'No'], ['Foco disponible', U.fmt(P.focusAvailable)], ['Impuesto de venta', ctx.taxPct + '%'],
      ['Capital', U.fmt(P.capital)], ['Tiempo', P.hours + ' h'], ['Riesgo', (SM.finder.RISK[P.risk] || {}).label]
    ].map(([k, v]) => `<dt>${k}</dt><dd>${U.esc(v)}</dd>`).join('');
    const favs = SM.storage.favorites().map(id => SM.crafting.item(id)).filter(Boolean);
    U.$('#homeFavs').innerHTML = favs.length ? '<div class="chips">' + favs.map(it => `<button class="chip" data-fav="${U.esc(it.item_id)}">⭐ ${U.esc(it.name)} ${it.tier}.${it.enchantment}</button>`).join('') + '</div>' : '<p class="muted small">Marca objetos con ★ en la calculadora para verlos aquí.</p>';
    U.$$('[data-fav]').forEach(b => b.onclick = () => SM.views.calc.open(SM.crafting.item(b.dataset.fav), true));
    const m = SM.data.meta;
    U.$('#homeData').innerHTML = `${m.items.toLocaleString('es-CL')} objetos y ${m.recipes.toLocaleString('es-CL')} recetas de <b>${U.esc(m.source)}</b>, generados el ${U.esc(m.generated)}. Precios: Albion Online Data Project (datos aportados por jugadores; pueden estar incompletos). Ninguna recomendación es una garantía.`;
  }

  async function refreshMarket() {
    const U = u();
    const favs = SM.storage.favorites();
    if (!favs.length && !SM.alerts.watchedItems().length) { U.toast('Agrega favoritos o alertas para actualizar el mercado.'); return; }
    const btn = U.$('#refreshMarket'); btn.disabled = true; busy(true);
    try {
      const res = favs.length ? await SM.scanner.scan({ itemIds: favs, tierMin: 2, tierMax: 8, units: 10, minProfit: -1e15 }) : { rows: [], idx: {} };
      const extra = SM.alerts.watchedItems();
      if (extra.length) {
        const p = await SM.api.getPrices(extra, SM.crafting.marketLocations(), [1], { force: true });
        SM.market.index(p.rows, res.idx || (res.idx = {}));
      }
      setStale(res.stale);
      const hits = SM.alerts.check(res.rows, res.idx);
      showAlerts(hits);
      U.$('#homeUpdated').innerHTML = 'Última actualización: ' + new Date().toLocaleTimeString('es-CL') + (res.rows.length ? ' · ' + res.rows.map(e => `${U.esc(e.item.name)} ${e.item.tier}.${e.item.enchantment}: <span class="${U.signCls(e.calc.profit)}">${U.fmt(e.calc.profit)}</span> (${U.pct(e.calc.roi)})`).join(' · ') : '');
      U.toast(hits.length ? '🔔 ' + hits.length + ' oportunidad(es) detectada(s)' : 'Mercado actualizado');
    } catch (e) { U.toast('⚠ No se pudo actualizar el mercado: ' + e.message, 'err'); setStale(true); }
    finally { btn.disabled = false; busy(false); }
  }

  /* ---------- Ajustes ---------- */
  function renderSettings() {
    const U = u(), P = SM.storage.profile(), F = SM.storage.prefs(), S = SM.data.settings;
    F.demand = Object.assign({ days: 3, sharePct: 30, confidencePct: 80, salvagePct: 50 }, F.demand || {}); F.minutes = Object.assign({ buy: 10, transport1: 10, craft: 5, transport2: 10, sell: 10 }, F.minutes || {});
    const cities = SM.data.cities.filter(c => c.type !== 'black_market').map(c => c.id);
    const src = (arr) => (arr || []).map(s => `<a href="${U.esc(s.url)}" target="_blank" rel="noopener">${U.esc(new URL(s.url).hostname)}</a> (${U.esc(s.date)})`).join(', ');
    const alerts = SM.storage.alerts();
    U.$('#settingsBody').innerHTML = `
    <section class="panel"><div class="ph"><h2>Perfil del jugador</h2><span class="muted small">Se guarda en este navegador.</span></div>
      <div class="fields">
        <label class="field"><span class="lbl">Servidor</span><select id="sServer">${U.options(Object.entries(S.servers).map(([k, v]) => ({ value: k, label: v.label })), P.server)}</select></label>
        <label class="field"><span class="lbl">Ciudad base</span><select id="sCity">${U.options(cities, P.city)}</select></label>
        <label class="field"><span class="lbl">Premium</span><select id="sPrem"><option value="0">No</option><option value="1"${P.premium ? ' selected' : ''}>Sí</option></select></label>
        <label class="field"><span class="lbl">Foco</span><select id="sFocus"><option value="0">No</option><option value="1"${P.focus ? ' selected' : ''}>Sí</option></select></label>
        <label class="field"><span class="lbl">Foco disponible</span><input id="sFocusAv" type="number" min="0" value="${P.focusAvailable}"></label>
        <label class="field"><span class="lbl">Especialización del objeto (0-100)</span><input id="sSpec" type="number" min="0" max="100" value="${P.ownSpec}"></label>
        <label class="field"><span class="lbl">Maestría del artesano (0-100)</span><input id="sMast" type="number" min="0" max="100" value="${P.mastery}"></label>
        <label class="field"><span class="lbl">Suma de otras especializaciones del árbol</span><input id="sOther" type="number" min="0" value="${P.otherSpecsSum}"><span class="hint">Solo afectan el costo de foco, no el retorno.</span></label>
        <label class="field"><span class="lbl">Capital</span><input id="sCap" type="number" min="0" step="100000" value="${P.capital}"></label>
        <label class="field"><span class="lbl">Tiempo disponible (h)</span><input id="sHours" type="number" min="0" step="0.5" value="${P.hours}"></label>
        <label class="field"><span class="lbl">Riesgo</span><select id="sRisk">${U.options(Object.entries(SM.finder.RISK).map(([k, v]) => ({ value: k, label: v.label })), P.risk)}</select></label>
      </div></section>
    <section class="panel"><div class="ph"><h2>Impuestos y tarifas</h2><span class="muted small">Vacío = valor de data/settings.json</span></div>
      <div class="fields">
        <label class="field"><span class="lbl">Impuesto con premium (%)</span><input id="sTaxP" type="number" step="0.1" placeholder="${S.taxes.sales_tax_premium_pct}" value="${F.taxPremiumPct ?? ''}"></label>
        <label class="field"><span class="lbl">Impuesto sin premium (%)</span><input id="sTaxN" type="number" step="0.1" placeholder="${S.taxes.sales_tax_no_premium_pct}" value="${F.taxNoPremiumPct ?? ''}"></label>
        <label class="field"><span class="lbl">Tarifa de publicación (%)</span><input id="sSetup" type="number" step="0.1" placeholder="${S.taxes.setup_fee_pct}" value="${F.setupFeePct ?? ''}"></label>
        <label class="field"><span class="lbl">Tarifa de fabricación por unidad (escáneres)</span><input id="sFee" type="number" min="0" value="${F.craftingFee}"><span class="hint">Modo manual: la fórmula exacta no está verificada.</span></label>
        <label class="field"><span class="lbl">Transporte por unidad (escáneres)</span><input id="sTr" type="number" min="0" value="${F.transportPerUnit}"></label>
        <label class="field"><span class="lbl">Valor del foco (plata por punto)</span><input id="sFocusVal" type="number" min="0" step="0.1" placeholder="Sin definir" value="${F.focusSilverValue ?? ''}"></label>
        <label class="field"><span class="lbl">Bono diario de producción (puntos)</span><input id="sDaily" type="number" min="0" value="${F.dailyBonus}"></label>
      </div>
      <p class="hint">Fuentes: impuestos ${src(S.taxes.sources)} · retorno ${src(S.return_rate.sources)} · foco ${src(S.focus.sources)}. ${U.esc(S.taxes.setup_fee_applies_to)}</p></section>
    <section class="panel"><div class="ph"><h2>Tiempos por ciclo (min)</h2><span class="muted small">Para calcular silver/hora</span></div>
      <div class="fields">${[['buy', 'Compra'], ['transport1', 'Transporte 1'], ['craft', 'Fabricación'], ['transport2', 'Transporte 2'], ['sell', 'Venta']].map(([k, l]) => `<label class="field"><span class="lbl">${l}</span><input data-min="${k}" type="number" min="0" value="${F.minutes[k]}"></label>`).join('')}</div></section>
    <section class="panel"><div class="ph"><h2>Cantidad óptima</h2><span class="muted small">Usado en la calculadora, el Scanner y Black Market</span></div>
      <div class="fields">
        <label class="field"><span class="lbl">Vender en máximo (días)</span><input id="dDays" type="number" min="1" max="14" value="${F.demand.days}"></label>
        <label class="field"><span class="lbl">Tu parte de las ventas (%)</span><input id="dShare" type="number" min="1" max="100" value="${F.demand.sharePct}"></label>
        <label class="field"><span class="lbl">Seguridad (%)</span><input id="dConf" type="number" min="50" max="99" value="${F.demand.confidencePct}"></label>
        <label class="field"><span class="lbl">Recuperas de lo no vendido (% del costo)</span><input id="dSalv" type="number" min="0" max="100" value="${F.demand.salvagePct}"></label>
      </div>
      <p class="hint">Reglas de la app, no del juego: la tendencia se considera «sube/baja» sobre ±1% diario, y un precio sobre la mayoría de los días recientes reduce tu parte (ver js/demand.js).</p></section>
    <section class="panel"><div class="ph"><h2>Datos y conexión</h2></div>
      <div class="fields">
        <label class="field"><span class="lbl">Precios de máximo (horas) en escáneres</span><input id="sAge" type="number" min="1" value="${F.maxAgeHours}"></label>
        <label class="field"><span class="lbl">Caché (minutos)</span><input id="sCache" type="number" min="0" placeholder="${S.cache_minutes}" value="${F.cacheMinutes ?? ''}"></label>
        <label class="field" style="grid-column:span 2"><span class="lbl">Proxy (Cloudflare Worker)</span><input id="sProxy" type="url" placeholder="https://tu-worker.workers.dev" value="${U.esc(F.proxyUrl)}"><span class="hint">Vacío = consulta AODP directo. Ver worker/ y README.</span></label>
        <label class="field"><span class="lbl">Moneda</span><select disabled><option>Plata (silver)</option></select></label>
        <label class="field"><span class="lbl">Idioma</span><select disabled><option>Español</option></select></label>
      </div>
      <div class="btns"><button class="btn primary" id="sSave">Guardar ajustes</button><button class="btn" id="sProbe">Probar conexión y validar mercados</button><button class="btn" id="sClearCache">Vaciar caché</button></div>
      <div id="sProbeOut"></div></section>
    <section class="panel"><div class="ph"><h2>🔔 Alertas</h2><span class="muted small">Se revisan al escanear y al pulsar «Actualizar mercado» en Inicio.</span></div>
      <div class="fields">
        <label class="field"><span class="lbl">Tipo</span><select id="aType">${U.options(Object.entries(SM.alerts.TYPES).map(([k, v]) => ({ value: k, label: v })))}</select></label>
        <label class="field"><span class="lbl">Valor</span><input id="aVal" type="number" step="1"></label>
        <div class="field" style="grid-column:span 2"><span class="lbl">Objeto (para precio / Mercado Negro)</span><div id="aPicker"></div></div>
      </div>
      <div class="btns"><button class="btn" id="aAdd">Agregar alerta</button></div>
      <div id="aList">${alerts.length ? alerts.map((a, i) => `<p class="row"><span class="check"><input type="checkbox" data-aon="${i}"${a.active ? ' checked' : ''}> ${U.esc(SM.alerts.TYPES[a.type])} ${U.fmt(a.value)}${a.itemId ? ' · ' + U.esc(SM.crafting.label(a.itemId)) : ''}</span> <button class="btn ghost" data-adel="${i}">Quitar</button></p>`).join('') : '<p class="muted small">Sin alertas.</p>'}</div></section>
    <section class="panel"><div class="ph"><h2>Datos del juego y fuentes</h2></div>
      <ul class="src small">
        <li>Objetos y recetas: ${U.esc(SM.data.meta.source)} · generado ${U.esc(SM.data.meta.generated)} (${SM.data.meta.items} objetos).</li>
        <li>Fórmula de retorno: ${U.esc(S.return_rate.formula)} · puntos: base ${S.return_rate.production_bonus.royal_city_base}, bono crafteo ${S.return_rate.production_bonus.city_crafting_specialization}, bono refinado ${S.return_rate.production_bonus.city_refining_specialization}, foco ${S.return_rate.production_bonus.focus}. ${U.esc(S.return_rate.note)}</li>
        <li>Foco: ${U.esc(S.focus.formula)} · ${U.esc(S.focus.note)}</li>
        <li>Tarifa de fabricación: ${U.esc(S.crafting_fee.note)}</li>
        <li>Bonos de ciudad: ${(SM.data.citiesMeta.sources || []).map(s => `<a href="${U.esc(s.url)}" target="_blank" rel="noopener">${U.esc(s.what)}</a> (${U.esc(s.date)})`).join(' · ')}. Caerleon y Brecilien: no verificados, no se aplican automáticamente.</li>
      </ul>
      <div class="btns"><button class="btn ghost" id="sReset">Borrar todos mis datos locales</button><span id="sResetAsk" hidden class="small">¿Seguro? <button class="btn" id="sResetYes">Sí, borrar</button> <button class="btn ghost" id="sResetNo">No</button></span></div></section>`;
    let alertItem = null;
    U.itemPicker(U.$('#aPicker'), it => alertItem = it);
    const num = (id) => { const v = U.$('#' + id).value; return v === '' ? null : +v; };
    U.$('#sSave').onclick = () => {
      const p = SM.storage.profile(), f = SM.storage.prefs();
      Object.assign(p, { server: U.$('#sServer').value, city: U.$('#sCity').value, premium: U.$('#sPrem').value === '1', focus: U.$('#sFocus').value === '1', focusAvailable: +U.$('#sFocusAv').value || 0, ownSpec: Math.min(100, +U.$('#sSpec').value || 0), mastery: Math.min(100, +U.$('#sMast').value || 0), otherSpecsSum: +U.$('#sOther').value || 0, capital: +U.$('#sCap').value || 0, hours: +U.$('#sHours').value || 0, risk: U.$('#sRisk').value });
      Object.assign(f, { taxPremiumPct: num('sTaxP'), taxNoPremiumPct: num('sTaxN'), setupFeePct: num('sSetup'), craftingFee: +U.$('#sFee').value || 0, transportPerUnit: +U.$('#sTr').value || 0, focusSilverValue: num('sFocusVal'), dailyBonus: +U.$('#sDaily').value || 0, maxAgeHours: +U.$('#sAge').value || 12, cacheMinutes: num('sCache'), proxyUrl: U.$('#sProxy').value.trim() });
      U.$$('[data-min]').forEach(i => f.minutes[i.dataset.min] = +i.value || 0);
      f.demand = { days: +U.$('#dDays').value || 3, sharePct: +U.$('#dShare').value || 30, confidencePct: +U.$('#dConf').value || 80, salvagePct: +U.$('#dSalv').value || 0 };
      SM.storage.saveProfile(p); SM.storage.savePrefs(f);
      U.$('#serverSel').value = p.server;
      applyApiConfig(); SM.api.clearCache();
      U.toast('Ajustes guardados');
    };
    U.$('#sProbe').onclick = probe;
    U.$('#sClearCache').onclick = () => { SM.api.clearCache(); U.toast('Caché vaciada'); };
    U.$('#aAdd').onclick = () => {
      const type = U.$('#aType').value, value = +U.$('#aVal').value;
      if (!isFinite(value) || U.$('#aVal').value === '') return U.toast('Escribe un valor', 'err');
      if ((type === 'price_lt' || type === 'bm_gt') && !alertItem) return U.toast('Elige un objeto para esta alerta', 'err');
      const a = SM.storage.alerts(); a.push({ type, value, itemId: (type === 'price_lt' || type === 'bm_gt') ? alertItem.item_id : null, active: true }); SM.storage.saveAlerts(a);
      renderSettings(); U.toast('Alerta agregada');
    };
    U.$$('[data-adel]').forEach(b => b.onclick = () => { const a = SM.storage.alerts(); a.splice(+b.dataset.adel, 1); SM.storage.saveAlerts(a); renderSettings(); });
    U.$$('[data-aon]').forEach(c => c.onchange = () => { const a = SM.storage.alerts(); a[+c.dataset.aon].active = c.checked; SM.storage.saveAlerts(a); });
    U.$('#sReset').onclick = () => { U.$('#sResetAsk').hidden = false; };
    U.$('#sResetNo').onclick = () => { U.$('#sResetAsk').hidden = true; };
    U.$('#sResetYes').onclick = () => { ['profile', 'prefs', 'favorites', 'manual-prices', 'alerts', 'journal'].forEach(k => SM.storage.remove(k)); applyApiConfig(); renderSettings(); U.toast('Datos locales borrados'); };
  }

  async function probe() {
    const U = u(); const out = U.$('#sProbeOut');
    if (out) out.innerHTML = '<p class="muted">Probando…</p>';
    const locs = SM.crafting.marketLocations();
    const r = await SM.api.probe(locs);
    if (!out) return r;
    if (!r.ok) { out.innerHTML = `<p class="insufficient">${U.esc(r.error)}</p>`; return r; }
    const ok = SM.market.locationsWithData(r.rows);
    out.innerHTML = `<p class="pos">Conexión correcta${SM.api.status().mode === 'proxy' ? ' a través del proxy' : ' directa'}.</p>
      <div class="tablewrap"><table><thead><tr><th>Mercado</th><th>Nombre en AODP</th><th>¿Devuelve datos?</th></tr></thead><tbody>
      ${locs.map(l => `<tr><td>${U.esc(l === 'Black Market' ? 'Mercado Negro' : l)}</td><td><code>${U.esc(l)}</code></td><td>${ok.has(l) ? '<span class="pos">Sí</span>' : '<span class="muted">Sin datos en esta prueba</span>'}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Prueba hecha con 3 objetos comunes. Un mercado sin datos aquí puede tenerlos para otros objetos.</p>`;
    return r;
  }

  async function boot() {
    const U = u();
    window.addEventListener('error', ev => { try { U.toast('Error: ' + (ev.message || 'desconocido') + '. Si acabas de actualizar, recarga la página.', 'err'); } catch (e) { } });
    window.addEventListener('unhandledrejection', ev => { try { U.toast('Error: ' + ((ev.reason && ev.reason.message) || ev.reason) + '.', 'err'); } catch (e) { } });
    try { await SM.crafting.load(); }
    catch (e) { U.$('#loading').textContent = e.message; return; }
    U.$('#loading').remove();
    applyApiConfig();
    SM.api.onStatus(renderStatus);
    const P = SM.storage.profile();
    U.$('#serverSel').innerHTML = U.options(Object.entries(SM.data.settings.servers).map(([k, v]) => ({ value: k, label: v.label })), P.server);
    U.$('#serverSel').onchange = e => { const p = SM.storage.profile(); p.server = e.target.value; SM.storage.saveProfile(p); applyApiConfig(); SM.api.clearCache(); U.toast('Servidor: ' + SM.data.settings.servers[p.server].label + '. Los precios no se mezclan entre servidores.'); SM.api.probe(SM.crafting.marketLocations()); };
    U.$('#apiPill').onclick = () => { go('settings'); setTimeout(probe, 50); };
    const htmlV = document.documentElement.dataset.version, jsV = SM.VERSION || '?';
    const vb = U.$('#verBadge'); vb.textContent = 'v' + jsV;
    if (htmlV !== jsV) { vb.classList.add('mismatch'); vb.textContent = 'v' + jsV + ' ⚠'; vb.title = 'La página es v' + htmlV + ' pero los archivos son v' + jsV + '. Recarga; si sigue, revisa que subiste todos los archivos.'; }
    vb.onclick = () => U.modal('Silver Master v' + jsV, (htmlV !== jsV ? '<p class="insufficient">' + U.esc(vb.title) + '</p>' : '') + (SM.CHANGELOG || []).map(c => `<h3>v${U.esc(c.v)} · ${U.esc(c.date)}</h3><ul>${c.items.map(i => '<li>' + U.esc(i) + '</li>').join('')}</ul>`).join(''));
    U.$$('#tabs button').forEach(b => b.onclick = () => go(b.dataset.view));
    document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });
    U.$('#refreshMarket').onclick = refreshMarket;
    U.$('#modalClose').onclick = U.closeModal;
    U.$('#modal').onclick = e => { if (e.target.id === 'modal') U.closeModal(); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') U.closeModal(); });
    const start = (location.hash || '').slice(1);
    go(['home', 'calc', 'scanner', 'bm', 'global', 'routes', 'history', 'finder', 'settings', 'refine', 'flip', 'journal', 'local', 'intel', 'simple', 'artifacts', 'potions', 'craft'].includes(start) ? start : 'home');
    SM.api.probe(SM.crafting.marketLocations());
  }

  SM.app = { go, busy, setStale, showAlerts, renderHome, probe };
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', boot);
})(typeof window !== 'undefined' ? window : globalThis);
