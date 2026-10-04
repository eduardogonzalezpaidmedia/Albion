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
    u.$('#poSubTable').hidden = k !== 'table'; u.$('#poSubMats').hidden = k !== 'mats'; u.$('#poSubRemains').hidden = k !== 'remains'; u.$('#poSubConv').hidden = k !== 'conv';
    if (k === 'remains') buildRemains();
    if (k === 'conv') buildConv();
    if (k === 'mats') u.$$('#poMatGroups [data-mat]').forEach(i => { const v = store().mats[i.dataset.mat]; i.value = v || ''; });
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
    Object.entries(convInfo()).forEach(([id, x]) => { if (x.price > 0) man[id] = { price: x.price }; });   // ingredientes raros: precio más barato entre comprar o convertir
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
      const units = Math.max(1, +u.$('#pdUnits').value || 1), { e, ctx } = evalItem(it, units), c = e.calc, mode = cfg().mode, ci = convInfo();
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
        ${c.lines.map(l => `<tr><td>${u.esc(SM.crafting.label(l.item_id))}<br><span class="small muted">${l.perCraft} × ${c.crafts}${l.returnable ? ' · vuelven ' + u.fmtQ(l.recovered) : ' · no retorna'}</span>${(ci[l.item_id] && ci[l.item_id].from) ? '<br><span class="small pos">convirtiendo desde T' + ci[l.item_id].from + '</span>' : ''}</td><td class="n">${l.toBuy === null ? '—' : l.toBuy.toLocaleString('es-CL')}</td><td class="n">${l.price === null ? '<span class="warn">falta</span>' : u.fmt(l.price)}</td><td class="n">${l.cost === null ? '—' : u.fmt(l.cost)}</td></tr>`).join('')}</tbody></table></div>
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

  /* ---------- restos de animales raros ----------
     Cada ingrediente raro se puede convertir en «Restos de animales raros». Cuántos restos da cada tier lo indica
     el usuario (por defecto lo que ella informó: T3 = 5, T5 = 10, T7 = 25) y se puede cambiar. No es un dato de los archivos del juego. */
  const REMAINS = 'T1_ALCHEMY_COMMON', YKEY = 'remains-yield';
  const yields = () => Object.assign({ 3: 5, 5: 10, 7: 25 }, SM.storage.get(YKEY, {}));
  function rareRows() {
    const g = materials().find(x => x.key === 'rare');
    return g ? g.sub.map(s2 => ({ key: s2.key, label: s2.items[s2.items.length - 1].name.replace(/\s+(dur[oa]s?|fin[oa]s?|excelentes?|diluida|potente)$/i, ''), byTier: Object.fromEntries(s2.items.map(m => [m.tier, m.id])) })) : [];
  }
  function buildRemains() {
    const u = U(), p = store(), y = yields(), rows = rareRows();
    const groups = {};
    rows.forEach(r => { const k = Object.keys(r.byTier).map(Number).sort((a, b) => a - b).join(','); (groups[k] = groups[k] || []).push(r); });
    u.$('#poYield').innerHTML = `<div class="fields"><label class="field"><span class="lbl">Precio de los restos en el mercado</span><input type="number" min="0" inputmode="numeric" id="poRemPrice" value="${p.mats[REMAINS] || ''}" placeholder="opcional"><span class="hint">Para comparar con comprarlos directo.</span></label></div>`;
    u.$('#poRemTable').innerHTML = Object.keys(groups).sort().map(k => {
      const tiers = k.split(',').map(Number), rs = groups[k], known = tiers.some(t => y[t] > 0);
      return `<div class="rem-group"><h3>${rs.length > 1 ? 'Ingredientes de criaturas' : u.esc(rs[0].label)} <span class="small muted">${tiers.map(t => 'T' + t).join(' · ')}</span></h3>
        <div class="rem-y">${tiers.map(t => `<label><span>Un T${t} da</span><input type="number" min="0" inputmode="numeric" data-y="${t}" value="${y[t] || ''}" placeholder="?"><span>restos</span></label>`).join('')}</div>
        ${known ? '' : '<p class="small warn">No tengo el dato de cuántos restos da este ingrediente. Si lo conviertes en el juego, anótalo arriba.</p>'}
        <div class="tablewrap"><table class="grid-table po-table cr-in po-rem"><thead><tr><th>Ingrediente</th>${tiers.map(t => `<th class="n">T${t}</th>`).join('')}</tr></thead><tbody>
        ${rs.map(r => `<tr><td class="cr-name">${u.esc(r.label)}</td>${tiers.map(t => `<td data-cell="${u.esc(r.byTier[t])}" data-t="${t}"><input type="number" min="0" inputmode="numeric" data-mat="${u.esc(r.byTier[t])}" value="${p.mats[r.byTier[t]] || ''}" placeholder="precio" aria-label="${u.esc(r.label)} T${t}"><span class="rem-c" data-c></span></td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    }).join('');
    u.$$('#poRemTable [data-y]').forEach(inp => inp.addEventListener('input', () => { const q = SM.storage.get(YKEY, {}); q[inp.dataset.y] = +inp.value || 0; SM.storage.set(YKEY, q); remCalc(); }));
    u.$('#poRemPrice').addEventListener('input', () => { const q = store(), v = +u.$('#poRemPrice').value; if (v > 0) q.mats[REMAINS] = v; else delete q.mats[REMAINS]; save(q); remCalc(); });
    u.$$('#poRemTable [data-mat]').forEach(inp => inp.addEventListener('input', () => { const q = store(), v = +inp.value; if (v > 0) q.mats[inp.dataset.mat] = v; else delete q.mats[inp.dataset.mat]; save(q); remCalc(); }));
    u.$('#poRemLoad').onclick = remLoad;
    remCalc();
  }
  /** Costo de cada resto = precio del ingrediente ÷ restos que da. Marca el más barato. */
  function remCalc() {
    const u = U(), p = store(), y = yields(), list = [];
    u.$$('#poRemTable [data-cell]').forEach(td => {
      const id = td.dataset.cell, t = +td.dataset.t, price = p.mats[id], n = y[t], el = td.querySelector('[data-c]');
      td.classList.remove('rem-best');
      if (!(n > 0)) { el.textContent = '× ?'; el.className = 'rem-c warn'; return; }
      if (!(price > 0)) { el.textContent = '× ' + n; el.className = 'rem-c muted'; return; }
      const c = price / n; list.push({ id, t, c, td, price, n });
      el.innerHTML = `<b>${u.fmtQ(c)}</b> c/u`; el.className = 'rem-c';
    });
    list.sort((a, b) => a.c - b.c);
    const out = u.$('#poRemOut'), market = p.mats[REMAINS];
    if (!list.length) { out.innerHTML = '<p class="muted">Escribe el precio de los ingredientes para ver cuánto te cuesta cada resto.</p>'; return; }
    const best = list[0]; best.td.classList.add('rem-best');
    const k = (l, val, s2, cls) => `<div class="kpi ${cls || ''}"><span class="lbl">${l}</span><b>${val}</b><span class="s">${s2 || ''}</span></div>`;
    let cmp = '';
    if (market > 0) cmp = best.c < market ? `<div class="sp-verdict v-yes"><b>CONVIENE CONVERTIR</b><span>Con ${u.esc(SM.crafting.label(best.id))} cada resto te sale ${u.fmtQ(best.c)}; comprarlo directo cuesta ${u.fmt(market)}. Ahorras ${u.fmtQ(market - best.c)} por resto (${u.pct((market - best.c) / market * 100)}).</span></div>`
      : `<div class="sp-verdict v-no"><b>CONVIENE COMPRAR LOS RESTOS</b><span>En el mercado cuestan ${u.fmt(market)} y el ingrediente más barato los deja a ${u.fmtQ(best.c)}.</span></div>`;
    out.innerHTML = `${cmp}<div class="kpis">
        ${k('Más barato', u.fmtQ(best.c), `por resto · ${u.esc(SM.crafting.label(best.id))} a ${u.fmt(best.price)} ÷ ${best.n}`, 'pos')}
        ${list[1] ? k('Segundo', u.fmtQ(list[1].c), u.esc(SM.crafting.label(list[1].id))) : ''}
        ${k('Más caro', u.fmtQ(list[list.length - 1].c), u.esc(SM.crafting.label(list[list.length - 1].id)))}
        ${market > 0 ? k('Restos en el mercado', u.fmt(market), 'precio que escribiste') : ''}
      </div>
      <h3>De más barato a más caro</h3>
      <ol class="miss-list rem-rank">${list.map(x => `<li><span>${u.esc(SM.crafting.label(x.id))}</span><span><b>${u.fmtQ(x.c)}</b> <span class="small muted">(${u.fmt(x.price)} ÷ ${x.n})</span>${market > 0 ? (x.c < market ? ' <span class="pos small">conviene</span>' : ' <span class="neg small">más caro</span>') : ''}</span></li>`).join('')}</ol>`;
  }
  async function remLoad() {
    const u = U(), btn = u.$('#poRemLoad'), msg = u.$('#poRemMsg');
    btn.disabled = true; SM.app.busy(true); msg.textContent = 'Cargando precios en línea…';
    try {
      const ids = u.$$('#poRemTable [data-mat]').map(i => i.dataset.mat).concat([REMAINS]);
      const pr = await SM.api.getPrices(ids, SM.crafting.buyLocations(), [1]); SM.market.index(pr.rows, S.idx);
      const q = store(); let n = 0;
      u.$$('#poRemTable [data-mat]').forEach(inp => { if (+inp.value > 0) return; const b = SM.market.cheapestBuy(S.idx, inp.dataset.mat, SM.crafting.buyLocations(), null); if (b) { inp.value = b.price; q.mats[inp.dataset.mat] = b.price; n++; } });
      const rp = u.$('#poRemPrice'); if (!(+rp.value > 0)) { const b = SM.market.cheapestBuy(S.idx, REMAINS, SM.crafting.buyLocations(), null); if (b) { rp.value = b.price; q.mats[REMAINS] = b.price; n++; } }
      save(q); remCalc();
      msg.textContent = n + ' casillas vacías rellenadas con el precio en línea más barato (' + new Date().toLocaleTimeString('es-CL') + ') · No cambia lo que ya habías escrito.';
    } catch (e) { msg.textContent = '⚠ No pude cargar precios en línea (' + e.message + ').'; }
    finally { btn.disabled = false; SM.app.busy(false); }
  }

  /* ---------- conversión de ingredientes raros ----------
     Según indicó la usuaria: 1 ingrediente T7 se convierte en 2 de T5, y 1 de T5 en 2 de T3 (cantidades editables).
     En los cálculos de pociones cada ingrediente usa el precio más barato entre comprarlo directo o sacarlo del tier superior. */
  const CKEY = 'ingredient-conv';
  const conv = () => Object.assign({ on: true, r75: 2, r53: 2 }, SM.storage.get(CKEY, {}));
  /** { item_id: { direct, price, from } } — price = lo que se usa; from = tier del que conviene convertir (o null). */
  function convInfo() {
    const c = conv(), p = store(), out = {};
    rareRows().forEach(r => {
      if (!(r.byTier[7] && r.byTier[5] && r.byTier[3])) return;          // Sangre de Dragón: no se indicó conversión
      const d7 = p.mats[r.byTier[7]] || null, d5 = p.mats[r.byTier[5]] || null, d3 = p.mats[r.byTier[3]] || null;
      const pick = (direct, alt, from) => { const use = c.on && alt !== null && (direct === null || alt < direct); return { direct, alt, price: use ? alt : direct, from: use ? from : null }; };
      const e5 = pick(d5, d7 !== null && c.r75 > 0 ? d7 / c.r75 : null, 7);
      const e3 = pick(d3, e5.price !== null && c.r53 > 0 ? e5.price / c.r53 : null, e5.from === 7 ? 7 : 5);
      out[r.byTier[7]] = { direct: d7, alt: null, price: d7, from: null };
      out[r.byTier[5]] = e5; out[r.byTier[3]] = e3;
    });
    return out;
  }
  function buildConv() {
    const u = U(), c = conv(), p = store(), rows = rareRows().filter(r => r.byTier[7]);
    u.$('#poConvOpts').innerHTML = `<div class="fields">
      <label class="field"><span class="lbl">Usar en los cálculos</span><span class="check"><input id="cvOn" type="checkbox"${c.on ? ' checked' : ''}> Tomar el precio más barato (comprar o convertir)</span></label>
      <label class="field"><span class="lbl">1 de T7 da … de T5</span><input id="cv75" type="number" min="0" step="any" inputmode="numeric" value="${c.r75}"></label>
      <label class="field"><span class="lbl">1 de T5 da … de T3</span><input id="cv53" type="number" min="0" step="any" inputmode="numeric" value="${c.r53}"></label></div>`;
    u.$('#poConvTable').innerHTML = `<div class="tablewrap"><table class="grid-table po-table cr-in po-rem"><thead><tr><th>Ingrediente</th><th class="n">T3</th><th class="n">T5</th><th class="n">T7</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="cr-name">${u.esc(r.label)}</td>${[3, 5, 7].map(t => `<td data-cv="${u.esc(r.byTier[t])}"><input type="number" min="0" inputmode="numeric" data-mat="${u.esc(r.byTier[t])}" value="${p.mats[r.byTier[t]] || ''}" placeholder="precio" aria-label="${u.esc(r.label)} T${t}"><span class="rem-c" data-c></span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const saveC = () => { SM.storage.set(CKEY, { on: u.$('#cvOn').checked, r75: +u.$('#cv75').value || 0, r53: +u.$('#cv53').value || 0 }); convCalc(); };
    u.$('#cvOn').addEventListener('change', saveC); u.$('#cv75').addEventListener('input', saveC); u.$('#cv53').addEventListener('input', saveC);
    u.$$('#poConvTable [data-mat]').forEach(inp => inp.addEventListener('input', () => { const q = store(), v = +inp.value; if (v > 0) q.mats[inp.dataset.mat] = v; else delete q.mats[inp.dataset.mat]; save(q); convCalc(); }));
    convCalc();
  }
  function convCalc() {
    const u = U(), info = convInfo(), c = conv(); let n = 0, saved = [];
    u.$$('#poConvTable [data-cv]').forEach(td => {
      const x = info[td.dataset.cv], el = td.querySelector('[data-c]'); td.classList.remove('rem-best');
      if (!x || x.alt === null || x.alt === undefined) { el.textContent = ''; return; }
      const src = 'T' + (td.dataset.cv.match(/^T(\d)/)[1] === '5' ? 7 : 5);
      if (x.from) { n++; td.classList.add('rem-best'); el.innerHTML = `<b>${u.fmtQ(x.alt)}</b> desde T${x.from}`; if (x.direct) saved.push({ id: td.dataset.cv, pct: (x.direct - x.alt) / x.direct * 100, from: x.from, alt: x.alt, direct: x.direct }); }
      else { el.innerHTML = `${u.fmtQ(x.alt)} desde ${src}`; el.className = 'rem-c muted'; return; }
      el.className = 'rem-c';
    });
    saved.sort((a, b) => b.pct - a.pct);
    u.$('#poConvOut').innerHTML = !c.on ? '<p class="muted">La conversión está desactivada: las pociones se calculan solo con el precio de compra de cada ingrediente.</p>'
      : n ? `<p><b>${n}</b> ingrediente(s) salen más baratos convirtiendo (marcados en verde). Las pociones ya se calculan con ese precio.</p>${saved.length ? `<ol class="miss-list rem-rank">${saved.map(x => `<li><span>${u.esc(SM.crafting.label(x.id))}</span><span><b class="pos">${u.fmtQ(x.alt)}</b> desde T${x.from} <span class="small muted">en vez de ${u.fmt(x.direct)} · ahorras ${u.pct(x.pct)}</span></span></li>`).join('')}</ol>` : ''}`
        : '<p class="muted">Con los precios actuales ningún ingrediente sale más barato convirtiendo. Escribe los precios de T5 y T7 para comparar.</p>';
  }

  SM.views = SM.views || {};
  SM.views.potions = { init, families, materials, yields, convInfo };
})(typeof window !== 'undefined' ? window : globalThis);
