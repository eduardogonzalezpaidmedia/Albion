/* Silver Master — versión de la app. Cambiar aquí, en <html data-version> y en los ?v= de index.html en cada actualización. */
(function (root) {
  const SM = root.SM = root.SM || {};
  SM.VERSION = '1.3';
  SM.CHANGELOG = [
    { v: '1.3', date: '2026-10-01', items: [
      'Nuevo: Market Intelligence. Panel general, oportunidades por plazo (24 h, 48 h, 72 h y largo plazo) con cartera que no supera tu capital.',
      'Oportunidades de fabricación, refinamiento, Mercado Negro, reventa local y arbitraje entre ciudades, con costos detallados, riesgo, confianza y motivo.',
      'Demanda y rotación: compara mercados, separa volumen observado, demanda estimada y tu velocidad de venta; escenarios conservador, intermedio y optimista de 24 h a 30 días.',
      'Simulador de inversión: capital, reserva, % por operación, precio de equilibrio, caídas de 5/10/15% y ventas parciales.',
      'Riesgo con reglas visibles y configurables. Detección de precios en cero, atípicos y diferencias anormales entre ciudades.',
      'Operaciones planificada → activa → cerrada, con estimado vs real. Las ventas reales ajustan las estimaciones de rotación (desde 3 operaciones).',
      'Historial propio: la app guarda en el dispositivo cada precio que consulta. Alertas de 24/48/72 h, rotación lenta y caídas de precio.',
      'Asistente de preguntas que responde con los cálculos de la app.'
    ] },
    { v: '1.2', date: '2026-10-01', items: [
      'Venta local: nuevo panel «Qué datos faltan». Muestra qué materiales no tienen precio y en qué ciudad, qué objetos no tienen precio de venta y cuáles solo tienen precios viejos.',
      'Sugerencias concretas: cambiar el tipo de venta o subir las horas máximas cuando eso destraba objetos.',
      'Lista objeto por objeto; al tocarlo se abre en la calculadora para escribir el precio a mano.'
    ] },
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
