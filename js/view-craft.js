/* Silver Master — Fabricación (v1.9): armas, armaduras, cascos, botas, secundarias, bolsos y capas en tabla.
   Igual que Pociones: eliges una categoría, anotas los precios de materiales y ves el costo (o la ganancia)
   de cada objeto por tier y encantamiento. Mismo motor que la Calculadora (SM.engine.evaluate). */
(function (root) {
  const SM = root.SM = root.SM || {};
  const U = () => SM.ui;
  const KEY = 'craft-prices', CFG = 'craft-settings';
  const S = { sub: 'table', cat: null, idx: {}, loaded: false, show: 'cost' };
  const CATS = [
    { label: 'Armas', subs: [['sword', 'Espadas'], ['axe', 'Hachas'], ['mace', 'Mazas'], ['hammer', 'Martillos'], ['knuckles', 'Guantes de guerra'], ['crossbow', 'Ballestas'], ['bow', 'Arcos'], ['spear', 'Lanzas'], ['dagger', 'Dagas'], ['quarterstaff', 'Bastones de combate'], ['naturestaff', 'Bastones de naturaleza'], ['shapeshifterstaff', 'Bastones cambiaformas'], ['firestaff', 'Bastones de fuego'], ['froststaff', 'Bastones de escarcha'], ['arcanestaff', 'Bastones arcanos'], ['holystaff', 'Bastones sagrados'], ['cursestaff', 'Bastones malditos']] },
    { label: 'Secundarias', subs: [['shieldtype', 'Escudos'], ['booktype', 'Tomos'], ['torchtype', 'Antorchas']] },
    { label: 'Armadura de placas', subs: [['plate_helmet', 'Yelmos de placas'], ['plate_armor', 'Armaduras de placas'], ['plate_shoes', 'Botas de placas']] },
    { label: 'Armadura de cuero', subs: [['leather_helmet', 'Capuchas de cuero'], ['leather_armor', 'Chaquetas de cuero'], ['leather_shoes', 'Zapatos de cuero']] },
    { label: 'Armadura de tela', subs: [['cloth_helmet', 'Capuchas de tela'], ['cloth_armor', 'Túnicas de tela'], ['cloth_shoes', 'Sandalias de tela']] },
    { label: 'Accesorios', subs: [['bags', 'Bolsos'], ['satchels', 'Morrales'], ['accessoires_capes_capes', 'Capas'], ['accessoires_capes_brecilien', 'Capas de Brecilien'], ['accessoires_capes_avalon', 'Capas avalonianas']] }
  ];
  const GEAR = ['weapons', 'offhands', 'armor', 'head', 'shoes', 'bags', 'capes'];
  const REFINED = [['METALBAR', 'Lingotes'], ['PLANKS', 'Tablas'], ['LEATHER', 'Cuero'], ['CLOTH', 'Tela']];
  const isRefined = id => /^T\d_(METALBAR|PLANKS|LEATHER|CLOTH)(_LEVEL\d@\d)?$/.test(id);
  const strip = n => n.replace(/\s+(del|de la|de)\s+(novato|oficial|iniciado|experto|maestro|gran maestro|anciano)$/i, '');
  const tierOf = id => +(/^T(\d)/.exec(id) || /_T(\d)$/.exec(id) || [0, 0])[1];
  /** Material que es a su vez un objeto fabricable de estas categorías (ej.: los zapatos base de unos zapatos reales). */
  const gearMat = id => { const it = SM.crafting.item(id); return it && GEAR.includes(it.category) && SM.crafting.recipe(id) ? it : null; };

  const store = () => Object.assign({ mats: {}, sale: {} }, SM.storage.get(KEY, {}));
  const save = p => SM.storage.set(KEY, p);
  const cfg = () => { const P = SM.storage.profile(); return Object.assign({ bonus: 'no', daily: 0, focus: !!P.focus, premium: !!P.premium, fee: 0, mode: 'order', city: P.city, cat: 'leather_shoes' }, SM.storage.get(CFG, {})); };
  const setCfg = o => SM.storage.set(CFG, Object.assign(cfg(), o));

  const famCache = {};
  /** Familias de una subcategoría: mismo objeto en distintos tiers y encantamientos. */
  function families(sub) {
    if (famCache[sub]) return famCache[sub];
    const g = {};
    SM.data.items.filter(it => GEAR.includes(it.category) && it.subcategory === sub && it.name !== it.item_id).forEach(it => {
      const base = it.item_id.split('@')[0].replace(/^T\d_/, '');
      (g[base] = g[base] || { key: base, items: [] }).items.push(it);
    });
    const out = Object.values(g).map(f => {
      f.items.sort((a, b) => a.tier - b.tier || a.enchantment - b.enchantment);
      f.tiers = [...new Set(f.items.map(i => i.tier))];
      f.label = strip(f.items[f.items.length - 1].name);
      f.art = f.items.some(i => (SM.crafting.recipe(i.item_id) || { materials: [] }).materials.some(m => !isRefined(m.item_id)));
      return f;
    }).sort((a, b) => a.art - b.art || a.key.localeCompare(b.key));
    return famCache[sub] = out;
  }
  /** Materiales no refinados (artefactos, fichas, etc.) de una subcategoría: filas por tipo, columnas por tier. */
  function extras(sub) {
    const g = {};
    families(sub).forEach(f => f.items.forEach(it => (SM.crafting.recipe(it.item_id) || { materials: [] }).materials.forEach(m => {
      if (isRefined(m.item_id) || gearMat(m.item_id)) return;
      const k = m.item_id.replace(/^T\d_/, '').replace(/_T\d$/, '');
      const r = g[k] = g[k] || { key: k, byTier: {}, label: '' };
      r.byTier[tierOf(m.item_id)] = m.item_id;
    })));
    return Object.values(g).map(r => { const ts = Object.keys(r.byTier).map(Number).sort(); r.label = strip(SM.crafting.name(r.byTier[ts[ts.length - 1]])); return r; }).sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }

  function init() {
    const u = U(), c = cfg();
    S.cat = c.cat;
    u.$('#crNav').onclick = e => { const b = e.target.closest('[data-sub]'); if (b) sub(b.dataset.sub); };
    u.$('#crCat').innerHTML = CATS.map(g => `<optgroup label="${u.esc(g.label)}">${g.subs.map(([v, l]) => `<option value="${v}"${v === S.cat ? ' selected' : ''}>${u.esc(l)}</option>`).join('')}</optgroup>`).join('');
    const pickCat = v => { S.cat = v; setCfg({ cat: v }); S.loaded = false; u.$('#crCat').value = v; u.$$('#crSide [data-cat]').forEach(b => { if (b.dataset.cat === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }); table(); };
    u.$('#crCat').onchange = () => pickCat(u.$('#crCat').value);
    u.$('#crSide').innerHTML = CATS.map(g => `<div class="side-g"><h3>${u.esc(g.label)}</h3>${g.subs.map(([v, l]) => `<button type="button" data-cat="${v}"${v === S.cat ? ' aria-current="page"' : ''}>${u.esc(l)}</button>`).join('')}</div>`).join('');
    u.$('#crSide').onclick = e => { const b = e.target.closest('[data-cat]'); if (b) { pickCat(b.dataset.cat); window.scrollTo({ top: 0 }); } };
    buildSettings(); buildRefined();
    u.$('#crShow').onchange = () => { S.show = u.$('#crShow').value; table(); };
    u.$('#crMissing').onclick = e => { if (e.target.closest('a')) { e.preventDefault(); sub('mats'); } };
    u.$('#crLoadSale').onclick = loadSale;
    u.$('#crLoadExtra').onclick = loadExtras;
    sub('table');
  }
  function sub(k) {
    const u = U(); S.sub = k;
    u.$$('#crNav button').forEach(b => { if (b.dataset.sub === k) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    u.$('#crSubTable').hidden = k !== 'table'; u.$('#crSubMats').hidden = k !== 'mats';
    if (k === 'table') table();
    window.scrollTo({ top: 0 });
  }

  function buildSettings() {
    const u = U(), c = cfg(), cities = SM.crafting.marketLocations().map(l => ({ value: l, label: l === 'Black Market' ? 'Mercado Negro' : l }));
    u.$('#crSettings').innerHTML = `<div class="fields">
      <label class="field"><span class="lbl">Ubicación</span><select id="ccBonus"><option value="no">Ciudad sin bono</option><option value="yes"${c.bonus === 'yes' ? ' selected' : ''}>Ciudad con bono para esta categoría</option></select></label>
      <label class="field"><span class="lbl">Bono del día</span><select id="ccDaily">${u.options([{ value: 0, label: 'Ninguno' }, { value: 10, label: '+10%' }, { value: 20, label: '+20%' }], c.daily)}</select></label>
      <label class="field"><span class="lbl">Foco</span><span class="check"><input id="ccFocus" type="checkbox"${c.focus ? ' checked' : ''}> Usar foco</span></label>
      <label class="field"><span class="lbl">Tarifa de fabricación (por objeto)</span><input id="ccFee" type="number" min="0" inputmode="numeric" value="${c.fee}"></label>
      <label class="field"><span class="lbl">Tipo de venta</span><select id="ccMode"><option value="order">Publicar orden de venta</option><option value="instant"${c.mode === 'instant' ? ' selected' : ''}>Venta inmediata</option></select></label>
      <label class="field"><span class="lbl">Premium</span><span class="check"><input id="ccPrem" type="checkbox"${c.premium ? ' checked' : ''}> Tengo Premium</span></label>
      <label class="field"><span class="lbl">Dónde vendes (precios en línea)</span><select id="ccCity">${u.options(cities, c.city)}</select></label>
    </div>`;
    const read = () => { setCfg({ bonus: u.$('#ccBonus').value, daily: +u.$('#ccDaily').value, focus: u.$('#ccFocus').checked, premium: u.$('#ccPrem').checked, fee: +u.$('#ccFee').value || 0, mode: u.$('#ccMode').value, city: u.$('#ccCity').value }); table(); };
    ['ccBonus', 'ccDaily', 'ccFocus', 'ccPrem', 'ccMode', 'ccCity'].forEach(id => u.$('#' + id).addEventListener('change', read));
    u.$('#ccFee').addEventListener('input', read);
  }
  const saleMode = c => c.city === 'Black Market' ? 'instant' : c.mode;
  function evalItem(it, units, depth) {
    const c = cfg(), p = store(), man = {};
    Object.entries(p.mats).forEach(([id, v]) => { if (v > 0) man[id] = { price: v }; });
    // si un material es otro objeto fabricable (zapatos base de los reales, capa base), se usa lo que cuesta fabricarlo
    if ((depth || 0) < 2) (SM.crafting.recipe(it.item_id) || { materials: [] }).materials.forEach(m => {
      const g = gearMat(m.item_id); if (!g || man[m.item_id]) return;
      const sub = evalItem(g, 1, (depth || 0) + 1).e.calc;
      if (sub.totalCost !== null) man[m.item_id] = { price: sub.totalCost / sub.made };
    });
    const craftCity = c.city === 'Black Market' ? SM.storage.profile().city : c.city;
    const ctx = SM.engine.context({ craftCity, focus: c.focus, premium: c.premium, dailyBonus: c.daily, bonusOverride: c.bonus === 'yes', units: units || 1, manualPrices: man, manualSale: p.sale[it.item_id] || null,
      saleMode: saleMode(c), maxAgeH: null, buyLocations: [], sellMarkets: [], fee: { value: c.fee, mode: 'per_unit' }, transport: { legs: [], perUnit: 0 } });
    return { e: SM.engine.evaluate(it, {}, ctx), ctx };
  }

  /* ---------- tabla ---------- */
  function table() {
    const u = U(), fams = families(S.cat), p = store(), ex = extras(S.cat);
    // precios de artefactos y otros materiales de esta categoría
    const tiers = [...new Set(ex.flatMap(r => Object.keys(r.byTier).map(Number)))].sort();
    u.$('#crExtraBox').hidden = !ex.length;
    u.$('#crExtra').innerHTML = ex.length ? `<div class="tablewrap"><table class="grid-table po-table cr-in"><thead><tr><th>Material</th>${tiers.map(t => `<th class="n">${t ? 'T' + t : 'Precio'}</th>`).join('')}</tr></thead><tbody>${ex.map(r => `<tr><td class="cr-name">${u.esc(r.label)}</td>${tiers.map(t => r.byTier[t] ? `<td><input type="number" min="0" inputmode="numeric" data-mat="${u.esc(r.byTier[t])}" value="${p.mats[r.byTier[t]] || ''}" placeholder="0" aria-label="${u.esc(r.label)} T${t}"></td>` : '<td></td>').join('')}</tr>`).join('')}</tbody></table></div>` : '';
    u.$$('#crExtra [data-mat]').forEach(inp => inp.addEventListener('input', () => { const q = store(), v = +inp.value; if (v > 0) q.mats[inp.dataset.mat] = v; else delete q.mats[inp.dataset.mat]; save(q); cells(); }));
    const top = f => f.items[f.items.length - 1];
    u.$('#crTable').innerHTML = `<div class="fam-head"><span>Objeto</span><div class="fam-cols"><span>Tier</span>${[0, 1, 2, 3, 4].map(e => `<span class="n">.${e}</span>`).join('')}</div></div>` +
      fams.map(f => `<div class="fam"><div class="fam-id">${SM.ui.icon(top(f).item_id.split('@')[0])}<b>${u.esc(f.label)}</b></div>
        <table class="po-table fam-t"><tbody>${f.tiers.map(t => `<tr><td class="po-t"><span class="tl">Tier </span><span class="ts">T</span>${t}</td>${[0, 1, 2, 3, 4].map(en => { const it = f.items.find(i => i.tier === t && i.enchantment === en); return it ? `<td class="n po-cell" data-it="${u.esc(it.item_id)}"></td>` : '<td class="n muted">–</td>'; }).join('')}</tr>`).join('')}</tbody></table></div>`).join('');
    u.$$('#crTable .po-cell').forEach(td => td.onclick = () => detail(SM.crafting.item(td.dataset.it)));
    cells();
  }
  /** Rellena los números de la tabla sin reconstruirla (no pierdes el foco al escribir precios). */
  function cells() {
    const u = U(), p = store(), missing = new Set(); let n = 0, rate = null;
    u.$$('#crTable .po-cell').forEach(td => {
      const it = SM.crafting.item(td.dataset.it), { e } = evalItem(it), c = e.calc; n++; rate = c.returnRate;
      c.lines.forEach(l => { if (l.price === null && !gearMat(l.item_id)) missing.add(l.item_id); });
      td.className = 'n po-cell';
      if (c.totalCost === null) { td.innerHTML = '<span class="muted">—</span>'; return; }
      const sale = p.sale[it.item_id];
      if (S.show === 'cost') td.innerHTML = `<b>${u.fmt(c.totalCost / c.made)}</b>` + (sale ? `<i class="${c.profit > 0 ? 'pos' : 'neg'}">${c.profit > 0 ? '+' : ''}${u.fmt(c.profitPerUnit)}</i>` : '');
      else if (!sale) td.innerHTML = '<span class="muted small">sin venta</span>';
      else { const v = S.show === 'profit' ? c.profitPerUnit : c.roi; td.classList.add(v > 0 ? 'pos' : 'neg'); td.innerHTML = `<b>${S.show === 'profit' ? u.fmt(v) : u.pct(v)}</b>`; }
    });
    u.$('#crSummary').innerHTML = `${n} recetas · retorno efectivo: <b class="silver">${rate === null ? '—' : u.pct(rate * 100)}</b> · ${S.show === 'cost' ? 'costo por objeto' : S.show === 'profit' ? 'ganancia por objeto' : 'ROI'}`;
    const mb = u.$('#crMissing'); mb.hidden = !missing.size;
    const ref = [...missing].filter(isRefined).length, oth = missing.size - ref;
    mb.innerHTML = `⚠ Faltan precios: ${ref ? ref + ' material(es) refinado(s) — <a href="#">abre Precios de materiales</a>' : ''}${ref && oth ? ' y ' : ''}${oth ? oth + ' artefacto(s) u otros de esta categoría (casillas de abajo)' : ''}.`;
  }

  function detail(it) {
    const u = U();
    u.modal(it.name + ' ' + it.tier + '.' + it.enchantment, `<div class="fields">
        <label class="field"><span class="lbl">Precio de venta (por unidad)</span><input id="cdSale" type="number" min="0" inputmode="numeric" value="${store().sale[it.item_id] || ''}" placeholder="Escríbelo"><span class="hint" id="cdHint"></span></label>
        <label class="field"><span class="lbl">Cantidad a fabricar</span><input id="cdUnits" type="number" min="1" inputmode="numeric" value="10"></label>
      </div><div id="cdOut"></div><div class="btns"><button class="btn sm" id="cdSimple">Abrir en Calculadora sencilla</button><button class="btn sm ghost" id="cdFull">Calculadora completa</button></div>`);
    const draw = () => {
      const units = Math.max(1, +u.$('#cdUnits').value || 1), { e, ctx } = evalItem(it, units), c = e.calc, c2 = cfg(), mode = saleMode(c2);
      const be = c.totalCost !== null ? SM.invest.breakeven(c.totalCost / c.made, mode, ctx.taxPct, ctx.setupPct) : null;
      const miss = c.lines.filter(l => l.price === null).length, sale = store().sale[it.item_id];
      let v;
      if (miss) v = { cls: 'wait', t: 'Faltan precios', d: `Falta el precio de ${miss} material(es).` };
      else if (!sale) v = { cls: 'wait', t: 'Falta el precio de venta', d: `Para no perder: ${u.fmt(Math.ceil(be))} o más por unidad.` };
      else if (c.profit > 0 && c.roi >= 5) v = { cls: 'yes', t: 'RENTABLE', d: `Ganas ${u.fmt(c.profitPerUnit)} por unidad (${u.pct(c.roi)}).` };
      else if (c.profit > 0) v = { cls: 'meh', t: 'RENTABLE, PERO JUSTO', d: `Margen de solo ${u.pct(c.roi)}.` };
      else v = { cls: 'no', t: 'NO ES RENTABLE', d: `Pierdes ${u.fmt(Math.abs(c.profitPerUnit))} por unidad. Mínimo: ${u.fmt(Math.ceil(be))}.` };
      const k = (l, val, s2, cls) => `<div class="kpi ${cls || ''}"><span class="lbl">${l}</span><b>${val}</b><span class="s">${s2 || ''}</span></div>`;
      u.$('#cdOut').innerHTML = `<div class="sp-verdict v-${v.cls}"><b>${v.t}</b><span>${v.d}</span></div>
        <div class="tablewrap"><table class="grid-table po-table"><thead><tr><th>Material</th><th class="n">Comprar</th><th class="n">Precio</th><th class="n">Costo</th></tr></thead><tbody>
        ${c.lines.map(l => `<tr><td>${u.esc(SM.crafting.label(l.item_id))}<br><span class="small muted">${l.perCraft} × ${c.crafts}${l.returnable ? ' · vuelven ' + u.fmtQ(l.recovered) : ' · no retorna'}</span></td><td class="n">${l.toBuy === null ? '—' : l.toBuy.toLocaleString('es-CL')}</td><td class="n">${l.price === null ? '<span class="warn">falta</span>' : u.fmt(l.price)}</td><td class="n">${l.cost === null ? '—' : u.fmt(l.cost)}</td></tr>`).join('')}</tbody></table></div>
        <div class="kpis">
          ${k('Costo total', u.fmt(c.totalCost), c.totalCost === null ? '' : `${c.made} u · materiales ${u.fmt(c.materialCost)}${c.craftingFee ? ' + tarifa ' + u.fmt(c.craftingFee) : ''}`)}
          ${k('Costo por unidad', c.totalCost === null ? 'Sin datos' : u.fmt(c.totalCost / c.made), 'retorno ' + u.pct(c.returnRate * 100))}
          ${k('Ingreso neto', u.fmt(c.sale ? c.sale.net : null), c.sale ? `impuesto ${u.fmt(c.sale.tax)}${c.sale.setup ? ' + publicación ' + u.fmt(c.sale.setup) : ''}` : '')}
          ${k('Ganancia del lote', u.fmt(c.profit), c.roi === null ? '' : 'ROI ' + u.pct(c.roi), c.profit > 0 ? 'pos' : c.profit < 0 ? 'neg' : '')}
          ${k('Precio mínimo', be === null ? 'Sin datos' : u.fmt(Math.ceil(be)), 'para no perder')}
        </div>`;
      const r = S.loaded ? SM.market.row(S.idx, it.item_id, c2.city, 1) : null, o = r ? (mode === 'order' ? SM.market.sellOrder(r) : SM.market.buyOrder(r)) : null;
      u.$('#cdHint').innerHTML = o ? `En línea en ${u.esc(c2.city === 'Black Market' ? 'Mercado Negro' : c2.city)}: <b>${u.fmt(o.price)}</b> ${u.ageBadge(o.date)} <button type="button" class="btn sm" id="cdUse">Usar</button>` : '';
      const b = u.$('#cdUse'); if (b) b.onclick = () => { u.$('#cdSale').value = o.price; u.$('#cdSale').dispatchEvent(new Event('input')); };
    };
    u.$('#cdSale').addEventListener('input', () => { const p = store(), val = +u.$('#cdSale').value; if (val > 0) p.sale[it.item_id] = val; else delete p.sale[it.item_id]; save(p); draw(); cells(); });
    u.$('#cdUnits').addEventListener('input', draw);
    u.$('#cdSimple').onclick = () => { u.closeModal(); SM.views.simple.open(it, { man: Object.assign({}, store().mats), focus: cfg().focus }); };
    u.$('#cdFull').onclick = () => { u.closeModal(); SM.views.calc.open(it, true, { units: +u.$('#cdUnits').value || 10, focus: cfg().focus }); };
    draw();
  }

  /* ---------- precios de materiales refinados ---------- */
  const refId = (res, t, e) => `T${t}_${res}` + (e ? `_LEVEL${e}@${e}` : '');
  function buildRefined() {
    const u = U(), p = store();
    u.$('#crMatGroups').innerHTML = REFINED.map(([res, label]) => `<section class="po-group"><h3>${label}</h3><div class="tablewrap"><table class="grid-table po-table cr-in"><thead><tr><th>Tier</th>${[0, 1, 2, 3, 4].map(e => `<th class="n">.${e}</th>`).join('')}</tr></thead><tbody>
      ${[2, 3, 4, 5, 6, 7, 8].map(t => `<tr><td class="po-t">T${t}</td>${[0, 1, 2, 3, 4].map(e => { const id = refId(res, t, e); return SM.crafting.item(id) || SM.crafting.name(id) !== id ? `<td><input type="number" min="0" inputmode="numeric" data-mat="${id}" value="${p.mats[id] || ''}" placeholder="0" aria-label="${label} T${t}.${e}"><span class="cr-on small muted" data-on="${id}"></span></td>` : '<td></td>'; }).join('')}</tr>`).join('')}</tbody></table></div></section>`).join('');
    u.$$('#crMatGroups [data-mat]').forEach(inp => inp.addEventListener('input', () => { const q = store(), v = +inp.value; if (v > 0) q.mats[inp.dataset.mat] = v; else delete q.mats[inp.dataset.mat]; save(q); count(); }));
    u.$('#crLoadMats').onclick = loadMats;
    u.$('#crFill').onclick = () => fill('#crMatGroups', false);
    u.$('#crFillAll').onclick = () => fill('#crMatGroups', true);
    u.$('#crClearMats').onclick = () => { u.$('#crClearC').hidden = false; };
    u.$('#crClearYes').onclick = () => { const q = store(); u.$$('#crMatGroups [data-mat]').forEach(i => { delete q.mats[i.dataset.mat]; i.value = ''; }); save(q); u.$('#crClearC').hidden = true; count(); u.toast('Precios de materiales refinados borrados'); };
    count();
  }
  function count() { const u = U(), all = u.$$('#crMatGroups [data-mat]'); u.$('#crMatCount').textContent = `${all.filter(i => +i.value > 0).length} de ${all.length} materiales con precio. Se guardan solos en este dispositivo.`; }
  async function fetchInto(ids, msgEl, btn) {
    const u = U(); btn.disabled = true; SM.app.busy(true); if (msgEl) { msgEl.textContent = 'Cargando precios en línea…'; msgEl.className = 'msg small'; }
    try { const pr = await SM.api.getPrices(ids, SM.crafting.buyLocations(), [1]); SM.market.index(pr.rows, S.idx); return true; }
    catch (e) { if (msgEl) { msgEl.textContent = '⚠ No pude cargar precios en línea (' + e.message + ').'; msgEl.className = 'msg small err'; } else u.toast('No pude cargar precios: ' + e.message, 'err'); return false; }
    finally { btn.disabled = false; SM.app.busy(false); }
  }
  async function loadMats() {
    const u = U(), msg = u.$('#crMatMsg');
    if (!await fetchInto(u.$$('#crMatGroups [data-mat]').map(i => i.dataset.mat), msg, u.$('#crLoadMats'))) return;
    u.$$('#crMatGroups [data-on]').forEach(el => { const b = SM.market.cheapestBuy(S.idx, el.dataset.on, SM.crafting.buyLocations(), null); el.textContent = b ? u.fmt(b.price) + ' ' + b.location.slice(0, 4) + '.' : 'sin dato'; });
    u.$('#crFillBox').hidden = false;
    msg.textContent = 'Precios en línea cargados ' + new Date().toLocaleTimeString('es-CL') + ' · Bajo cada casilla: el más barato y la ciudad. No reemplaza lo que escribiste.';
  }
  function fill(scope, all) {
    const u = U(), q = store(); let n = 0;
    u.$$(scope + ' [data-mat]').forEach(inp => { if (!all && +inp.value > 0) return; const b = SM.market.cheapestBuy(S.idx, inp.dataset.mat, SM.crafting.buyLocations(), null); if (b) { inp.value = b.price; q.mats[inp.dataset.mat] = b.price; n++; } });
    save(q); if (scope === '#crMatGroups') count(); else cells(); u.toast(n + ' precios copiados de los datos en línea');
  }
  async function loadExtras() {
    const u = U(), ids = u.$$('#crExtra [data-mat]').map(i => i.dataset.mat);
    if (!ids.length || !await fetchInto(ids, null, u.$('#crLoadExtra'))) return;
    fill('#crExtra', false);
  }
  async function loadSale() {
    const u = U(), btn = u.$('#crLoadSale'), c = cfg(), mode = saleMode(c);
    btn.disabled = true; SM.app.busy(true);
    try {
      const ids = families(S.cat).flatMap(f => f.items.map(i => i.item_id));
      const pr = await SM.api.getPrices(ids, [c.city], [1]); SM.market.index(pr.rows, S.idx); S.loaded = true;
      const q = store(); let n = 0;
      ids.forEach(id => { if (q.sale[id] > 0) return; const r = SM.market.row(S.idx, id, c.city, 1), o = mode === 'order' ? SM.market.sellOrder(r) : SM.market.buyOrder(r); if (o) { q.sale[id] = o.price; n++; } });
      save(q); cells(); u.toast(n ? n + ' precios de venta tomados de ' + (c.city === 'Black Market' ? 'Mercado Negro' : c.city) : 'No había precios de venta nuevos');
    } catch (e) { u.toast('No pude cargar precios en línea: ' + e.message, 'err'); }
    finally { btn.disabled = false; SM.app.busy(false); }
  }

  SM.views = SM.views || {};
  SM.views.craft = { init, families, extras, CATS };
})(typeof window !== 'undefined' ? window : globalThis);
