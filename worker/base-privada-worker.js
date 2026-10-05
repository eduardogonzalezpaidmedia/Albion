/**
 * Silver Master — BASE DE DATOS PRIVADA de precios (Cloudflare Worker + D1).
 *
 * Recibe lo que captura el programa «Albion Data Client» en TU PC y lo guarda solo para ti.
 * Silver Master lo lee con tu clave. Nadie sin la clave puede leer ni escribir.
 *
 * Qué necesita este Worker en Cloudflare (ver worker/BASE-PRIVADA.md, paso a paso):
 *   · Una base D1 enlazada con el nombre de variable  DB
 *   · Un secreto llamado  CLAVE  (una contraseña larga que inventas tú)
 *
 * Rutas:
 *   POST /in/CLAVE/<tema>            ← lo usa el Albion Data Client (opción -p https://TU-WORKER/in/CLAVE)
 *   GET  /prices/<ids>?locations=&qualities=&key=CLAVE   → mismo formato que Albion Online Data Project
 *   GET  /orders/<id>?location=&key=CLAVE                → las órdenes vistas la última vez (precio y cantidad)
 *   GET  /sales?key=CLAVE                                → tus avisos de venta capturados
 *   GET  /stats?key=CLAVE                                → cuántos datos hay y de cuándo
 *
 * Este Worker no automatiza nada en el juego: solo guarda datos que tu propio cliente ya recibió.
 */

// Identificadores de mercado que envía el cliente → nombre que usa Silver Master.
// Si aparece un identificador que no está aquí, se guarda tal cual ("loc:XXXX") y /stats lo muestra.
const LOCATIONS = {
  '0007': 'Thetford', '1002': 'Lymhurst', '2004': 'Bridgewatch', '3008': 'Martlock', '4002': 'Fort Sterling',
  '3005': 'Caerleon', '3003': 'Black Market', '5003': 'Brecilien',
  '0301': 'Thetford Portal', '1301': 'Lymhurst Portal', '2301': 'Bridgewatch Portal', '3301': 'Martlock Portal', '4301': 'Fort Sterling Portal'
};
const cityOf = id => LOCATIONS[String(id)] || LOCATIONS[String(id).padStart(4, '0')] || ('loc:' + id);
const iso = ms => new Date(ms).toISOString().slice(0, 19);
const NODATE = '0001-01-01T00:00:00';

/** Agrupa un lote de órdenes por objeto + ciudad + calidad. El precio del cliente viene multiplicado por 10.000. */
function aggregate(orders, now) {
  const g = {};
  for (const o of orders || []) {
    if (!o || !o.ItemTypeId || !(o.UnitPriceSilver > 0)) continue;
    const price = Math.round(o.UnitPriceSilver / 10000), city = cityOf(o.LocationId), q = o.QualityLevel || 1;
    const side = String(o.AuctionType).toLowerCase() === 'request' ? 'buy' : 'sell';
    const k = o.ItemTypeId + '|' + city + '|' + q;
    const r = g[k] = g[k] || { item_id: o.ItemTypeId, city, quality: q, sell: null, buy: null };
    const s = r[side] = r[side] || { best: price, amount: 0, orders: 0, list: [] };
    s.best = side === 'sell' ? Math.min(s.best, price) : Math.max(s.best, price);
    s.amount += o.Amount || 0; s.orders++; s.list.push([price, o.Amount || 0]);
  }
  Object.values(g).forEach(r => ['sell', 'buy'].forEach(sd => { if (r[sd]) r[sd].list.sort((a, b) => sd === 'sell' ? a[0] - b[0] : b[0] - a[0]); }));
  return Object.values(g).map(r => Object.assign(r, { t: now }));
}

/** Fila de la base → formato de /api/v2/stats/prices de AODP (más campos propios con prefijo own_). */
function toRow(r) {
  return {
    item_id: r.item_id, city: r.city, quality: r.quality,
    sell_price_min: r.sell_min || 0, sell_price_min_date: r.sell_t ? iso(r.sell_t) : NODATE, sell_price_max: 0, sell_price_max_date: NODATE,
    buy_price_min: 0, buy_price_min_date: NODATE, buy_price_max: r.buy_max || 0, buy_price_max_date: r.buy_t ? iso(r.buy_t) : NODATE,
    own_sell_orders: r.sell_orders || 0, own_sell_amount: r.sell_amount || 0, own_buy_orders: r.buy_orders || 0, own_buy_amount: r.buy_amount || 0, own: true
  };
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS prices (item_id TEXT NOT NULL, city TEXT NOT NULL, quality INTEGER NOT NULL,
     sell_min INTEGER, sell_amount INTEGER, sell_orders INTEGER, sell_list TEXT, sell_t INTEGER,
     buy_max INTEGER, buy_amount INTEGER, buy_orders INTEGER, buy_list TEXT, buy_t INTEGER,
     PRIMARY KEY (item_id, city, quality))`,
  `CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY, kind TEXT, item_id TEXT, city TEXT, amount INTEGER, price INTEGER, total REAL, sold INTEGER, t INTEGER, raw TEXT)`,
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`
];
let ready = false;
async function ensure(db) { if (ready) return; await db.batch(SCHEMA.map(s => db.prepare(s))); ready = true; }

