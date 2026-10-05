/* Silver Master — única capa de acceso a Albion Online Data Project (AODP).
   Frontend → SM.api → AODP directo  o  Cloudflare Worker (proxy) → AODP.
   Ningún otro archivo arma URLs de la API. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const cfg = { serverKey: 'americas', host: 'https://west.albion-online-data.com', proxyUrl: '', cacheMinutes: 5, maxUrl: 3500, concurrency: 3, privateUrl: '', privateKey: '' };
  const priv = { last: null, rows: 0, error: null };       // estado de la base privada
  const cache = new Map();          // url -> {t, data}
  const status = { state: 'unknown', mode: 'direct', message: '', lastOk: null, lastError: null, requests: 0 };
  const listeners = [];
  const priceListeners = [];           // reciben cada lote de precios nuevo (historial propio)

  function configure(o) {
    Object.assign(cfg, o || {});
    notify();
  }
  function onStatus(fn) { listeners.push(fn); }
  function notify() { listeners.forEach(fn => { try { fn(Object.assign({}, status)); } catch (e) { } }); }

  function base() {
    if (cfg.proxyUrl) return cfg.proxyUrl.replace(/\/+$/, '') + '/' + cfg.serverKey;
    return cfg.host;
  }
  function url(path, params) {
    const q = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => k + '=' + encodeURIComponent(Array.isArray(v) ? v.join(',') : v)).join('&');
    return base() + path + (q ? '?' + q : '');
  }
  function chunkIds(ids, maxLen) {
    const out = []; let cur = [], len = 0;
    for (const id of ids) { const l = encodeURIComponent(id).length + 3; if (len + l > maxLen && cur.length) { out.push(cur); cur = []; len = 0; } cur.push(id); len += l; }
    if (cur.length) out.push(cur);
    return out;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function fetchJSON(u, force) {
    const hit = cache.get(u);
    if (!force && hit && Date.now() - hit.t < cfg.cacheMinutes * 60000) return { data: hit.data, fromCache: true, fetchedAt: hit.t };
    let lastErr;
    for (let a = 0; a < 4; a++) {
      try {
        status.requests++;
        const r = await fetch(u);
        if (r.status === 429) { await sleep(6000 * (a + 1)); lastErr = new Error('Límite de consultas de AODP (429)'); continue; }
        if (!r.ok) { lastErr = new Error('AODP respondió ' + r.status); await sleep(1200); continue; }
        const data = await r.json();
        cache.set(u, { t: Date.now(), data });
        status.state = 'connected'; status.lastOk = Date.now(); status.message = ''; notify();
        return { data, fromCache: false, fetchedAt: Date.now() };
      } catch (e) {
        lastErr = e.name === 'TypeError' ? new Error('Sin respuesta de AODP (red o CORS)') : e;
        await sleep(800);
      }
    }
    status.lastError = lastErr ? lastErr.message : 'Error'; status.state = 'error'; status.message = status.lastError; notify();
    if (hit) return { data: hit.data, fromCache: true, stale: true, fetchedAt: hit.t, error: status.lastError };
    throw lastErr || new Error('Error desconocido');
  }

  async function pool(tasks, n, onDone) {
    let i = 0, done = 0; const out = [];
    async function w() { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); onDone && onDone(++done, tasks.length); } }
    await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, w));
    return out;
  }

  /** Precios actuales. Devuelve {rows, stale, fetchedAt, errors}. */
  async function getPrices(itemIds, locations, qualities, opts) {
    opts = opts || {};
    const ids = [...new Set(itemIds)];
    const tasks = chunkIds(ids, cfg.maxUrl).map(g => () => fetchJSON(url('/api/v2/stats/prices/' + g.map(encodeURIComponent).join(',') + '.json', { locations, qualities }), opts.force).catch(e => ({ error: e.message, data: [] })));
    const res = await pool(tasks, cfg.concurrency, opts.onProgress);
    const fresh = res.filter(r => !r.fromCache && r.data).flatMap(r => r.data);
    if (fresh.length) priceListeners.forEach(fn => { try { fn(fresh); } catch (e) { } });
    const own = await getPrivate(ids, locations, qualities);
    return {
      rows: mergeOwn(res.flatMap(r => r.data || []), own), own: own.length,
      stale: res.some(r => r.stale), errors: res.filter(r => r.error).map(r => r.error),
      fetchedAt: Math.min(...res.map(r => r.fetchedAt || Date.now()))
    };
  }

  /* ---------- base privada (opcional): tus propios precios capturados en tu PC ---------- */
  const validD = d => !!d && d.slice(0, 4) !== '0001';
  /** Mezcla: para cada objeto/ciudad/calidad se queda con el dato MÁS RECIENTE de cada lado (venta y compra por separado). */
  function mergeOwn(rows, own) {
    if (!own || !own.length) return rows;
    const idx = new Map(); rows.forEach(r => idx.set(r.item_id + '|' + r.city + '|' + (r.quality || 1), r));
    for (const o of own) {
      const k = o.item_id + '|' + o.city + '|' + (o.quality || 1); let r = idx.get(k);
      if (!r) { r = Object.assign({}, o); idx.set(k, r); rows.push(r); r.own_sell = o.sell_price_min > 0; r.own_buy = o.buy_price_max > 0; continue; }
      if (o.sell_price_min > 0 && validD(o.sell_price_min_date) && (!validD(r.sell_price_min_date) || o.sell_price_min_date > r.sell_price_min_date)) { r.sell_price_min = o.sell_price_min; r.sell_price_min_date = o.sell_price_min_date; r.own_sell = true; }
      if (o.buy_price_max > 0 && validD(o.buy_price_max_date) && (!validD(r.buy_price_max_date) || o.buy_price_max_date > r.buy_price_max_date)) { r.buy_price_max = o.buy_price_max; r.buy_price_max_date = o.buy_price_max_date; r.own_buy = true; }
      ['own_sell_orders', 'own_sell_amount', 'own_buy_orders', 'own_buy_amount'].forEach(f => { if (o[f] !== undefined) r[f] = o[f]; });
    }
    return rows;
  }
  const privBase = () => (cfg.privateUrl || '').replace(/\/+$/, '');
  async function getPrivate(ids, locations, qualities) {
    if (!privBase() || !cfg.privateKey) return [];
    const out = [];
    try {
      for (const g of chunkIds(ids, 1800)) {
        const q = 'locations=' + encodeURIComponent((locations || []).join(',')) + '&qualities=' + encodeURIComponent((qualities || []).join(',')) + '&key=' + encodeURIComponent(cfg.privateKey);
        const r = await fetch(privBase() + '/prices/' + g.map(encodeURIComponent).join(',') + '?' + q);
        if (!r.ok) throw new Error(r.status === 403 ? 'clave incorrecta' : 'respondió ' + r.status);
        out.push(...await r.json());
      }
      priv.last = Date.now(); priv.rows = out.length; priv.error = null;
    } catch (e) { priv.error = e.message; }      // si falla, la app sigue con los datos públicos
    return out;
  }
  async function privateStats() {
    if (!privBase() || !cfg.privateKey) return { ok: false, error: 'Falta la dirección o la clave.' };
    try { const r = await fetch(privBase() + '/stats?key=' + encodeURIComponent(cfg.privateKey)); const j = await r.json(); return r.ok ? j : { ok: false, error: j.error || ('respondió ' + r.status) }; }
    catch (e) { return { ok: false, error: 'No responde (' + e.message + '). Revisa la dirección.' }; }
  }

  /** Historial. timeScale: 1 (por hora) o 24 (por día). */
  async function getHistory(itemIds, locations, qualities, timeScale, opts) {
    opts = opts || {};
    const ids = [...new Set(itemIds)];
    const tasks = chunkIds(ids, cfg.maxUrl - 400).map(g => () => fetchJSON(url('/api/v2/stats/history/' + g.map(encodeURIComponent).join(',') + '.json', { locations, qualities, 'time-scale': timeScale || 24 }), opts.force).catch(e => ({ error: e.message, data: [] })));
    const res = await pool(tasks, cfg.concurrency, opts.onProgress);
    return { rows: res.flatMap(r => r.data || []), stale: res.some(r => r.stale), errors: res.filter(r => r.error).map(r => r.error) };
  }

  /** Prueba de conexión (detecta CORS/red). */
  async function probe(locations) {
    status.mode = cfg.proxyUrl ? 'proxy' : 'direct';
    try {
      const r = await fetchJSON(url('/api/v2/stats/prices/T4_BAG,T4_PLANKS,T4_2H_BOW.json', { locations }), true);
      status.state = 'connected'; notify();
      return { ok: true, rows: r.data };
    } catch (e) {
      status.state = 'error';
      status.message = cfg.proxyUrl ? 'El proxy no responde: ' + e.message : 'El navegador no pudo consultar AODP directamente (' + e.message + '). Puedes configurar un Cloudflare Worker como proxy en Ajustes.';
      notify();
      return { ok: false, error: status.message };
    }
  }

  function clearCache() { cache.clear(); }

  SM.api = { configure, onStatus, onPrices: fn => priceListeners.push(fn), getPrices, getHistory, mergeOwn, privateStats, privateState: () => Object.assign({ on: !!(privBase() && cfg.privateKey) }, priv), probe, clearCache, status: () => Object.assign({}, status), _url: url, _chunk: chunkIds };
})(typeof window !== 'undefined' ? window : globalThis);
