/* Silver Master — vista «Artefactos»: objetos con artefacto para el Mercado Negro, comprando el artefacto por orden de compra. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const U = () => SM.ui;
  const TIERS = [4, 5, 6, 7, 8].map(t => ({ value: t, label: 'T' + t }));
  const ENCH = [0, 1, 2, 3, 4].map(e => ({ value: e, label: '.' + e }));
  const V = { res: null, sort: 'daily', shown: 30 };
  const DEF = { tierMin: 4, tierMax: 5, enchants: [0, 1, 2, 3], craftWhere: 'bonus', units: 10, minRoi: 5, sharePct: 30, maxAgeH: 24 };

  function init() {
    const u = U(), P = SM.storage.profile(), s = Object.assign({}, DEF, SM.storage.get('artifacts', {}));
    const cities = SM.data.cities.filter(c => c.type !== 'black_market').map(c => c.id);
    u.$('#arForm').innerHTML = `<div class="fields">
      <label class="field"><span class="lbl">Tier mínimo</span><select id="arTMin">${u.options(TIERS, s.tierMin)}</select></label>
      <label class="field"><span class="lbl">Tier máximo</span><select id="arTMax">${u.options(TIERS, s.tierMax)}</select></label>
      <div class="field"><span class="lbl">Encantamientos</span><div class="chips" id="arEnch"></div></div>
      <div class="field" style="grid-column:1/-1"><span class="lbl">Ciudades donde pondrías la orden de compra</span><div class="chips" id="arCities"></div></div>
      <label class="field"><span class="lbl">Fabricas en</span><select id="arWhere"><option value="bonus">La ciudad con bono de cada objeto</option><option value="base"${s.craftWhere === 'base' ? ' selected' : ''}>Mi ciudad (${u.esc(P.city)})</option></select></label>
      <label class="field"><span class="lbl">Foco</span><span class="check"><input id="arFocus" type="checkbox"${P.focus ? ' checked' : ''}> Usar foco</span></label>
      <label class="field"><span class="lbl">ROI mínimo (%)</span><input id="arRoi" type="number" value="${s.minRoi}"></label>
      <label class="field"><span class="lbl">Tu parte de las ventas (%)</span><input id="arShare" type="number" min="1" max="100" value="${s.sharePct}"></label>
      <label class="field"><span class="lbl">Precios de máximo (horas)</span><input id="arAge" type="number" min="1" value="${s.maxAgeH}"></label>
    </div><p class="hint">Calidad normal. El artefacto se calcula con <b>orden de compra</b>: 1 de plata más que la orden más alta, en la ciudad donde esa orden es más baja, más la tarifa de publicación. Los demás materiales, al precio de compra directa más barato.</p>`;
    V.ench = u.chips(u.$('#arEnch'), ENCH, s.enchants);
    V.cities = u.chips(u.$('#arCities'), cities.map(c => ({ value: c, label: c })), s.cities || cities);
    u.$('#arGo').onclick = run;
    u.$('#arSort').onchange = () => { V.sort = u.$('#arSort').value; render(); };
  }

  async function run() {
    const u = U(), n = id => +u.$('#' + id).value, msg = u.$('#arMsg'), bar = u.$('#arBar'), P = SM.storage.profile();
    const f = { tierMin: Math.min(n('arTMin'), n('arTMax')), tierMax: Math.max(n('arTMin'), n('arTMax')), enchants: V.ench.values(), cities: V.cities.values(), craftWhere: u.$('#arWhere').value, baseCity: P.city,
      focus: u.$('#arFocus').checked, premium: P.premium, units: 10, minRoi: u.$('#arRoi').value === '' ? 0 : n('arRoi'), sharePct: n('arShare') || 30, maxAgeH: n('arAge') || 24 };
    if (!f.enchants.length || !f.cities.length) { msg.textContent = 'Elige al menos un encantamiento y una ciudad.'; msg.className = 'msg err'; return; }
    SM.storage.set('artifacts', { tierMin: f.tierMin, tierMax: f.tierMax, enchants: f.enchants, cities: f.cities, craftWhere: f.craftWhere, minRoi: f.minRoi, sharePct: f.sharePct, maxAgeH: f.maxAgeH });
    u.$('#arGo').disabled = true; SM.app.busy(true); msg.className = 'msg';
    try {
      const r = await SM.artifacts.scan(f, (m, d, t) => { bar.style.width = Math.round(d / t * 100) + '%'; msg.textContent = m + '… ' + d + ' de ' + t; });
      V.res = r; V.f = f; V.shown = 30; bar.style.width = '100%';
      const N = x => x.toLocaleString('es-CL');
      msg.textContent = `Revisé ${N(r.scanned)} objetos con artefacto: ${N(r.rows.length)} dejan ganancia en el Mercado Negro. ${r.noArt ? N(r.noArt) + ' sin precio del artefacto. ' : ''}${r.invalid ? N(r.invalid) + ' sin precio de otro material o del Mercado Negro.' : ''}`;
      SM.app.setStale(r.stale);
      u.$('#arRes').hidden = false; render();
    } catch (e) { msg.textContent = '⚠ ' + e.message; msg.className = 'msg err'; }
    finally { u.$('#arGo').disabled = false; SM.app.busy(false); }
  }

  function render() {
    const u = U(), r = V.res; if (!r) return;
    const sorters = { daily: (a, b) => (b.dailyProfit ?? -1) - (a.dailyProfit ?? -1) || b.profitUnit - a.profitUnit, profit: (a, b) => b.profitUnit - a.profitUnit, roi: (a, b) => b.calc.roi - a.calc.roi,
      volume: (a, b) => (b.liquidity ?? -1) - (a.liquidity ?? -1), art: (a, b) => a.plan.price - b.plan.price };
    const rows = r.rows.slice().sort(sorters[V.sort]);
    const f1 = x => x == null ? '—' : x.toLocaleString('es-CL', { maximumFractionDigits: 1 });
    u.$('#arList').innerHTML = rows.length ? rows.slice(0, V.shown).map((e, i) => {
      const p = e.plan, o = p.order, ins = p.instant;
      const artLine = p.useOrder
        ? `Orden de compra en <b>${u.esc(o.city)}</b>: ofrece <b class="silver">${u.fmt(o.bid)}</b> (la más alta hoy: ${u.fmt(o.top)}) ${u.ageBadge(o.date)}<br><span class="muted">Con tarifa de publicación: ${u.fmt(o.cost)}${ins ? ` · comprarlo directo cuesta ${u.fmt(ins.price)} en ${u.esc(ins.city)}: ahorras <span class="pos">${u.fmt(p.saving)}</span>` : ' · nadie lo vende directo ahora'}</span>`
        : `Compra directa en <b>${u.esc(ins.city)}</b> a <b class="silver">${u.fmt(ins.price)}</b> ${u.ageBadge(ins.date)}<br><span class="muted">${o ? 'La orden de compra más baja que podrías superar sale igual o más cara (' + u.fmt(o.cost) + ' en ' + u.esc(o.city) + ').' : 'No hay órdenes de compra para superar en las ciudades elegidas.'}</span>`;
      const fill = !p.useOrder ? '' : e.artVolume == null ? '' : e.artVolume < 1 ? ' <span class="warn">· se venden menos de 1 al día ahí: tu orden puede tardar</span>' : ` <span class="muted">· se venden ~${f1(e.artVolume)} al día ahí</span>`;
      return `<article class="rec" data-i="${r.rows.indexOf(e)}">
        <header><div><b>${u.esc(e.item.name)}</b> <span class="tag">T${e.item.tier}.${e.item.enchantment}</span></div><span class="rk ${e.dailyProfit == null ? 'muted' : 'pos'}">${e.dailyProfit == null ? 'sin historial de ventas' : u.fmt(e.dailyProfit) + ' / día'}</span></header>
        <p class="small route">Artefacto: <b>${u.esc(SM.crafting.name(e.artId))}</b>${e.artPerUnit !== 1 ? ' × ' + f1(e.artPerUnit) + ' por unidad' : ''}</p>
        <p class="small" style="margin:0">${artLine}${fill}</p>
        <div class="kv4">
          <div><span class="lbl">Costo / u</span><b>${u.fmt(e.calc.totalCost / e.calc.made)}</b></div><div><span class="lbl">Mercado Negro paga</span><b class="silver">${u.fmt(e.sale.price)}</b></div>
          <div><span class="lbl">Ganancia / u</span><b class="pos">${u.fmt(e.profitUnit)}</b></div><div><span class="lbl">ROI</span><b>${u.pct(e.calc.roi)}</b></div>
          <div><span class="lbl">Se venden / día</span><b>${f1(e.liquidity)}</b></div><div><span class="lbl">Tu parte / día</span><b>${f1(e.perDayMine)}</b></div>
          <div><span class="lbl">Fabricar en</span><b>${u.esc(e.craftCity)}${e.rr.bonusKind ? ' ✓' : ''}</b></div><div><span class="lbl">Dato más viejo</span>${u.ageBadgeMin(e.oldestMinutes)}</div>
        </div>
        <div class="btns"><button class="btn sm primary" data-a="simple">Abrir en Calculadora sencilla</button><button class="btn sm" data-a="calc">Calculadora completa</button></div>
      </article>`;
    }).join('') + (rows.length > V.shown ? `<button class="btn" id="arMore">Ver más (${rows.length - V.shown} restantes)</button>` : '')
      : '<p class="muted">Ningún objeto con artefacto deja ganancia con estos filtros. Prueba bajar el ROI mínimo, subir las horas de los precios o sumar encantamientos.</p>';
    const more = u.$('#arMore'); if (more) more.onclick = () => { V.shown += 30; render(); };
    u.$$('#arList .rec').forEach(el => el.onclick = ev => {
      const b = ev.target.closest('[data-a]'); if (!b) return;
      const e = r.rows[+el.dataset.i];
      if (b.dataset.a === 'simple') SM.views.simple.open(e.item, { man: { [e.artId]: Math.round(e.plan.price) }, city: e.craftCity, focus: V.f.focus });
      else SM.views.calc.open(e.item, true, { units: 10, craftCity: e.craftCity, sellMarket: 'Black Market', focus: V.f.focus });
    });
  }

  SM.views = SM.views || {};
  SM.views.artifacts = { init };
})(typeof window !== 'undefined' ? window : globalThis);
