/* Silver Master — utilidades de interfaz y componentes compartidos. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = v => typeof v === 'number' && isFinite(v);
  const fmt = n => isNum(n) ? Math.round(n).toLocaleString('es-CL') : 'Sin datos';
  const fmtQ = n => isNum(n) ? (Math.round(n * 100) / 100).toLocaleString('es-CL') : 'Sin datos';
  const pct = n => isNum(n) ? n.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + '%' : 'Sin datos';
  const signCls = n => isNum(n) ? (n > 0 ? 'pos' : n < 0 ? 'neg' : '') : 'muted';

  function ageBadge(date) {
    const a = SM.market.ageClass(date, SM.data.settings.data_age_minutes);
    return `<span class="age age-${a.key}" title="Última actualización: ${esc(SM.market.ageText(date))}">${esc(a.key === 'none' ? 'Sin datos' : SM.market.ageText(date))}</span>`;
  }
  function ageBadgeMin(minutes) {
    if (minutes === null || minutes === undefined) return '<span class="age age-none">Sin datos</span>';
    const d = new Date(Date.now() - minutes * 60000).toISOString().slice(0, 19);
    return ageBadge(d);
  }
  const confBadge = c => c ? `<span class="conf conf-${esc(c.toLowerCase())}" title="Indicador orientativo, no es garantía">${esc(c)}</span>` : '<span class="muted">—</span>';

  let toastT;
  function toast(msg, kind) {
    let el = $('#toast');
    el.textContent = msg; el.className = 'toast show ' + (kind || '');
    clearTimeout(toastT); toastT = setTimeout(() => el.className = 'toast', 4200);
  }

  function modal(title, html) {
    const m = $('#modal');
    $('#modalTitle').textContent = title; $('#modalBody').innerHTML = html;
    m.hidden = false; $('#modalClose').focus();
  }
  function closeModal() { $('#modal').hidden = true; }

  /** Tabla ordenable. cols: [{key,label,num,get,html,sort}] */
  function table(el, rows, cols, opts) {
    opts = opts || {};
    const st = el._st || (el._st = { key: opts.sortKey || null, dir: -1 });
    const sorted = rows.slice();
    const col = cols.find(c => c.key === st.key);
    if (col) {
      const g = col.sort || col.get;
      sorted.sort((a, b) => { const va = g(a), vb = g(b); if (va === null || va === undefined) return 1; if (vb === null || vb === undefined) return -1; return (va > vb ? 1 : va < vb ? -1 : 0) * st.dir; });
    }
    const limit = opts.limit || 200;
    el.innerHTML = `<div class="tablewrap"><table class="grid-table">
      <thead><tr>${cols.map(c => `<th class="${c.num ? 'n' : ''}${c.sortable === false ? '' : ' sortable'}" data-k="${c.key}"${st.key === c.key ? ' aria-sort="' + (st.dir < 0 ? 'descending' : 'ascending') + '"' : ''}>${esc(c.label)}${st.key === c.key ? (st.dir < 0 ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead>
      <tbody>${sorted.slice(0, limit).map((r, i) => `<tr data-i="${rows.indexOf(r)}" ${opts.onRow ? 'tabindex="0" class="clickable"' : ''}>${cols.map(c => `<td class="${c.num ? 'n' : ''}">${c.html ? c.html(r) : esc(c.get(r))}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="muted empty">${esc(opts.empty || 'Sin resultados')}</td></tr>`}</tbody>
    </table></div>${sorted.length > limit ? `<p class="muted small">Mostrando ${limit} de ${sorted.length}. Exporta para ver todo.</p>` : ''}`;
    $$('th.sortable', el).forEach(th => th.onclick = () => { const k = th.dataset.k; if (st.key === k) st.dir *= -1; else { st.key = k; st.dir = -1; } table(el, rows, cols, opts); });
    if (opts.onRow) $$('tbody tr[data-i]', el).forEach(tr => {
      const go = e => { if (e.target.closest('button,a,input,select')) return; opts.onRow(rows[+tr.dataset.i]); };
      tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(e); };
    });
  }

  /** Buscador de objetos con sugerencias. */
  function itemPicker(host, onSelect, opts) {
    opts = opts || {};
    host.innerHTML = `<div class="picker">
      <input type="search" class="picker-in" placeholder="${esc(opts.placeholder || 'Buscar objeto: «espada ancha 6.1», «capucha mercenario», «poción curación»…')}" autocomplete="off" aria-label="Buscar objeto">
      <div class="picker-list" role="listbox" hidden></div></div>`;
    const inp = $('.picker-in', host), list = $('.picker-list', host);
    let res = [], active = -1;
    const filter = it => !opts.filter || opts.filter(it);
    function render() {
      list.innerHTML = res.map((it, i) => `<div class="opt${i === active ? ' active' : ''}" role="option" data-i="${i}"><span>${esc(it.name)}</span><span class="tag">T${it.tier}.${it.enchantment}</span><span class="muted small">${esc(SM.crafting.CATEGORY_LABEL[it.category] || it.category)}</span></div>`).join('') || '<div class="muted small pad">Sin coincidencias</div>';
      list.hidden = false;
    }
    inp.oninput = () => { res = SM.crafting.search(inp.value, 60).filter(filter).slice(0, 30); active = -1; if (inp.value.trim()) render(); else list.hidden = true; };
    inp.onkeydown = e => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { active = Math.min(res.length - 1, active + 1); render(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
      if (e.key === 'Enter' && res.length) { pick(res[Math.max(0, active)]); e.preventDefault(); }
      if (e.key === 'Escape') list.hidden = true;
    };
    list.onclick = e => { const o = e.target.closest('.opt'); if (o) pick(res[+o.dataset.i]); };
    document.addEventListener('click', e => { if (!host.contains(e.target)) list.hidden = true; });
    function pick(it) { inp.value = it.name + ' ' + it.tier + '.' + it.enchantment; list.hidden = true; onSelect(it); }
    return { set: it => { inp.value = it ? it.name + ' ' + it.tier + '.' + it.enchantment : ''; }, input: inp };
  }

  /** Opciones de <select> */
  const options = (list, sel) => list.map(o => { const v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o; return `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`; }).join('');
  /** Chips de selección múltiple */
  function chips(host, list, selected, onChange) {
    host.innerHTML = list.map(o => `<button type="button" class="chip" data-v="${esc(o.value)}" aria-pressed="${selected.includes(o.value)}">${esc(o.label)}</button>`).join('');
    host.onclick = e => { const b = e.target.closest('.chip'); if (!b) return; const on = b.getAttribute('aria-pressed') === 'true'; b.setAttribute('aria-pressed', !on); onChange && onChange(values()); };
    const values = () => $$('.chip', host).filter(b => b.getAttribute('aria-pressed') === 'true').map(b => { const o = list.find(x => String(x.value) === b.dataset.v); return o.value; });
    return { values };
  }

  /** Detalle del cálculo paso a paso (log verificable a mano). */
  function calcLog(e) {
    const c = e.calc, rows = [];
    const L = (k, v, cls) => rows.push(`<tr class="${cls || ''}"><td>${k}</td><td class="n">${v}</td></tr>`);
    rows.push(`<tr class="sec"><td colspan="2">${esc(SM.crafting.label(e.item.item_id))} · ${c.units} pedidas → ${c.crafts} crafteo(s) × ${c.yieldN} = ${c.made} unidades</td></tr>`);
    c.lines.forEach(l => {
      const b = e.buys[l.item_id];
      rows.push(`<tr class="sec"><td colspan="2">${esc(SM.crafting.label(l.item_id))}</td></tr>`);
      L('Cantidad bruta', fmtQ(l.gross) + ' (' + l.perCraft + ' × ' + c.crafts + ')');
      L('Retorno ' + (l.returnable ? pct(c.returnRate * 100) : '(no retornable)'), '− ' + fmtQ(l.recovered));
      L('Cantidad efectiva', fmtQ(l.needed));
      L('Precio' + (b ? ' (' + esc(b.location) + (b.date ? ', ' + esc(SM.market.ageText(b.date)) : '') + ')' : ''), fmt(l.price));
      L('Costo', fmt(l.cost));
    });
    rows.push('<tr class="sec"><td colspan="2">Costos</td></tr>');
    L('Retorno usado', pct(c.returnRate * 100) + ' · modo ' + esc(e.rr.mode));
    L('Costo efectivo de materiales', fmt(c.materialCost));
    L('Tarifa de fabricación', fmt(c.craftingFee));
    L('Transporte', fmt(c.transport));
    L('Otros costos', fmt(c.otherCosts));
    L('<b>Costo total</b>', '<b>' + fmt(c.totalCost) + '</b>');
    rows.push('<tr class="sec"><td colspan="2">Venta</td></tr>');
    if (c.sale) {
      L('Precio unitario (' + esc(e.sale.location) + ', ' + (c.sale.mode === 'order' ? 'orden de venta' : 'venta inmediata') + ')', fmt(c.sale.unitPrice));
      L('Venta bruta', fmt(c.sale.gross));
      L('Impuesto ' + pct(c.sale.taxPct), '− ' + fmt(c.sale.tax));
      L('Tarifa de publicación', '− ' + fmt(c.sale.setup));
      L('<b>Ingreso neto</b>', '<b>' + fmt(c.sale.net) + '</b>');
    } else L('Venta', 'Sin datos');
    rows.push('<tr class="sec"><td colspan="2">Resultado</td></tr>');
    L('<b>Profit del lote</b>', `<b class="${signCls(c.profit)}">${fmt(c.profit)}</b>`);
    L('Profit por unidad', fmt(c.profitPerUnit));
    L('ROI (profit / costo total)', pct(c.roi));
    L('Silver/hora (' + (c.minutes || 0) + ' min)', fmt(c.silverPerHour));
    if (c.focusUsed) { L('Foco usado', fmt(c.focusUsed)); L('Valor del foco', c.focusSilver === null ? 'Sin valor definido' : fmt(c.focusSilver)); L('Beneficio económico', fmt(c.economicProfit)); }
    if (!c.ok) rows.unshift(`<tr><td colspan="2" class="insufficient">DATOS INSUFICIENTES: ${esc(c.reasons.join('; '))}</td></tr>`);
    return `<div class="tablewrap"><table class="log">${rows.join('')}</table></div>`;
  }

  const catOptions = () => Object.entries(SM.crafting.CATEGORY_LABEL).map(([value, label]) => ({ value, label }));

  SM.ui = { $, $$, esc, fmt, fmtQ, pct, signCls, ageBadge, ageBadgeMin, confBadge, toast, modal, closeModal, table, itemPicker, options, chips, calcLog, catOptions, isNum };
})(typeof window !== 'undefined' ? window : globalThis);
