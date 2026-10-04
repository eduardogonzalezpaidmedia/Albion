/* Silver Master — Calculadora de inversión (v2.4).
   Escribes cuánto quieres invertir y arma una lista de compras para revender entre ciudades.
   Es una cara simple del motor de Market Intelligence (SM.recommend): la cantidad de cada objeto se limita
   por lo que se vende al día, cada fila lleva riesgo y antigüedad del precio, y el total nunca supera tu plata. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const U = () => SM.ui;
  const TIERS = [4, 5, 6, 7, 8].map(t => ({ value: t, label: 'T' + t }));
  const PLAZOS = [{ value: '24h', label: '1 día' }, { value: '48h', label: '2 días' }, { value: '72h', label: '3 días' }, { value: 'long', label: '1 semana' }];
  const DEF = { amount: null, city: 'all', mode: 'order', plazo: '72h', tierMin: 4, tierMax: 6, risk: 'moderado', pct: 15, red: false, cats: ['weapons', 'armor', 'head', 'shoes', 'bags', 'capes'] };
  const V = { cands: null, at: null, key: '' };
  const cfg = () => { const c = Object.assign({}, DEF, SM.storage.get('invest', {})); if (c.amount === null) c.amount = SM.storage.profile().capital; return c; };
  const RISK_CLS = { bajo: 'pos', moderado: 'warn', alto: 'neg', insuficiente: 'muted' };

  function init() {
    const u = U(), c = cfg(), cities = SM.data.cities.filter(x => x.type !== 'black_market').map(x => x.id);
    u.$('#ivForm').innerHTML = `<div class="iv-top">
        <label class="field"><span class="lbl">¿Cuánto quieres invertir?</span><input id="ivAmount" type="number" min="0" step="100000" inputmode="numeric" value="${c.amount}"><span class="hint" id="ivAmountTxt"></span></label>
        <label class="field"><span class="lbl">Ciudad de compra</span><select id="ivCity"><option value="all">Todas</option>${u.options(cities, c.city)}</select></label>
        <div class="field"><span class="lbl">Tipo de venta</span><div class="seg" id="ivMode"><button type="button" data-m="instant" aria-pressed="${c.mode === 'instant'}">Directa</button><button type="button" data-m="order" aria-pressed="${c.mode === 'order'}">Orden</button></div><span class="hint" id="ivModeTxt"></span></div>
        <label class="field"><span class="lbl">Vender en máximo</span><select id="ivPlazo">${u.options(PLAZOS, c.plazo)}</select></label>
      </div>
      <details class="iv-more"><summary>Más opciones</summary><div class="fields">
        <label class="field"><span class="lbl">Tier mínimo</span><select id="ivTMin">${u.options(TIERS, c.tierMin)}</select></label>
        <label class="field"><span class="lbl">Tier máximo</span><select id="ivTMax">${u.options(TIERS, c.tierMax)}</select></label>
        <label class="field"><span class="lbl">Riesgo máximo</span><select id="ivRisk">${u.options([{ value: 'bajo', label: 'Bajo' }, { value: 'moderado', label: 'Moderado' }, { value: 'alto', label: 'Alto' }], c.risk)}</select></label>
        <label class="field"><span class="lbl">Máx. por objeto (% de tu plata)</span><input id="ivPct" type="number" min="1" max="100" value="${c.pct}"><span class="hint">Para repartir y no apostar todo a uno.</span></label>
        <label class="field"><span class="lbl">Zona roja</span><span class="check"><input id="ivRed" type="checkbox"${c.red ? ' checked' : ''}> Incluir Caerleon y Mercado Negro</span></label>
        <div class="field" style="grid-column:1/-1"><span class="lbl">Qué revender</span><div class="chips" id="ivCats"></div></div>
      </div></details>`;
    V.cats = u.chips(u.$('#ivCats'), u.catOptions().filter(x => x.value !== 'refined'), c.cats);
    const modeTxt = () => { u.$('#ivModeTxt').textContent = read().mode === 'order' ? 'Publicas una orden de venta: ganas más, pero te pueden tapar.' : 'Vendes a una orden de compra: cobras al instante.'; };
    u.$('#ivMode').onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; u.$$('#ivMode button').forEach(x => x.setAttribute('aria-pressed', x === b)); modeTxt(); recalc(); };
    const amt = () => { u.$('#ivAmountTxt').textContent = 'Valor entendido: ' + u.fmt(+u.$('#ivAmount').value || 0) + ' de plata'; };
    u.$('#ivAmount').addEventListener('input', () => { amt(); recalc(); });
    ['ivCity', 'ivPlazo', 'ivRisk', 'ivRed'].forEach(id => u.$('#' + id).addEventListener('change', recalc));
    u.$('#ivPct').addEventListener('input', recalc);
    u.$('#ivGo').onclick = run;
    u.$('#ivSort').onchange = render;
    amt(); modeTxt();
  }
  function read() {
    const u = U(), n = id => +u.$('#' + id).value;
    return { amount: n('ivAmount') || 0, city: u.$('#ivCity').value, mode: u.$('#ivMode [aria-pressed="true"]').dataset.m, plazo: u.$('#ivPlazo').value,
      tierMin: Math.min(n('ivTMin'), n('ivTMax')), tierMax: Math.max(n('ivTMin'), n('ivTMax')), risk: u.$('#ivRisk').value, pct: Math.min(100, Math.max(1, n('ivPct') || 15)), red: u.$('#ivRed').checked, cats: V.cats.values() };
  }
  /** Ajustes para SM.recommend a partir del formulario simple. */
  function settings(c) {
    return Object.assign(SM.recommend.settings(), { capital: c.amount, reserve: 0, maxPctPerOp: c.pct, maxPerItem: 0, minRoi: 3, minProfit: 1, tierMin: c.tierMin, tierMax: c.tierMax, enchants: [0, 1, 2, 3],
      categories: c.cats, ops: ['arbitrage'], buyFrom: c.city === 'all' ? null : [c.city], saleMode: c.mode, riskMax: c.risk, includeInsufficient: false, longDays: 7 });
  }
  const scanKey = c => [c.city, c.mode, c.tierMin, c.tierMax, c.cats.join(',')].join('|');

  async function run() {
    const u = U(), c = read(), msg = u.$('#ivMsg'), bar = u.$('#ivBar');
    if (!c.amount) { msg.textContent = 'Escribe cuánto quieres invertir.'; msg.className = 'msg err'; return; }
    if (!c.cats.length) { msg.textContent = 'Elige al menos una categoría en «Más opciones».'; msg.className = 'msg err'; return; }
    SM.storage.set('invest', c);
    u.$('#ivGo').disabled = true; SM.app.busy(true); msg.className = 'msg';
    try {
      const g = await SM.recommend.gather(settings(c), (m, d, t) => { bar.style.width = Math.round(d / t * 100) + '%'; msg.textContent = m + '… ' + d + ' de ' + t; });
      V.cands = g.cands; V.at = Date.now(); V.key = scanKey(c); bar.style.width = '100%';
      plan();
    } catch (e) { msg.textContent = '⚠ ' + e.message; msg.className = 'msg err'; }
    finally { u.$('#ivGo').disabled = false; SM.app.busy(false); }
  }
  /** Recalcula con los precios ya consultados (monto, plazo, riesgo). Si cambió algo que exige otros precios, lo avisa. */
  function recalc() {
    const u = U(), c = read(); SM.storage.set('invest', c);
    if (!V.cands) return;
    if (scanKey(c) !== V.key) { u.$('#ivMsg').textContent = 'Cambiaste la ciudad, el tipo de venta, los tiers o las categorías: toca «Buscar oportunidades» para consultar los precios de nuevo.'; u.$('#ivMsg').className = 'msg'; return; }
    plan();
  }
  function plan() {
    const u = U(), c = read(), s = settings(c);
    let cands = V.cands.filter(x => (c.city === 'all' || x.sourceCity === c.city) && (c.red || !x.redZone));
    const S = SM.recommend.strategies(cands, s)[c.plazo];
    V.res = { c, s, all: S.recs, picks: S.recs.filter(r => r.inPortfolio), port: S.portfolio, considered: cands.length };
    u.$('#ivMsg').textContent = `Precios consultados a las ${new Date(V.at).toLocaleTimeString('es-CL')} · Revisé ${cands.length} reventas posibles; ${S.recs.length} cumplen plazo y riesgo, y ${V.res.picks.length} caben en tu plata.`;
    u.$('#ivMsg').className = 'msg';
    render();
  }

  function render() {
    const u = U(), R = V.res; if (!R) return;
    u.$('#ivRes').hidden = false;
    const inv = R.picks.reduce((a, r) => a + r.totalInvestment, 0), prof = R.picks.reduce((a, r) => a + r.estimatedNetProfit, 0);
    const k = (l, v, s2, cls) => `<div class="kpi ${cls || ''}"><span class="lbl">${l}</span><b>${v}</b><span class="s">${s2 || ''}</span></div>`;
    u.$('#ivSum').innerHTML = `<div class="kpis">
      ${k('Invertido', u.fmt(inv), `de ${u.fmt(R.c.amount)} · ${R.picks.length} objeto(s)`)}
      ${k('Ganancia estimada', (prof >= 0 ? '+' : '') + u.fmt(prof), inv ? 'margen ' + u.pct(prof / inv * 100) + ' después de impuestos' : '', prof > 0 ? 'pos' : '')}
      ${k('Retorno estimado', u.fmt(inv + prof), 'lo que recibirías si se vende todo')}
      ${k('Sin usar', u.fmt(R.c.amount - inv), R.c.amount - inv > R.c.amount * 0.2 ? 'no hubo más reventas que cumplan' : '')}</div>`;
    if (!R.picks.length) { u.$('#ivList').innerHTML = `<p class="muted">Con estos filtros no hay reventas que cumplan. Prueba: más plazo, riesgo «Alto», «Todas» las ciudades, o más tiers y categorías en «Más opciones».${R.all.length ? '' : ' Si todo sale vacío, puede que Albion Data tenga pocos precios recientes ahora.'}</p>`; return; }
    const sorters = { total: (a, b) => b.estimatedNetProfit - a.estimatedNetProfit, margin: (a, b) => b.estimatedRoiPercent - a.estimatedRoiPercent, cost: (a, b) => b.totalInvestment - a.totalInvestment, fast: (a, b) => (a.estimatedSaleHours ?? 1e9) - (b.estimatedSaleHours ?? 1e9), risk: (a, b) => SM.risk.ORDER[a.risk] - SM.risk.ORDER[b.risk] || b.estimatedNetProfit - a.estimatedNetProfit };
    const rows = R.picks.slice().sort(sorters[u.$('#ivSort').value] || sorters.total);
    const loc = l => l === 'Black Market' ? 'Mercado Negro' : l;
    const netU = r => r.plan.netUnit - r.plan.unitCost;
    u.$('#ivList').innerHTML = rows.map(r => `<article class="iv-row" data-id="${u.esc(r.id)}">
        <div class="iv-it">${u.icon(r.itemId, 44)}<div><b>${u.esc(r.name)}</b><span class="small muted">${r.tier}.${r.enchantment} · Normal</span></div></div>
        <div class="iv-route"><span class="lbl">Compra en</span><b>${u.esc(loc(r.sourceCity))}</b><span class="lbl">Vende en</span><b>${u.esc(loc(r.targetCity))}</b></div>
        <div class="iv-nums">
          <div><span class="lbl">Cantidad</span><b>${r.quantity}</b></div><div><span class="lbl">Costo total</span><b>${u.fmt(r.totalInvestment)}</b></div>
          <div><span class="lbl">Compra / u</span><b>${u.fmt(r.buyPrice)}</b></div><div><span class="lbl">Venta / u</span><b class="silver">${u.fmt(r.targetSellPrice)}</b></div>
          <div><span class="lbl">Ganancia / u</span><b class="pos">+${u.fmt(netU(r))}</b></div><div><span class="lbl">Ganancia total</span><b class="pos">+${u.fmt(r.estimatedNetProfit)}</b></div>
          <div><span class="lbl">Margen</span><b>${u.pct(r.estimatedRoiPercent)}</b></div><div><span class="lbl">Se venden / día</span><b>${r.liquidity == null ? '—' : r.liquidity.toLocaleString('es-CL', { maximumFractionDigits: 1 })}</b></div>
        </div>
        <div class="iv-foot"><span class="rk ${RISK_CLS[r.risk]}">${u.esc(r.riskLabel)}</span><span class="small muted">venta en ~${u.esc(SM.recommend.fmtH(r.estimatedSaleHours))} · precio ${u.ageBadgeMin((Date.now() - Date.parse(r.dataTimestamp)) / 60000)}</span><button class="btn sm" data-a="detail">Detalle</button><button class="btn sm ghost" data-a="plan">Guardar</button></div>
      </article>`).join('') + (R.all.length > R.picks.length ? `<p class="small muted">${R.all.length - R.picks.length} reventa(s) más cumplen los filtros pero no caben en tu plata o ya se alcanzó el máximo por objeto.</p>` : '');
    u.$$('#ivList .iv-row').forEach(el => el.onclick = e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const r = R.picks.find(x => x.id === el.dataset.id); if (!r) return;
      if (b.dataset.a === 'detail') SM.views.intel.detail(r);
      else { SM.journal.planOp(r); u.toast('Guardada en Mi plata → Market Intelligence → Operaciones'); }
    });
  }

  SM.views = SM.views || {};
  SM.views.invest = { init };
})(typeof window !== 'undefined' ? window : globalThis);