async function ingestOrders(db, body, now) {
  const rows = aggregate(body.Orders, now), st = [];
  for (const r of rows) {
    if (r.sell) st.push(db.prepare(`INSERT INTO prices (item_id, city, quality, sell_min, sell_amount, sell_orders, sell_list, sell_t) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(item_id, city, quality) DO UPDATE SET sell_min=excluded.sell_min, sell_amount=excluded.sell_amount, sell_orders=excluded.sell_orders, sell_list=excluded.sell_list, sell_t=excluded.sell_t`)
      .bind(r.item_id, r.city, r.quality, r.sell.best, r.sell.amount, r.sell.orders, JSON.stringify(r.sell.list.slice(0, 50)), now));
    if (r.buy) st.push(db.prepare(`INSERT INTO prices (item_id, city, quality, buy_max, buy_amount, buy_orders, buy_list, buy_t) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(item_id, city, quality) DO UPDATE SET buy_max=excluded.buy_max, buy_amount=excluded.buy_amount, buy_orders=excluded.buy_orders, buy_list=excluded.buy_list, buy_t=excluded.buy_t`)
      .bind(r.item_id, r.city, r.quality, r.buy.best, r.buy.amount, r.buy.orders, JSON.stringify(r.buy.list.slice(0, 50)), now));
  }
  for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50));
  return rows.length;
}
async function ingestSale(db, body, now) {
  const n = body.Notification || {}; if (!n.Id) return 0;
  await db.prepare(`INSERT OR REPLACE INTO sales (id, kind, item_id, city, amount, price, total, sold, t, raw) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(n.Id, body.NotificationType || '', n.ItemTypeId || '', cityOf(n.LocationId), n.Amount || 0, Math.round((n.UnitPriceSilver || 0) / 10000), n.TotalAfterTaxes ?? null, n.Sold ?? null, now, JSON.stringify(body).slice(0, 2000)).run();
  return 1;
}

export default {
  _aggregate: aggregate, _toRow: toRow,      // para las pruebas
  async fetch(request, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
    const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors) });
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!env.DB) return json({ error: 'Falta enlazar la base D1 con el nombre DB.' }, 500);
    if (!env.CLAVE || String(env.CLAVE).length < 12) return json({ error: 'Falta el secreto CLAVE (mínimo 12 caracteres).' }, 500);
    const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean), now = Date.now();
    try {
      // ---- escritura: Albion Data Client ----
      if (request.method === 'POST' && parts[0] === 'in') {
        if (parts[1] !== env.CLAVE) return json({ error: 'Clave incorrecta.' }, 403);
        const topic = parts[2] || '', body = await request.json();
        await ensure(env.DB);
        let n = 0;
        if (topic === 'marketorders.ingest') n = await ingestOrders(env.DB, body, now);
        else if (topic === 'marketnotifications') n = await ingestSale(env.DB, body, now);
        // los demás temas (oro, historial, mapas) se aceptan y se ignoran
        await env.DB.prepare(`INSERT OR REPLACE INTO meta (k, v) VALUES ('last_in', ?)`).bind(String(now)).run();
        return json({ ok: true, topic, saved: n });
      }
      // ---- lectura: Silver Master ----
      if (request.method !== 'GET') return json({ error: 'Método no permitido.' }, 405);
      if (url.searchParams.get('key') !== env.CLAVE) return json({ error: 'Clave incorrecta.' }, 403);
      await ensure(env.DB);
      if (parts[0] === 'prices') {
        const ids = decodeURIComponent(parts.slice(1).join('/')).replace(/\.json$/, '').split(',').filter(Boolean).slice(0, 400);
        const locs = (url.searchParams.get('locations') || '').split(',').filter(Boolean), quals = (url.searchParams.get('qualities') || '').split(',').map(Number).filter(Boolean);
        const out = [];
        for (let i = 0; i < ids.length; i += 80) {
          const chunk = ids.slice(i, i + 80);
          const r = await env.DB.prepare(`SELECT * FROM prices WHERE item_id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all();
          for (const row of r.results || []) { if (locs.length && !locs.includes(row.city)) continue; if (quals.length && !quals.includes(row.quality)) continue; out.push(toRow(row)); }
        }
        return json(out);
      }
      if (parts[0] === 'orders') {
        const id = decodeURIComponent(parts[1] || ''), loc = url.searchParams.get('location');
        const r = await env.DB.prepare(`SELECT * FROM prices WHERE item_id = ?`).bind(id).all();
        return json((r.results || []).filter(x => !loc || x.city === loc).map(x => ({ item_id: x.item_id, city: x.city, quality: x.quality, sell: JSON.parse(x.sell_list || '[]'), sell_date: x.sell_t ? iso(x.sell_t) : null, buy: JSON.parse(x.buy_list || '[]'), buy_date: x.buy_t ? iso(x.buy_t) : null })));
      }
      if (parts[0] === 'sales') {
        const r = await env.DB.prepare(`SELECT id, kind, item_id, city, amount, price, total, sold, t FROM sales ORDER BY t DESC LIMIT 200`).all();
        return json((r.results || []).map(x => Object.assign(x, { date: iso(x.t) })));
      }
      if (parts[0] === 'stats') {
        const a = await env.DB.prepare(`SELECT COUNT(*) AS n, COUNT(DISTINCT item_id) AS items, MAX(MAX(COALESCE(sell_t,0)), MAX(COALESCE(buy_t,0))) AS last FROM prices`).first();
        const c = await env.DB.prepare(`SELECT city, COUNT(*) AS n FROM prices GROUP BY city ORDER BY n DESC`).all();
        const s = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sales`).first();
        const m = await env.DB.prepare(`SELECT v FROM meta WHERE k = 'last_in'`).first();
        return json({ ok: true, rows: a.n || 0, items: a.items || 0, last_price: a.last ? iso(a.last) : null, last_received: m ? iso(+m.v) : null, sales: s.n || 0,
          cities: c.results || [], unknown_locations: (c.results || []).filter(x => x.city.startsWith('loc:')).map(x => x.city) });
      }
      return json({ ok: true, name: 'Silver Master · base privada', routes: ['/prices', '/orders', '/sales', '/stats'] });
    } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
  }
};
