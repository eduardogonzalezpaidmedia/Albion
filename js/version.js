/* Silver Master — versión de la app. Cambiar aquí, en <html data-version> y en los ?v= de index.html en cada actualización. */
(function (root) {
  const SM = root.SM = root.SM || {};
  SM.VERSION = '2.0';
  SM.CHANGELOG = [
    { v: '2.0', date: '2026-10-03', items: [
      'Menú nuevo: las 17 pantallas se agrupan en 4 secciones (Fabricar, Buscar, Mercado, Mi plata) con una barra fija abajo.',
      'Arriba solo se ven las pantallas de la sección en la que estás. Cada sección recuerda la última pantalla que usaste.',
      'Inicio nuevo: tus accesos directos (los eliges con ★) y «Ver todo» ordenado por sección.',
      'No cambia ningún cálculo ni se pierde nada de lo guardado.'
    ] },
    { v: '1.9', date: '2026-10-03', items: [
      'Nuevo: Fabricación. Armas, secundarias, armaduras, cascos, botas, bolsos y capas en tabla, igual que Pociones.',
      'Eliges la categoría y ves cada objeto con una fila por tier y una columna por encantamiento (.0 a .4): costo, ganancia o ROI.',
      'Precios de artefactos de la categoría en la misma pantalla (una fila por artefacto, una columna por tier).',
      'Precios de materiales refinados (lingotes, tablas, cuero y tela) por tier y encantamiento, compartidos entre todas las categorías.'
    ] },
    { v: '1.8', date: '2026-10-03', items: [
      'Pociones rehecha en dos pantallas. «Precios de materiales»: todos los materiales agrupados (hierbas, huevos/leche/manteca, alcohol, extractos, ingredientes raros) con su casilla de precio.',
      '«Pociones»: tabla por tipo con una fila por tier y una columna por encantamiento (.0 a .3). Muestra costo, ganancia o ROI por poción.',
      'Ajustes arriba: ubicación con o sin bono, bono del día, foco, tarifa, tipo de venta y Premium. Aviso cuando faltan precios.',
      'Tocar un número abre el detalle con materiales, precio de venta y rentabilidad.'
    ] },
    { v: '1.7', date: '2026-10-03', items: [
      'Nuevo: Pociones. Lista de pociones por tipo; al elegir una aparecen sus materiales para escribir el precio de cada uno.',
      'Calcula la rentabilidad: costo total y por poción, ingreso neto, ganancia, ROI y precio mínimo para no perder.',
      'Los precios que escribes se guardan en el dispositivo y sirven para todas las pociones que usan ese material. Los precios en línea son opcionales.'
    ] },
    { v: '1.6', date: '2026-10-02', items: [
      'Nuevo: Artefactos. Busca objetos con artefacto (T4 y T5 por defecto, calidad normal) para vender al Mercado Negro.',
      'Para cada artefacto indica en qué ciudad poner la orden de compra, cuánto ofrecer y cuánto ahorras frente a comprarlo directo.',
      'Ordena por ganancia por día (ganancia por unidad × ventas diarias en el Mercado Negro) y avisa si el artefacto se mueve poco.',
      'Cada resultado se abre en la Calculadora sencilla con el precio del artefacto ya anotado.'
    ] },
    { v: '1.5', date: '2026-10-02', items: [
      'Calculadora sencilla: ahora puedes escribir tú las ventas de cada uno de los 7 días. La cantidad sugerida se recalcula al instante.',
      'Los días vienen con el dato en línea cuando existe; puedes cambiar solo algunos, volver a los datos en línea o borrar todo.'
    ] },
    { v: '1.4', date: '2026-10-02', items: [
      'Nuevo: Calculadora sencilla para el Mercado Negro. Escribes el precio que paga y te dice si es factible fabricar.',
      'Muestra cuántos materiales comprar, en qué ciudad están más baratos y su precio en línea; puedes anotar tus propios precios.',
      'Ventas por día de los últimos 7 días en el Mercado Negro y cantidad sugerida a fabricar.'
    ] },
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
