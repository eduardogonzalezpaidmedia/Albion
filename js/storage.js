/* Silver Master — persistencia local (localStorage). Nunca guarda contraseñas ni credenciales. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const PREFIX = 'silver-master:';

  function get(key, fallback) {
    try { const v = root.localStorage.getItem(PREFIX + key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function set(key, value) {
    try { root.localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }
  function remove(key) { try { root.localStorage.removeItem(PREFIX + key); } catch (e) { } }

  const DEFAULT_PROFILE = {
    server: 'americas', city: 'Lymhurst', premium: false, focus: false, focusAvailable: 0,
    ownSpec: 0, mastery: 0, otherSpecsSum: 0,
    capital: 6000000, hours: 2, risk: 'medio'
  };
  const DEFAULT_PREFS = {
    taxPremiumPct: null, taxNoPremiumPct: null, setupFeePct: null,   // null = usar data/settings.json
    cacheMinutes: null, proxyUrl: '', focusSilverValue: null,
    transportPerUnit: 0, craftingFee: 0, dailyBonus: 0,
    minutes: { buy: 10, transport1: 10, craft: 5, transport2: 10, sell: 10 },
    maxAgeHours: 12, currency: 'plata', language: 'es'
  };

  SM.storage = {
    get, set, remove,
    profile: () => Object.assign({}, DEFAULT_PROFILE, get('profile', {})),
    saveProfile: p => set('profile', p),
    prefs: () => { const p = Object.assign({}, DEFAULT_PREFS, get('prefs', {})); p.minutes = Object.assign({}, DEFAULT_PREFS.minutes, p.minutes || {}); return p; },
    savePrefs: p => set('prefs', p),
    favorites: () => get('favorites', []),
    toggleFavorite: id => { const f = get('favorites', []); const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.push(id); set('favorites', f); return i < 0; },
    manualPrices: () => get('manual-prices', {}),                     // {item_id: {price, t}}
    setManualPrice: (id, price) => { const m = get('manual-prices', {}); if (price === null) delete m[id]; else m[id] = { price, t: Date.now() }; set('manual-prices', m); },
    alerts: () => get('alerts', []),
    saveAlerts: a => set('alerts', a),
    DEFAULT_PROFILE, DEFAULT_PREFS
  };
})(typeof window !== 'undefined' ? window : globalThis);
