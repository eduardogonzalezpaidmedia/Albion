/**
 * Silver Master — proxy opcional para Albion Online Data Project (Cloudflare Worker).
 * Úsalo solo si el navegador no puede consultar AODP directamente (CORS o bloqueo de red).
 *
 * Rutas:  https://TU-WORKER.workers.dev/{americas|europe|asia}/api/v2/stats/...
 * Reenvía a los hosts oficiales de AODP y agrega cabeceras CORS. No guarda datos ni credenciales.
 * Configura ALLOWED_ORIGIN con la URL de tu app (por ejemplo https://silver-master.pages.dev) o "*".
 */
const HOSTS = {
  americas: 'https://west.albion-online-data.com',
  europe: 'https://europe.albion-online-data.com',
  asia: 'https://east.albion-online-data.com'
};

export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('Método no permitido', { status: 405, headers: cors });

    const url = new URL(request.url);
    const [, server, ...rest] = url.pathname.split('/');
    const host = HOSTS[server];
    const path = '/' + rest.join('/');
    if (!host || !path.startsWith('/api/v2/stats/')) return new Response('Ruta no válida', { status: 400, headers: cors });

    const target = host + path + url.search;
    const cache = caches.default;
    const cacheKey = new Request(target);
    let res = await cache.match(cacheKey);
    if (!res) {
      const upstream = await fetch(target, { headers: { 'Accept-Encoding': 'gzip' } });
      res = new Response(upstream.body, upstream);
      res.headers.set('Cache-Control', 'public, max-age=120');   // 2 minutos: evita repetir consultas a AODP
      if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    const out = new Response(res.body, res);
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  }
};
