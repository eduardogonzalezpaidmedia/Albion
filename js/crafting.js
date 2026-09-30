/* Silver Master — datos del juego (objetos, recetas, ciudades) y utilidades de fabricación. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const D = SM.data = { items: [], recipes: [], materials: [], cities: [], stations: {}, settings: {}, meta: {} };
  const byId = {}, recipeById = {}, matById = {};

  const CATEGORY_LABEL = {
    weapons: 'Armas', armor: 'Armaduras', head: 'Cascos', shoes: 'Botas', offhands: 'Secundarias', capes: 'Capas',
    bags: 'Bolsos', potions: 'Pociones', food: 'Comida', refined: 'Refinado', tools: 'Herramientas', gatherer_gear: 'Equipo de recolector'
  };
  const QUALITIES = [
    { q: 1, label: 'Normal' }, { q: 2, label: 'Buena' }, { q: 3, label: 'Notable' }, { q: 4, label: 'Sobresaliente' }, { q: 5, label: 'Obra maestra' }
  ];

  /** Carga: con servidor lee data/*.json; abierto como archivo usa data/game-data.js (window.SM_BUNDLE). */
  async function load() {
    let b = null;
    if (root.location && /^https?:/.test(root.location.protocol)) {
      try {
        const names = ['items', 'recipes', 'materials', 'cities', 'stations', 'settings'];
        const parts = await Promise.all(names.map(n => fetch('data/' + n + '.json').then(r => { if (!r.ok) throw new Error(n); return r.json(); })));
        b = {}; names.forEach((n, i) => b[n] = parts[i]);
      } catch (e) { b = null; }
    }
    if (!b && !root.SM_BUNDLE && root.document) {
      await new Promise(res => { const sc = document.createElement('script'); sc.src = 'data/game-data.js'; sc.onload = res; sc.onerror = res; document.head.appendChild(sc); });
    }
    if (!b && root.SM_BUNDLE) b = root.SM_BUNDLE;
    if (!b) throw new Error('No encontré los datos del juego. Ejecuta scripts/build_bundle.py o abre la app desde un servidor.');
    D.items = b.items.items; D.recipes = b.recipes.recipes; D.materials = b.materials.materials;
    D.cities = b.cities.locations; D.citiesMeta = b.cities.meta; D.stations = b.stations.stations; D.settings = b.settings;
    D.meta = b.items.meta;
    D.items.forEach(i => { byId[i.item_id] = i; i._norm = norm(i.name + ' ' + (i.name_en || '')); });
    D.recipes.forEach(r => recipeById[r.recipe_id] = r);
    D.materials.forEach(m => matById[m.item_id] = m);
    return D;
  }

  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const tierOf = id => { const m = /^T(\d)/.exec(id); return m ? +m[1] : null; };
  const enchOf = id => { const m = /@(\d)$/.exec(id); return m ? +m[1] : 0; };

  function item(id) { return byId[id] || null; }
  function recipe(id) { const it = byId[id]; return it ? recipeById[it.recipe_id] || null : null; }
  function name(id) { const it = byId[id] || matById[id]; return it ? it.name : id; }
  function label(id) { const t = tierOf(id); return name(id) + (t ? ' ' + t + '.' + enchOf(id) : ''); }

  /** Búsqueda por texto: "espada ancha 6.1", "t6.1 hacha", "bow". */
  function search(q, limit) {
    const n = norm(q).trim(); if (!n) return [];
    let tier = null, ench = null;
    const te = /\bt?([2-8])(?:\.([0-4]))?\b/.exec(n);
    let words = n;
    if (te) { tier = +te[1]; ench = te[2] !== undefined ? +te[2] : null; words = n.replace(te[0], ' '); }
    const ws = words.split(/\s+/).filter(Boolean);
    const out = [];
    for (const it of D.items) {
      if (tier !== null && it.tier !== tier) continue;
      if (ench !== null && it.enchantment !== ench) continue;
      if (ws.every(w => it._norm.includes(w))) { out.push(it); if (out.length >= (limit || 40)) break; }
    }
    return out;
  }

  const city = id => D.cities.find(c => c.id === id) || null;
  const marketLocations = () => D.cities.filter(c => c.market).map(c => c.aodp);
  const buyLocations = () => D.cities.filter(c => c.market && !c.sell_only).map(c => c.aodp);

  /** ¿La ciudad tiene bono para este objeto? Solo aplica bonos verificados. */
  function bonusFor(it, cityId) {
    const c = city(cityId); if (!c || !it) return { kind: null, verified: false };
    if (it.category === 'refined') {
      const rb = c.refining_bonus || {};
      return { kind: rb.verified && (rb.stations || []).includes(it.crafting_station) ? 'refining' : null, verified: !!rb.verified, note: rb.note };
    }
    const cb = c.crafting_bonus || {};
    if (!cb.verified) return { kind: null, verified: false, note: cb.note };
    const hit = (cb.subcategories || []).includes(it.subcategory) || (cb.categories || []).includes(it.category);
    return { kind: hit ? 'crafting' : null, verified: true };
  }

  /** Ciudad donde este objeto tiene bono verificado (si hay). */
  function bonusCity(it) {
    for (const c of D.cities) { const b = bonusFor(it, c.id); if (b.kind) return c.id; }
    return null;
  }

  SM.crafting = { load, item, recipe, name, label, search, city, marketLocations, buyLocations, bonusFor, bonusCity, tierOf, enchOf, norm, CATEGORY_LABEL, QUALITIES };
})(typeof window !== 'undefined' ? window : globalThis);
