/* Silver Master — navegación por secciones (v2.0).
   Las pantallas se agrupan en 4 secciones con una barra fija abajo. La fila de pestañas de arriba
   muestra solo las de la sección actual. El Inicio tiene accesos directos que el usuario elige con ★. */
(function (root) {
  const SM = root.SM = root.SM || {};
  const SECTIONS = [
    { key: 'make', label: 'Fabricar', icon: 'M4 20h16M6 20V10l6-6 6 6v10M10 20v-5h4v5', views: ['craft', 'potions', 'simple', 'calc'] },
    { key: 'find', label: 'Buscar', icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', views: ['artifacts', 'bm', 'scanner', 'local', 'refine', 'flip', 'finder'] },
    { key: 'market', label: 'Mercado', icon: 'M4 19V5M4 19h16M8 15l3-4 3 2 5-7', views: ['global', 'history', 'routes'] },
    { key: 'money', label: 'Mi plata', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v10M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 3 6 1.400 6 4.300 0 1.300-1.300 2.200-3 2.200-1.400 0-2.600-.6-3.200-1.600', views: ['intel', 'journal', 'settings'] }
  ];
  const INFO = {
    craft: ['Fabricación', 'Armas, armaduras y botas en tabla por tier y encantamiento.'],
    potions: ['Pociones', 'Costo y rentabilidad de cada poción con tus precios.'],
    simple: ['Calculadora sencilla', '¿Conviene fabricar un objeto para el Mercado Negro?'],
    calc: ['Calculadora completa', 'Costo, ganancia y ROI de un objeto con todas las opciones.'],
    artifacts: ['Artefactos', 'Objetos con artefacto para el Mercado Negro, con orden de compra.'],
    bm: ['Black Market', 'Qué fabricar para vender al Mercado Negro.'],
    scanner: ['Market Scanner', 'Escanea muchos objetos y ordena por ganancia o liquidez.'],
    local: ['Venta local', 'Comprar, fabricar y vender en la misma ciudad.'],
    refine: ['Refinado local', 'Refinar y vender en la misma ciudad.'],
    flip: ['Reventa', 'Comprar barato y revender sin fabricar.'],
    finder: ['Mi silver', 'Alternativas según tu capital, tiempo y riesgo.'],
    global: ['Mercado global', 'Precios de un objeto en todas las ciudades.'],
    history: ['Historial', 'Precio y volumen de 24 h a 90 días.'],
    routes: ['Rutas', 'Compra, transporte, fabricación y venta.'],
    intel: ['Market Intelligence', 'Oportunidades, rotación, riesgo y operaciones.'],
    journal: ['Diario', 'Tus lotes y ventas reales.'],
    settings: ['Ajustes', 'Perfil, impuestos y preferencias.']
  };
  const DEFAULT_SHORTCUTS = ['craft', 'potions', 'simple', 'artifacts'];
  const sectionOf = v => SECTIONS.find(s => s.views.includes(v)) || null;
  const shortcuts = () => SM.storage.get('shortcuts', DEFAULT_SHORTCUTS).filter(v => INFO[v]);
  const lastOf = k => { const l = SM.storage.get('last-view', {}); const s = SECTIONS.find(x => x.key === k); return s.views.includes(l[k]) ? l[k] : s.views[0]; };
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => SM.ui.esc(s);

  function init() {
    const tabs = $('#tabs');
    // ordena las pestañas de arriba según la sección y les pone el nombre corto
    SECTIONS.forEach(s => s.views.forEach(v => { const b = tabs.querySelector(`[data-view="${v}"]`); if (b) { b.textContent = INFO[v][0]; b.dataset.section = s.key; tabs.appendChild(b); } }));
    const home = tabs.querySelector('[data-view="home"]'); if (home) home.hidden = true;
    $('#bottomNav').innerHTML = `<button type="button" data-sec="home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7M6 10v10h12V10"/></svg><span>Inicio</span></button>` +
      SECTIONS.map(s => `<button type="button" data-sec="${s.key}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${s.icon}"/></svg><span>${s.label}</span></button>`).join('');
    $('#bottomNav').onclick = e => { const b = e.target.closest('[data-sec]'); if (!b) return; SM.app.go(b.dataset.sec === 'home' ? 'home' : lastOf(b.dataset.sec)); };
    document.body.classList.add('has-bottom');
  }

  /** Se llama en cada cambio de pantalla. */
  function onGo(view) {
    const sec = sectionOf(view), key = sec ? sec.key : 'home';
    $$('#tabs button').forEach(b => { b.hidden = b.dataset.section !== key; });
    $('#tabs').hidden = !sec;
    $$('#bottomNav button').forEach(b => { if (b.dataset.sec === key) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (sec) { const l = SM.storage.get('last-view', {}); l[sec.key] = view; SM.storage.set('last-view', l); }
    if (view === 'home') renderHome();
  }

  let editing = false;
  function renderHome() {
    const sc = shortcuts(), host = $('#homeNav'); if (!host) return;
    host.innerHTML = `<section class="panel">
        <div class="ph"><h2>Tus accesos directos</h2><button class="btn ghost" id="scEdit">${editing ? 'Listo' : 'Elegir'}</button></div>
        ${sc.length ? `<div class="sc-grid">${sc.map(v => `<button class="sc" data-go="${v}"><b>${esc(INFO[v][0])}</b><span>${esc(INFO[v][1])}</span></button>`).join('')}</div>` : '<p class="muted small">Aún no elegiste accesos directos. Toca «Elegir» y marca con ★ las pantallas que más usas.</p>'}
        ${editing ? '<p class="hint">Marca con ★ las pantallas que quieres tener aquí arriba.</p>' : ''}
      </section>
      <section class="panel"><div class="ph"><h2>Ver todo</h2></div>
        ${SECTIONS.map(s => `<div class="all-sec"><h3>${esc(s.label)}</h3><div class="all-list">${s.views.map(v => `<div class="all-row"><button class="all-go" data-go="${v}"><b>${esc(INFO[v][0])}</b><span>${esc(INFO[v][1])}</span></button><button class="star" data-star="${v}" aria-pressed="${sc.includes(v)}" title="Acceso directo" aria-label="Acceso directo: ${esc(INFO[v][0])}">★</button></div>`).join('')}</div></div>`).join('')}
      </section>`;
    $('#scEdit').onclick = () => { editing = !editing; renderHome(); if (editing) host.querySelector('.all-sec').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    $$('#homeNav [data-star]').forEach(b => b.onclick = () => { let s = shortcuts(); const v = b.dataset.star; s = s.includes(v) ? s.filter(x => x !== v) : s.concat([v]); SM.storage.set('shortcuts', s); renderHome(); });
  }

  SM.nav = { SECTIONS, INFO, init, onGo, renderHome, sectionOf, shortcuts };
})(typeof window !== 'undefined' ? window : globalThis);
