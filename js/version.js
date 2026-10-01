/* Silver Master — versión de la app. Cambiar aquí, en <html data-version> y en los ?v= de index.html en cada actualización. */
(function (root) {
  const SM = root.SM = root.SM || {};
  SM.VERSION = '1.1';
  SM.CHANGELOG = [
    { v: '1.1', date: '2026-10-01', items: [
      'Nuevo: Venta local. Comprar materiales, fabricar y vender en la misma ciudad, sin transporte.',
      'Modos: todo en una ciudad (con filtro «solo lo que esta ciudad fabrica con bono») o cada objeto en su ciudad con bono.',
      'Incluye retorno con bono, foco, cantidad óptima, tendencia de precio y silver/hora.'
    ] },
    { v: '1.0', date: '2026-10-01', items: [
      'Versión inicial numerada.',
      'Calculadora, Market Scanner, Black Market, Mercado global, Rutas, Historial, Mi silver y Ajustes.',
      'Cantidad óptima según historial de ventas y tendencia de precio.',
      'Refinado local, Cadena de producción, Reventa y Diario de producción.',
      'Arreglo: tocar un resultado abre siempre el detalle.'
    ] }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
