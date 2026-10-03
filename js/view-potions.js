/* Silver Master — Pociones (v1.8).
   Dos pantallas:
   1) «Precios de materiales»: todos los materiales de pociones, agrupados, con una casilla de precio cada uno.
   2) «Pociones»: tabla por tipo → una fila por tier y una columna por encantamiento, con el costo (o la ganancia) por poción.
   Tocar una celda abre el detalle: materiales, precio de venta y rentabilidad.
   Usa el mismo motor que la Calculadora (SM.engine.evaluate). Los precios se guardan en este dispositivo. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const U = () => SM.ui;
  const KEY = 'potion-prices', CFG = 'potion-settings';
  const S = { sub: 'table', idx: {}, loaded: false, show: 'cost' };
  let FAMS = null, MATS = null;

  const store = () => Object.assign({ mats: {}, sale: {} }, SM.storage.get(KEY, {}));
  const save = p => SM.storage.set(KEY, p);
  const cfg = () => { const P = SM.storage.profile(); return Object.assign({ bonus: 'no', daily: 0, focus: !!P.focus, premium: !!P.premium, fee: 0, mode: 'order', city: P.city }, SM.storage.get(CFG, {})); };

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

  /** Materiales de todas las pociones, agrupados. */
  const GROUPS = [
    { key: 'herb', label: 'Hierbas', test: id => /_(AGARIC|COMFREY|BURDOCK|TEASEL|FOXGLOVE|MULLEIN|YARROW)$/.test(id) },
    { key: 'animal', label: 'Huevos, leche y manteca', test: id => /_(EGG|MILK|BUTTER)$/.test(id) },
    { key: 'alcohol', label: 'Alcohol', test: id => /_ALCOHOL$/.test(id) },
    { key: 'extract', label: 'Extractos arcanos', test: id => /ALCHEMY_EXTRACT/.test(id) },
    { key: 'rare', label: 'Ingredientes raros', test: id => /ALCHEMY_RARE/.test(id) },
    { key: 'other', label: 'Otros', test: () => true }
  ];
  function materials() {
    if (MATS) return MATS;
    const ids = new Set();
    families().forEach(f => f.items.forEach(it => { const r = SM.crafting.recipe(it.item_id); r && r.materials.forEach(m => ids.add(m.item_id)); }));
    const tier = id => +(/^T(\d)/.exec(id) || [0, 0])[1];
    MATS = GROUPS.map(g => ({ key: g.key, label: g.label, sub: [] }));
    [...ids].forEach(id => {
      const gi = GROUPS.findIndex(g => g.test(id)), g = MATS[gi];
      const subKey = g.key === 'rare' ? id.replace(/^T\d_ALCHEMY_RARE_/, '') : g.key === 'animal' ? id.replace(/^T\d_/, '') : id;
      let s = g.sub.find(x => x.key === subKey); if (!s) g.sub.push(s = { key: subKey, items: [] });
      s.items.push({ id, tier: tier(id), name: SM.crafting.name(id) });
    });
    MATS = MATS.filter(g => g.sub.length);
    MATS.forEach(g => { g.sub.forEach(s => s.items.sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id))); g.sub.sort((a, b) => (g.key === 'rare' || g.key === 'animal') ? a.items[0].name.localeCompare(b.items[0].name, 'es') : a.items[0].tier - b.items[0].tier || a.items[0].id.localeCompare(b.items[0].id)); g.count = g.sub.reduce((n, s) => n + s.items.length, 0); });
    return MATS;
  }

  function init() {
    const u = U();
    u.$('#poNav').onclick = e => { const b = e.target.closest('[data-sub]'); if (b) sub(b.dataset.sub); };
    buildSettings(); buildMaterials();
    u.$('#poShow').onchange = () => { S.show = u.$('#poShow').value; table(); };
    u.$('#poMissing').onclick = e => { if (e.target.closest('a')) { e.preventDefault(); sub('mats'); } };
    u.$('#poLoadSale').onclick = loadSale;
    sub('table');
  }
  function sub(k) {
    const u = U(); S.sub = k;
    u.$$('#poNav button').forEach(b => { if (b.dataset.sub === k) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    u.$('#poSubTable').hidden = k !== 'table'; u.$('#poSubMats').hidden = k !== 'mats';
    if (k === 'table') table();
    window.scrollTo({ top: 0 });
  }

  /* ---------- ajustes ---------- */
  function buildSettings() {
    const u = U(), c = cfg(), cities = SM.data.cities.filter(x => x.type !== 'black_market').map(x => x.id);
    u.$('#poSettings').innerHTML = `<div class="fields">
      <label class="field"><span class="lbl">Ubicación</span><select id="pcBonus"><option value="no">Ciudad sin bono de pociones</option><option value="yes"${c.bonus === 'yes' ? ' selected' : ''}>Ciudad con bono de pociones</option></select></label>
      <label class="field"><span class="lbl">Bono del día</span><select id="pcDaily">${u.options([{ value: 0, label: 'Ninguno' }, { value: 10, label: '+10%' }, { value: 20, label: '+20%' }], c.daily)}</select></label>
      <label class="field"><span class="lbl">Foco</span><span class="check"><input id="pcFocus" type="checkbox"${c.focus ? ' checked' : ''}> Usar foco</span></label>
      <label class="field"><span class="lbl">Tarifa de fabricación (por poción)</span><input id="pcFee" type="number" min="0" inputmode="numeric" value="${c.fee}"></label>
      <label class="field"><span class="lbl">Tipo de venta</span><select id="pcMode"><option value="order">Publicar orden de venta</option><option value="instant"${c.mode === 'instant' ? ' selected' : ''}>Venta inmediata</option></select></label>
      <label class="field"><span class="lbl">Premium</span><span class="check"><input id="pcPrem" type="checkbox"${c.premium ? ' checked' : ''}> Tengo Premium</span></label>
      <label class="field"><span class="lbl">Ciudad (precios en línea)</span><select id="pcCity">${u.options(cities, c.city)}</select></label>
    </div>`;
    const read = () => { SM.storage.set(CFG, { bonus: u.$('#pcBonus').value, daily: +u.$('#pcDaily').value, focus: u.$('#pcFocus').checked, premium: u.$('#pcPrem').checked, fee: +u.$('#pcFee').value || 0, mode: u.$('#pcMode').value, city: u.$('#pcCity').value }); table(); };
    ['pcBonus', 'pcDaily', 'pcFocus', 'pcPrem', 'pcMode', 'pcCity'].forEach(id => u.$('#' + id).addEventListener('change', read));
    u.$('#pcFee').addEventListener('input', read);
  }
  function context(units) {
    const c = cfg(), p = store(), man = {};
    Object.entries(p.mats).forEach(([id, v]) => { if (v > 0) man[id] = { price: v }; });
    return SM.engine.context({ craftCity: c.city, focus: c.focus, premium: c.premium, dailyBonus: c.daily, bonusOverride: c.bonus === 'yes', units: units || 1, manualPrices: man,
      saleMode: c.mode, maxAgeH: null, buyLocations: [], sellMarkets: [], fee: { value: c.fee, mode: 'per_unit' }, transport: { legs: [], perUnit: 0 } });
  }
  function evalItem(it, units) {
    const p = store(), ctx = context(units || (SM.crafting.recipe(it.item_id) || {}).quantity_produced || 1);
    ctx.manualSale = p.sale[it.item_id] || null;
    return { e: SM.engine.evaluate(it, {}, ctx), ctx };
  }

  /* ---------- tabla de pociones ---------- */
  function table() {
    const u = U(), fams = families(), p = store();
    let missing = new Set(), n = 0, rate = null;
    const cell = it => {
      if (!it) return '<td class="n muted">·</td>';
      n++;
      const { e } = evalItem(it), c = e.calc; rate = c.returnRate;
      c.lines.forEach(l => { if (l.price === null) missing.add(l.item_id); });
      if (c.totalCost === null) return `<td class="n po-cell" data-it="${u.esc(it.item_id)}"><span class="muted">—</span></td>`;
      const cost = c.totalCost / c.made, sale = p.sale[it.item_id];
      let main = u.fmt(cost), cls = '', subl = '';
      if (S.show !== 'cost') {
        if (!sale) { main = '<span class="muted small">sin venta</span>'; }
        else { const v = S.show === 'profit' ? c.profitPerUnit : c.roi; main = S.show === 'profit' ? u.fmt(v) : u.pct(v); cls = v > 0 ? 'pos' : v < 0 ? 'neg' : ''; }
      } else if (sale) subl = `<i class="${c.profit > 0 ? 'pos' : 'neg'}">${c.profit > 0 ? '+' : ''}${u.fmt(c.profitPerUnit)}</i>`;
      return `<td class="n po-cell ${cls}" data-it="${u.esc(it.item_id)}"><b>${main}</b>${subl}</td>`;
    };
    const html = fams.map(f => `<tbody><tr class="po-fh"><th colspan="5">${u.esc(f.label)}</th></tr>${f.tiers.map(t => `<tr><td class="po-t">T${t}<span class="small muted"> ${u.esc(f.items.find(i => i.tier === t).name.replace(f.label, '').trim())}</span></td>${[0, 1, 2, 3].map(en => cell(f.items.find(i => i.tier === t && i.enchantment === en))).join('')}</tr>`).join('')}</tbody>`).join('');
    u.$('#poTable').innerHTML = `<div class="tablewrap"><table class="grid-table po-table"><thead><tr><th>Tier</th><th class="n">.0</th><th class="n">.1</th><th class="n">.2</th><th class="n">.3</th></tr></thead>${html}</table></div>`;
    u.$('#poSummary').innerHTML = `${n} recetas · retorno efectivo: <b class="silver">${rate === null ? '—' : u.pct(rate * 100)}</b> · ${S.show === 'cost' ? 'costo por poción' : S.show === 'profit' ? 'ganancia por poción' : 'ROI'}`;
    const mb = u.$('#poMissing');
    mb.hidden = !missing.size;
    mb.innerHTML = `⚠ Falta el precio de ${missing.size} material(es): <a href="#">abre Precios de materiales</a> para completarlos.`;
    u.$$('#poTable .po-cell').forEach(td => td.onclick = () => detail(SM.crafting.item(td.dataset.it)));
  }

  /* ---------- detalle de una poción ---------- */
  function detail(it) {
    const u = U();
    u.modal(it.name + ' ' + it.tier + '.' + it.enchantment, `<div class="fields">
        <label class="field"><span class="lbl">Precio de venta (por poción)</span><input id="pdSale" type="number" min="0" inputmode="numeric" value="${store().sale[it.item_id] || ''}" placeholder="Escríbelo"><span class="hint" id="pdHint"></span></label>
        <label class="field"><span class="lbl">Cantidad a fabricar</span><input id="pdUnits" type="number" min="1" inputmode="numeric" value="100"></label>
      </div><div id="pdOut"></div>`);
    const draw = () => {
      const units = Math.max(1, +u.$('#pdUnits').value || 1), { e, ctx } = evalItem(it, units), c = e.calc, mode = cfg().mode;
      const be = c.totalCost !== null ? SM.invest.breakeven(c.totalCost / c.made, mode, ctx.taxPct, ctx.setupPct) : null;
      const miss = c.lines.filter(l => l.price === null).length, sale = store().sale[it.item_id];
      let v;
      if (miss) v = { cls: 'wait', t: 'Faltan precios', d: `Falta el precio de ${miss} material(es).` };
      else if (!sale) v = { cls: 'wait', t: 'Falta el precio de venta', d: `Para no perder: ${u.fmt(Math.ceil(be))} o más por poción.` };
      else if (c.profit > 0 && c.roi >= 5) v = { cls: 'yes', t: 'RENTABLE', d: `Ganas ${u.fmtQ(c.profitPerUnit)} por poción (${u.pct(c.roi)}).` };
      else if (c.profit > 0) v = { cls: 'meh', t: 'RENTABLE, PERO JUSTO', d: `Margen de solo ${u.pct(c.roi)}.` };
      else v = { cls: 'no', t: 'NO ES RENTABLE', d: `Pierdes ${u.fmtQ(Math.abs(c.profitPerUnit))} por poción. Mínimo: ${u.fmt(Math.ceil(be))}.` };
      const k = (l, val, s2, cls) => `<div class="kpi ${cls || ''}"><span class="lbl">${l}</span><b>${val}</b><span class="s">${s2 || ''}</span></div>`;
      u.$('#pdOut').innerHTML = `<div class="sp-verdict v-${v.cls}"><b>${v.t}</b><span>${v.d}</span></div>
        <div class="tablewrap"><table class="grid-table"><thead><tr><th>Material</th><th class="n">Comprar</th><th class="n">Precio</th><th class="n">Costo</th></tr></thead><tbody>
        ${c.lines.map(l => `<tr><td>${u.esc(SM.crafting.label(l.item_id))}<br><span class="small muted">${l.perCraft} × ${c.crafts}${l.returnable ? ' · vuelven ' + u.fmtQ(l.recovered) : ' · no retorna'}</span></td><td class="n">${l.toBuy === null ? '—' : l.toBuy.toLocaleString('es-CL')}</td><td class="n">${l.price === null ? '<span class="warn">falta</span>' : u.fmt(l.price)}</td><td class="n">${l.cost === null ? '—' : u.fmt(l.cost)}</td></tr>`).join('')}</tbody></table></div>
        <div class="kpis">
          ${k('Pociones que salen', c.made.toLocaleString('es-CL'), `${c.crafts} crafteo(s) × ${c.yieldN}`)}
          ${k('Costo total', u.fmt(c.totalCost), c.totalCost === null ? '' : `materiales ${u.fmt(c.materialCost)}${c.craftingFee ? ' + tarifa ' + u.fmt(c.craftingFee) : ''}`)}
          ${k('Costo por poción', c.totalCost === null ? 'Sin datos' : u.fmtQ(c.totalCost / c.made), 'retorno ' + u.pct(c.returnRate * 100))}
          ${k('Ingreso neto', u.fmt(c.sale ? c.sale.net : null), c.sale ? `impuesto ${u.fmt(c.sale.tax)}${c.sale.setup ? ' + publicación ' + u.fmt(c.sale.setup) : ''}` : '')}
          ${k('Ganancia del lote', u.fmt(c.profit), c.roi === null ? '' : 'ROI ' + u.pct(c.roi), c.profit > 0 ? 'pos' : c.profit < 0 ? 'neg' : '')}
          ${k('Precio mínimo', be === null ? 'Sin datos' : u.fmt(Math.ceil(be)), 'para no perder')}
        </div>`;
      const h = u.$('#pdHint'), c2 = cfg(), r = S.loaded ? SM.market.row(S.idx, it.item_id, c2.city, 1) : null, o = r ? (c2.mode === 'order' ? SM.market.sellOrder(r) : SM.market.buyOrder(r)) : null;
      h.innerHTML = o ? `En línea en ${u.esc(c2.city)}: <b>${u.fmt(o.price)}</b> ${u.ageBadge(o.date)} <button type="button" class="btn sm" id="pdUse">Usar</button>` : '';
      const b = u.$('#pdUse'); if (b) b.onclick = () => { u.$('#pdSale').value = o.price; u.$('#pdSale').dispatchEvent(new Event('input')); };
    };
    u.$('#pdSale').addEventListener('input', () => { const p = store(), val = +u.$('#pdSale').value; if (val > 0) p.sale[it.item_id] = val; else delete p.sale[it.item_id]; save(p); draw(); table(); });
    u.$('#pdUnits').addEventListener('input', draw);
    draw();
  }

  /* ---------- precios de materiales ---------- */
  function buildMaterials() {
    const u = U(), p = store();
    u.$('#poMatGroups').innerHTML = materials().map(g => `<section class="po-group"><h3>${u.esc(g.label)} <span class="small muted">${g.count}</span></h3><div class="po-cards">${g.sub.map(s => `<div class="po-card">${s.items.map(m => `<label class="po-row"><span><span class="tag">T${m.tier}</span> ${u.esc(m.name)}</span><input type="number" min="0" inputmode="numeric" data-mat="${u.esc(m.id)}" value="${p.mats[m.id] || ''}" placeholder="0"><span class="po-on small muted" data-on="${u.esc(m.id)}"></span></label>`).join('')}</div>`).join('')}</div></section>`).join('');
    u.$$('#poMatGroups [data-mat]').forEach(inp => inp.addEventListener('input', () => { const q = store(), v = +inp.value; if (v > 0) q.mats[inp.dataset.mat] = v; else delete q.mats[inp.dataset.mat]; save(q); count(); }));
    u.$('#poLoadMats').onclick = loadMats;
    u.$('#poFill').onclick = () => fill(false);
    u.$('#poFillAll').onclick = () => fill(true);
    u.$('#poClearMats').onclick = () => { u.$('#poClearC').hidden = false; };
    u.$('#poClearYes').onclick = () => { const q = store(); q.mats = {}; save(q); u.$('#poClearC').hidden = true; u.$$('#poMatGroups [data-mat]').forEach(i => i.value = ''); count(); u.toast('Precios de materiales borrados'); };
    count();
  }
  function count() {
    const u = U(), p = store(), all = materials().reduce((n, g) => n + g.count, 0), done = u.$$('#poMatGroups [data-mat]').filter(i => +i.value > 0).length;
    u.$('#poMatCount').textContent = `${done} de ${all} materiales con precio. Se guardan solos en este dispositivo.`;
  }
  const allMatIds = () => materials().flatMap(g => g.sub.flatMap(s => s.items.map(m => m.id)));
  async function loadMats() {
    const u = U(), btn = u.$('#poLoadMats'), msg = u.$('#poMatMsg');
    btn.disabled = true; SM.app.busy(true); msg.textContent = 'Cargando precios en línea…'; msg.className = 'msg small';
    try {
      const pr = await SM.api.getPrices(allMatIds(), SM.crafting.buyLocations(), [1]);
      SM.market.index(pr.rows, S.idx); S.matsLoaded = true;
      u.$$('#poMatGroups [data-on]').forEach(el => { const b = SM.market.cheapestBuy(S.idx, el.dataset.on, SM.crafting.buyLocations(), null); el.innerHTML = b ? `en línea: <b>${u.fmt(b.price)}</b> · ${u.esc(b.location)} · ${u.esc(SM.market.ageText(b.date))}` : 'sin precio en línea'; });
      u.$('#poFillBox').hidden = false;
      msg.textContent = 'Precios en línea cargados ' + new Date().toLocaleTimeString('es-CL') + ' · Es el más barato entre las ciudades. No reemplaza lo que escribiste.';
    } catch (e) { msg.textContent = '⚠ No pude cargar precios en línea (' + e.message + ').'; msg.className = 'msg small err'; }
    finally { btn.disabled = false; SM.app.busy(false); }
  }
  function fill(all) {
    const u = U(), q = store(); let n = 0;
    u.$$('#poMatGroups [data-mat]').forEach(inp => { if (!all && +inp.value > 0) return; const b = SM.market.cheapestBuy(S.idx, inp.dataset.mat, SM.crafting.buyLocations(), null); if (b) { inp.value = b.price; q.mats[inp.dataset.mat] = b.price; n++; } });
    save(q); count(); u.toast(n + ' precios copiados de los datos en línea');
  }
  async function loadSale() {
    const u = U(), btn = u.$('#poLoadSale'), c = cfg();
    btn.disabled = true; SM.app.busy(true);
    try {
      const ids = families().flatMap(f => f.items.map(i => i.item_id));
      const pr = await SM.api.getPrices(ids, [c.city], [1]); SM.market.index(pr.rows, S.idx); S.loaded = true;
      const q = store(); let n = 0;
      ids.forEach(id => { if (q.sale[id] > 0) return; const r = SM.market.row(S.idx, id, c.city, 1), o = c.mode === 'order' ? SM.market.sellOrder(r) : SM.market.buyOrder(r); if (o) { q.sale[id] = o.price; n++; } });
      save(q); table(); u.toast(n ? n + ' precios de venta tomados de ' + c.city : 'No había precios de venta nuevos en ' + c.city);
    } catch (e) { u.toast('No pude cargar precios en línea: ' + e.message, 'err'); }
    finally { btn.disabled = false; SM.app.busy(false); }
  }

  SM.views = SM.views || {};
  SM.views.potions = { init, families, materials };
})(typeof window !== 'undefined' ? window : globalThis);
