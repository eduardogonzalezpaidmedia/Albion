/* Silver Master — diario de producción. Registra lotes y ventas reales para medir tu ganancia y tu parte del mercado.
   Se guarda en localStorage (exportable/importable como JSON para pasarlo entre dispositivos). */
(function (root) {
  const SM = root.SM = root.SM || {};
  const KEY = 'journal';
  const DAY = 86400000;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const all = () => SM.storage.get(KEY, []);
  const save = list => SM.storage.set(KEY, list);

  /** entry = {item_id, location, units, totalCost, date, note} */
  function addBatch(e) {
    const list = all();
    const b = { id: uid(), item_id: e.item_id, location: e.location, units: Math.max(1, Math.round(+e.units || 0)), totalCost: +e.totalCost || 0, date: e.date || Date.now(), note: e.note || '', sales: [] };
    list.unshift(b); save(list); return b;
  }
  /** sale = {units, unitPrice, mode:'instant'|'order', date} — el neto se calcula con tus impuestos actuales. */
  function addSale(batchId, s, taxes) {
    const list = all(); const b = list.find(x => x.id === batchId); if (!b) return null;
    const units = Math.max(1, Math.round(+s.units || 0)), price = +s.unitPrice || 0;
    const gross = units * price;
    const tax = gross * taxes.taxPct / 100, setup = s.mode === 'order' ? gross * taxes.setupPct / 100 : 0;
    b.sales.push({ id: uid(), units, unitPrice: price, mode: s.mode, date: s.date || Date.now(), net: gross - tax - setup });
    save(list); return b;
  }
  function removeBatch(id) { save(all().filter(b => b.id !== id)); }
  function removeSale(batchId, saleId) { const list = all(); const b = list.find(x => x.id === batchId); if (b) b.sales = b.sales.filter(s => s.id !== saleId); save(list); }

  /** Métricas de un lote. */
  function stats(b, now) {
    now = now || Date.now();
    const sold = b.sales.reduce((s, x) => s + x.units, 0);
    const net = b.sales.reduce((s, x) => s + x.net, 0);
    const unitCost = b.units ? b.totalCost / b.units : 0;
    const costSold = unitCost * sold;
    const last = b.sales.length ? Math.max(...b.sales.map(s => s.date)) : null;
    const end = sold >= b.units && last ? last : now;
    const days = Math.max((end - b.date) / DAY, 1);   // mínimo 1 día para no exagerar ventas/día
    return {
      sold, remaining: Math.max(b.units - sold, 0), net, unitCost,
      realizedProfit: net - costSold, roiSold: costSold ? (net - costSold) / costSold * 100 : null,
      perDay: sold / days, days, avgPrice: sold ? b.sales.reduce((s, x) => s + x.units * x.unitPrice, 0) / sold : null,
      done: sold >= b.units
    };
  }

  function totals(list) {
    list = list || all();
    let invested = 0, net = 0, costSold = 0, units = 0, sold = 0;
    list.forEach(b => { const s = stats(b); invested += b.totalCost; net += s.net; costSold += s.unitCost * s.sold; units += b.units; sold += s.sold; });
    return { batches: list.length, invested, net, realizedProfit: net - costSold, units, sold, stockValue: invested - costSold };
  }

  /**
   * Tu parte real del mercado: tus ventas por día ÷ ventas del mercado por día (AODP) en el mismo período y lugar.
   * histRow: historial diario de AODP. Devuelve null si no hay datos suficientes.
   */
  function realShare(b, histRow) {
    const s = stats(b);
    if (!s.sold || !histRow || !histRow.data) return null;
    const start = b.date, end = s.done ? Math.max(...b.sales.map(x => x.date)) : Date.now();
    const pts = histRow.data.filter(p => { const t = Date.parse(p.timestamp + 'Z'); return t >= start - DAY && t <= end; });
    const market = pts.reduce((a, p) => a + p.item_count, 0);
    if (!market) return null;
    return { share: s.sold / market, mine: s.sold, market, days: s.days };
  }

  function exportJSON() { return { app: 'Silver Master', type: 'journal', version: 1, exported: new Date().toISOString(), batches: all() }; }
  function importJSON(obj, mode) {
    if (!obj || !Array.isArray(obj.batches)) throw new Error('El archivo no es un diario de Silver Master.');
    const clean = obj.batches.filter(b => b && b.id && b.item_id && Array.isArray(b.sales));
    if (mode === 'replace') { save(clean); return clean.length; }
    const list = all(), ids = new Set(list.map(b => b.id));
    clean.forEach(b => { if (!ids.has(b.id)) list.push(b); });
    list.sort((a, b) => b.date - a.date); save(list); return clean.length;
  }

  SM.journal = { all, addBatch, addSale, removeBatch, removeSale, stats, totals, realShare, exportJSON, importJSON };
})(typeof window !== 'undefined' ? window : globalThis);
