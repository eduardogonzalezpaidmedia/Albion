/* Silver Master — Fabricación de pociones.
   Lista de pociones por tipo; al elegir una se muestran sus materiales, escribes el precio de cada uno
   y el precio de venta, y calcula la rentabilidad. Usa el mismo motor que la Calculadora (SM.engine.evaluate).
   Los precios que escribes se guardan en este dispositivo y sirven para todas las pociones que usan ese material. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const U = () => SM.ui;
  const KEY = 'potion-prices';            // { mats: {item_id: precio}, sale: {item_id: precio} }
  const S = { fam: null, tier: null, ench: 0, idx: {}, loaded: false };
  let FAMS = null;

  const store = () => Object.assign({ mats: {}, sale: {} }, SM.storage.get(KEY, {}));
  const save = p => SM.storage.set(KEY, p);

  /** Agrupa las pociones por tipo (misma receta base en distintos tiers y encantamientos). */
  function families() {
    if (FAMS) return FAMS;
    const g = {};
    SM.data.items.filter(it => it.category === 'potions').forEach(it => {
      const base = it.item_id.split('@')[0].replace(/^T\d_/, '');
      (g[base] = g[base] || { key: base, items: [] }).items.push(it);
    });
    FAMS = Object.values(g).map(f => {
      f.items.sort((a, b) => a.tier - b.tier || a.enchantment - b.enchantment);
      f.tiers = [...new Set(f.items.map(i => i.tier))];
      f.label = f.items[0].name.replace(/\s+menor$/i, '');
      return f;
    }).sort((a, b) => a.label.localeCompare(b.label, 'es'));
    return FAMS;
  }
  const current = () => S.fam && S.fam.items.find(i => i.tier === S.tier && i.enchantment === S.ench);

  function init() {
    const u = U(), P = SM.storage.profile(), fams = families();
    const cities = SM.data.cities.filter(c => c.type !== 'black_market').map(c => c.id);
    u.$('#poList').innerHTML = fams.map(f => `<button type="button" class="po-fam" data-fam="${u.esc(f.key)}"><b>${u.esc(f.label)}</b><span class="small muted">${f.tiers.map(t => 'T' + t).join(' · ')}</span></button>`).join('');
    u.$('#poList').onclick = e => { const b = e.target.closest('[data-fam]'); if (b) pick(b.dataset.fam, true); };
    u.$('#poOpts').innerHTML = `<div class="fields">
      <label class="field"><span class="lbl">Cantidad a fabricar</span><input id="poUnits" type="number" min="1" inputmode="numeric" value="100"></label>
      <label class="field"><span class="lbl">Precio de venta (por poción)</span><input id="poSale" type="number" min="0" inputmode="numeric" placeholder="Escríbelo"><span class="hint" id="poSaleHint"></span></label>
      <label class="field"><span class="lbl">Tipo de venta</span><select id="poMode"><option value="order">Publicar orden de venta</option><option value="instant">Venta inmediata (orden de compra)</option></select></label>
      <label class="field"><span class="lbl">Fabricas en</span><select id="poCity">${u.options(cities, P.city)}</select></label>
      <label class="field"><span class="lbl">Bono de ciudad para pociones</span><select id="poBonus"><option value="no">No aplica</option><option value="yes">Sí, aplica</option></select><span class="hint">No hay una ciudad con bono de pociones verificado: márcalo tú si en el juego lo ves.</span></label>
      <label class="field"><span class="lbl">Foco</span><span class="check"><input id="poFocus" type="checkbox"${P.focus ? ' checked' : ''}> Usar foco</span></label>
      <label class="field"><span class="lbl">Premium</span><span class="check"><input id="poPrem" type="checkbox"${P.premium ? ' checked' : ''}> Tengo Premium</span></label>
      <label class="field"><span class="lbl">Tarifa de fabricación (total)</span><input id="poFee" type="number" min="0" inputmode="numeric" value="0"><span class="hint">Cópiala de la ventana de fabricación.</span></label>
    </div>`;
    ['poUnits', 'poFee'].forEach(id => u.$('#' + id).addEventListener('input', result));
    u.$('#poSale').addEventListener('input', () => { const it = current(), p = store(), v = +u.$('#poSale').value; if (v > 0) p.sale[it.item_id] = v; else delete p.sale[it.item_id]; save(p); result(); });
    ['poMode', 'poCity', 'poBonus', 'poFocus', 'poPrem'].forEach(id => u.$('#' + id).addEventListener('change', () => { mats(); result(); }));
    u.$('#poTiers').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { S.tier = +b.dataset.t; detail(); } };
    u.$('#poEnch').onclick = e => { const b = e.target.closest('[data-e]'); if (b) { S.ench = +b.dataset.e; detail(); } };
    u.$('#poLoad').onclick = load;
    u.$('#poClear').onclick = () => { const it = current(), p = store(), r = SM.crafting.recipe(it.item_id); r.materials.forEach(m => delete p.mats[m.item_id]); delete p.sale[it.item_id]; save(p); detail(); u.toast('Precios de esta poción borrados'); };
    pick(fams[0].key, false);
  }

  function pick(key, scroll) {
    const u = U(); S.fam = families().find(f => f.key === key);
    if (!S.fam.tiers.includes(S.tier)) S.tier = S.fam.tiers[0];
    u.$$('#poList .po-fam').forEach(b => b.setAttribute('aria-pressed', b.dataset.fam === key));
    detail();
    if (scroll && window.matchMedia('(max-width: 759px)').matches) u.$('#poDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function detail() {
    const u = U(), f = S.fam;
    const enchs = [...new Set(f.items.filter(i => i.tier === S.tier).map(i => i.enchantment))];
    if (!enchs.includes(S.ench)) S.ench = enchs[0];
    const it = current(), r = SM.crafting.recipe(it.item_id);
    u.$('#poTitle').innerHTML = `${u.esc(it.name)} <span class="tag">T${it.tier}.${it.enchantment}</span>`;
    u.$('#poRecipe').textContent = r ? 'Cada crafteo da ' + r.quantity_produced + ' pociones.' : 'Sin receta en los datos del juego.';
    u.$('#poTiers').innerHTML = f.tiers.map(t => `<button type="button" class="chip" data-t="${t}" aria-pressed="${t === S.tier}">T${t} · ${u.esc(f.items.find(i => i.tier === t).name.replace(f.label, '').trim() || 'normal')}</button>`).join('');
    u.$('#poEnch').innerHTML = enchs.map(e => `<button type="button" class="chip" data-e="${e}" aria-pressed="${e === S.ench}">.${e}</button>`).join('');
    const p = store(); u.$('#poSale').value = p.sale[it.item_id] || '';
    saleHint(); mats(); result();
  }

  function ctxFor() {
    const u = U(), p = store(), man = {};
    Object.entries(p.mats).forEach(([id, v]) => { if (v > 0) man[id] = { price: v }; });
    return SM.engine.context({ craftCity: u.$('#poCity').value, focus: u.$('#poFocus').checked, premium: u.$('#poPrem').checked, units: Math.max(1, +u.$('#poUnits').value || 1),
      manualPrices: man, manualSale: +u.$('#poSale').value || null, saleMode: u.$('#poMode').value, bonusOverride: u.$('#poBonus').value === 'yes', maxAgeH: null,
      buyLocations: S.loaded ? SM.crafting.buyLocations() : [], sellMarkets: [], fee: { value: +u.$('#poFee').value || 0, mode: 'total' }, transport: { legs: [], perUnit: 0 } });
  }

  function saleHint() {
    const u = U(), it = current(), h = u.$('#poSaleHint');
    if (!S.loaded) { h.textContent = ''; return; }
    const mode = u.$('#poMode').value, city = u.$('#poCity').value, r = SM.market.row(S.idx, it.item_id, city, 1);
    const o = mode === 'order' ? SM.market.sellOrder(r) : SM.market.buyOrder(r);
    h.innerHTML = o ? `En línea en ${u.esc(city)}: <b>${u.fmt(o.price)}</b> ${u.ageBadge(o.date)} <button type="button" class="btn sm" id="poUseSale">Usar</button>` : `Sin precio en línea en ${u.esc(city)}.`;
    const b = u.$('#poUseSale'); if (b) b.onclick = () => { u.$('#poSale').value = o.price; u.$('#poSale').dispatchEvent(new Event('input')); };
  }

  /** Lista de materiales con su casilla de precio. Solo se reconstruye al cambiar de poción u opciones. */
  function mats() {
    const u = U(), it = current(), ctx = ctxFor(), e = SM.engine.evaluate(it, S.idx, ctx), p = store();
    saleHint();
    u.$('#poMats').innerHTML = e.calc.lines.map(l => {
      const on = S.loaded ? SM.market.cheapestBuy(S.idx, l.item_id, SM.crafting.buyLocations(), null) : null;
      return `<div class="sp-mat" data-row="${u.esc(l.item_id)}">
        <div class="sp-mh"><b>${u.esc(SM.crafting.label(l.item_id))}</b><span class="sp-q">Comprar <b data-q></b></span></div>
        <p class="small muted" data-info></p>
        ${on ? `<p class="small">En línea más barato: <b>${u.esc(on.location)}</b> a <span class="silver">${u.fmt(on.price)}</span> ${u.ageBadge(on.date)} <button type="button" class="btn sm" data-use="${on.price}">Usar</button></p>` : ''}
        <label class="field inline sp-in"><span class="lbl">Precio por unidad</span><input type="number" min="0" inputmode="numeric" data-mat="${u.esc(l.item_id)}" value="${p.mats[l.item_id] || ''}" placeholder="Escríbelo"></label>
        <p class="small sp-cost">Costo: <b data-cost></b></p>
      </div>`;
    }).join('');
    u.$$('#poMats [data-mat]').forEach(inp => inp.addEventListener('input', () => { const q = store(), v = +inp.value; if (v > 0) q.mats[inp.dataset.mat] = v; else delete q.mats[inp.dataset.mat]; save(q); result(); }));
    u.$$('#poMats [data-use]').forEach(b => b.onclick = () => { const inp = b.closest('.sp-mat').querySelector('[data-mat]'); inp.value = b.dataset.use; inp.dispatchEvent(new Event('input')); });
  }

  /** Recalcula cantidades, costos y rentabilidad sin tocar las casillas (no pierdes el foco al escribir). */
  function result() {
    const u = U(), it = current(); if (!it) return;
    const ctx = ctxFor(); ctx.buyLocations = [];                    // el cálculo usa SOLO los precios que escribiste
    const e = SM.engine.evaluate(it, S.idx, ctx), c = e.calc;
    c.lines.forEach(l => {
      const row = u.$(`#poMats [data-row="${l.item_id}"]`); if (!row) return;
      row.querySelector('[data-q]').textContent = l.toBuy === null ? '—' : l.toBuy.toLocaleString('es-CL');
      row.querySelector('[data-info]').textContent = `${l.perCraft} por crafteo × ${c.crafts} = ${u.fmtQ(l.gross)}` + (l.returnable ? ` · vuelven ${u.fmtQ(l.recovered)} (${u.pct(c.returnRate * 100)})` : ' · no retorna');
      row.querySelector('[data-cost]').textContent = l.cost === null ? 'falta el precio' : u.fmt(l.cost);
    });
    const missing = c.lines.filter(l => l.price === null).length, sale = +u.$('#poSale').value || 0, mode = u.$('#poMode').value;
    const be = c.totalCost !== null ? SM.invest.breakeven(c.totalCost / c.made, mode, ctx.taxPct, ctx.setupPct) : null;
    let v;
    if (missing) v = { cls: 'wait', t: 'Faltan precios', d: `Escribe el precio de ${missing} material(es) para calcular.` };
    else if (!sale) v = { cls: 'wait', t: 'Falta el precio de venta', d: `Para no perder tendrías que vender cada poción a ${u.fmt(Math.ceil(be))} o más.` };
    else if (c.profit > 0 && c.roi >= 5) v = { cls: 'yes', t: 'RENTABLE', d: `Ganas ${u.fmtQ(c.profitPerUnit)} por poción (${u.pct(c.roi)}).` };
    else if (c.profit > 0) v = { cls: 'meh', t: 'RENTABLE, PERO JUSTO', d: `El margen es de solo ${u.pct(c.roi)}.` };
    else v = { cls: 'no', t: 'NO ES RENTABLE', d: `Pierdes ${u.fmtQ(Math.abs(c.profitPerUnit))} por poción. Tendrías que venderla a ${u.fmt(Math.ceil(be))} o más.` };
    const k = (l, val, s, cls) => `<div class="kpi ${cls || ''}"><span class="lbl">${l}</span><b>${val}</b><span class="s">${s || ''}</span></div>`;
    u.$('#poResult').innerHTML = `<div class="sp-verdict v-${v.cls}"><b>${v.t}</b><span>${v.d}</span></div>
      <div class="kpis">
        ${k('Pociones que salen', c.made.toLocaleString('es-CL'), `${c.crafts} crafteo(s) × ${c.yieldN}`)}
        ${k('Costo total', u.fmt(c.totalCost), c.totalCost === null ? '' : `materiales ${u.fmt(c.materialCost)}${c.craftingFee ? ' + tarifa ' + u.fmt(c.craftingFee) : ''}`)}
        ${k('Costo por poción', c.totalCost === null ? 'Sin datos' : u.fmtQ(c.totalCost / c.made), 'retorno ' + u.pct(c.returnRate * 100))}
        ${k('Ingreso neto', u.fmt(c.sale ? c.sale.net : null), c.sale ? `${u.fmt(c.sale.gross)} − impuesto ${u.fmt(c.sale.tax)}${c.sale.setup ? ' − publicación ' + u.fmt(c.sale.setup) : ''}` : '')}
        ${k('Ganancia del lote', u.fmt(c.profit), c.roi === null ? '' : 'ROI ' + u.pct(c.roi), c.profit > 0 ? 'pos' : c.profit < 0 ? 'neg' : '')}
        ${k('Precio mínimo para no perder', be === null ? 'Sin datos' : u.fmt(Math.ceil(be)), 'por poción')}
      </div>
      <p class="hint">Retorno ${u.pct(c.returnRate * 100)} en ${u.esc(ctx.craftCity)}${e.rr.bonusKind ? ' con bono de ciudad' : ' sin bono'}${ctx.focus ? ' y foco' : ''}. Impuesto de venta ${ctx.taxPct}%${mode === 'order' ? ' + publicación ' + ctx.setupPct + '%' : ''}. Se calcula solo con los precios que escribiste.</p>`;
  }

  async function load() {
    const u = U(), it = current(), r = SM.crafting.recipe(it.item_id), btn = u.$('#poLoad'), msg = u.$('#poMsg');
    btn.disabled = true; SM.app.busy(true); msg.textContent = 'Cargando precios en línea…'; msg.className = 'msg small';
    try {
      const ids = S.fam.items.map(i => i.item_id), matIds = [...new Set(S.fam.items.flatMap(i => (SM.crafting.recipe(i.item_id) || { materials: [] }).materials.map(m => m.item_id)))];
      const [p1, p2] = await Promise.all([SM.api.getPrices(matIds, SM.crafting.buyLocations(), [1]), SM.api.getPrices(ids, SM.crafting.buyLocations(), [1])]);
      SM.market.index(p1.rows, S.idx); SM.market.index(p2.rows, S.idx); S.loaded = true;
      msg.textContent = 'Precios en línea cargados ' + new Date().toLocaleTimeString('es-CL') + ' · Toca «Usar» en cada material para copiarlos, o escribe los tuyos.';
      mats(); result();
    } catch (e) { msg.textContent = '⚠ No pude cargar precios en línea (' + e.message + '). Escríbelos a mano.'; msg.className = 'msg small err'; }
    finally { btn.disabled = false; SM.app.busy(false); }
  }

  SM.views = SM.views || {};
  SM.views.potions = { init, families };
})(typeof window !== 'undefined' ? window : globalThis);
