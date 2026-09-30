/* Silver Master — única capa de acceso a Albion Online Data Project (AODP).
   Frontend → SM.api → AODP directo  o  Cloudflare Worker (proxy) → AODP.
   Ningún otro archivo arma URLs de la API. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const cfg = { serverKey: 'americas', host: 'https://west.albion-online-data.com', proxyUrl: '', cacheMinutes: 5, maxUrl: 3500, concurrency: 3 };
  const cache = new Map();          // url -> {t, data}
  const status = { state: 'unknown', mode: 'direct', message: '', lastOk: null, lastError: null, requests: 0 };
  const listeners = [];

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
    return {
      rows: res.flatMap(r => r.data || []),
      stale: res.some(r => r.stale), errors: res.filter(r => r.error).map(r => r.error),
      fetchedAt: Math.min(...res.map(r => r.fetchedAt || Date.now()))
    };
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

  SM.api = { configure, onStatus, getPrices, getHistory, probe, clearCache, status: () => Object.assign({}, status), _url: url, _chunk: chunkIds };
})(typeof window !== 'undefined' ? window : globalThis);
