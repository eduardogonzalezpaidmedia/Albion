/* Silver Master — historial propio de precios (PriceHistoryService, parte local).
   Cada vez que la app consulta precios a AODP, guarda una observación en ESTE dispositivo (IndexedDB).
   No inventa nada: solo registra lo que AODP devolvió y cuándo se consultó.
   Si IndexedDB no está disponible (modo privado, pruebas), usa memoria y lo indica. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const DB = 'silver-master', STORE = 'obs', MAX = 60000;
  let db = null, mode = 'memory', mem = [], ready = null;
  const last = new Map();              // clave -> firma de la última observación (evita duplicados)
  const valid = d => SM.market && SM.market.validDate(d);

  function open() {
    if (ready) return ready;
    ready = new Promise(res => {
      try {
        if (!root.indexedDB) return res(false);
        const rq = root.indexedDB.open(DB, 1);
        rq.onupgradeneeded = () => { const s = rq.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }); s.createIndex('k', 'k'); s.createIndex('t', 't'); };
        rq.onsuccess = () => { db = rq.result; mode = 'indexeddb'; res(true); };
        rq.onerror = () => res(false);
      } catch (e) { res(false); }
    });
    return ready;
  }
  const tx = (m) => db.transaction(STORE, m).objectStore(STORE);
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  /** Convierte filas de /prices en observaciones. Ignora precios en cero o sin fecha válida. */
  function toObs(rows, t) {
    const out = [];
    for (const r of rows || []) {
      const s = r.sell_price_min > 0 && valid(r.sell_price_min_date), b = r.buy_price_max > 0 && valid(r.buy_price_max_date);
      if (!s && !b) continue;
      const o = { k: r.item_id + '|' + r.city + '|' + (r.quality || 1), item: r.item_id, city: r.city, q: r.quality || 1, t,
        sMin: s ? r.sell_price_min : null, sDate: s ? r.sell_price_min_date : null, bMax: b ? r.buy_price_max : null, bDate: b ? r.buy_price_max_date : null };
      const sig = o.sMin + '@' + o.sDate + '|' + o.bMax + '@' + o.bDate;
      if (last.get(o.k) === sig) continue;          // mismo dato ya guardado
      last.set(o.k, sig); out.push(o);
    }
    return out;
  }

  async function record(rows) {
    const obs = toObs(rows, Date.now());
    if (!obs.length) return 0;
    await open();
    if (!db) { mem = mem.concat(obs); if (mem.length > MAX) mem = mem.slice(mem.length - MAX); return obs.length; }
    try {
      const s = tx('readwrite'); obs.forEach(o => s.add(o));
      const n = await reqP(tx('readonly').count());
      if (n > MAX) await prune(n - MAX);
    } catch (e) { /* almacenamiento lleno o bloqueado: se ignora, la app sigue funcionando */ }
    return obs.length;
  }
  async function prune(n) {
    return new Promise(res => {
      const c = tx('readwrite').index('t').openCursor(); let k = 0;
      c.onsuccess = () => { const cur = c.result; if (!cur || k >= n) return res(k); cur.delete(); k++; cur.continue(); };
      c.onerror = () => res(k);
    });
  }

  /** Observaciones de un objeto en una ciudad, ordenadas por tiempo. */
  async function series(item, city, q) {
    await open();
    const k = item + '|' + city + '|' + (q || 1);
    if (!db) return mem.filter(o => o.k === k).sort((a, b) => a.t - b.t);
    try { return (await reqP(tx('readonly').index('k').getAll(k))).sort((a, b) => a.t - b.t); } catch (e) { return []; }
  }
  async function all() {
    await open();
    if (!db) return mem.slice();
    try { return await reqP(tx('readonly').getAll()); } catch (e) { return []; }
  }
  async function stats() {
    const a = await all();
    const items = new Set(a.map(o => o.item)), keys = {};
    a.forEach(o => { keys[o.k] = (keys[o.k] || 0) + 1; });
    const top = Object.entries(keys).sort((x, y) => y[1] - x[1]).slice(0, 30).map(([k, n]) => { const [item, city, q] = k.split('|'); return { item, city, q: +q, n }; });
    return { count: a.length, items: items.size, since: a.length ? Math.min(...a.map(o => o.t)) : null, until: a.length ? Math.max(...a.map(o => o.t)) : null, top, mode, max: MAX };
  }
  async function clear() {
    await open(); last.clear();
    if (!db) { mem = []; return; }
    try { await reqP(tx('readwrite').clear()); } catch (e) { }
  }
  async function exportJSON() { return { app: 'Silver Master', type: 'price-snapshots', version: 1, exported: new Date().toISOString(), obs: (await all()).map(o => { const c = Object.assign({}, o); delete c.id; return c; }) }; }
  async function importJSON(obj) {
    if (!obj || !Array.isArray(obj.obs)) throw new Error('El archivo no es un historial de precios de Silver Master.');
    const clean = obj.obs.filter(o => o && o.k && o.item && o.city && typeof o.t === 'number');
    await open();
    if (!db) { mem = mem.concat(clean); return clean.length; }
    const s = tx('readwrite'); clean.forEach(o => s.add(o));
    return clean.length;
  }

  /** Resumen de precios propios para análisis: precio de venta mínimo observado por día. */
  function dailyFromObs(obs) {
    const d = {};
    obs.forEach(o => { if (!o.sMin) return; const k = new Date(o.t).toISOString().slice(0, 10); (d[k] = d[k] || []).push(o.sMin); });
    return Object.entries(d).sort().map(([day, ps]) => ({ day, price: ps.reduce((a, b) => a + b, 0) / ps.length, n: ps.length }));
  }

  // Se engancha a la capa de API: toda consulta de precios queda registrada.
  if (SM.api && SM.api.onPrices) SM.api.onPrices(rows => { record(rows); });

  SM.snapshots = { record, series, all, stats, clear, exportJSON, importJSON, dailyFromObs, toObs, mode: () => mode, open };
})(typeof window !== 'undefined' ? window : globalThis);
