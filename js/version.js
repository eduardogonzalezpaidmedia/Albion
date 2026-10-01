/* Silver Master — versión de la app. Cambiar aquí, en <html data-version> y en los ?v= de index.html en cada actualización. */
(function (root) {
  const SM = root.SM = root.SM || {};
  SM.VERSION = '1.0';
  SM.CHANGELOG = [
    { v: '1.0', date: '2026-10-01', items: [
      'Versión inicial numerada.',
      'Calculadora, Market Scanner, Black Market, Mercado global, Rutas, Historial, Mi silver y Ajustes.',
      'Cantidad óptima según historial de ventas y tendencia de precio.',
      'Refinado local, Cadena de producción, Reventa y Diario de producción.',
      'Arreglo: tocar un resultado abre siempre el detalle.'
    ] }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
