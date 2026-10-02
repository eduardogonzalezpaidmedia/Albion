# SILVER MASTER
**Crafting & Market Analyzer — Albion Online**

Aplicación web para analizar oportunidades de plata (silver) en Albion Online: fabricar, comprar materiales, vender en ciudades o al Mercado Negro de Caerleon, comparar rutas y revisar el historial de precios. Solo analiza datos: no automatiza nada dentro del juego ni guarda credenciales.

## Qué hace

| Módulo | Para qué sirve |
|---|---|
| **Calculadora** | Un objeto: materiales, retorno, foco, tarifa, transporte, venta en cada mercado (orden de compra y orden de venta), profit, ROI, silver/hora y el **detalle del cálculo** paso a paso. Acepta precios manuales. |
| **Market Scanner** | Escanea miles de objetos con filtros (tier, encantamiento, ciudades, mercados, ROI, profit, capital, tiempo) y ordena por profit, ROI, silver/h, capital o liquidez. |
| **Black Market** | Costo de fabricación + transporte contra la orden de compra del Mercado Negro, con ventas diarias e historial. |
| **Mercado global** | Precio de compra y venta de un objeto en cada mercado, y dónde está más barato cada material. |
| **Rutas** | Compra → transporte → fabricación → transporte → venta, y comparación de todas las combinaciones de ciudad de fabricación, mercado y tipo de venta. |
| **Historial** | Precio actual, mínimo, máximo, promedio, volumen y gráfico de 24 h, 7, 30 y 90 días (según lo que tenga AODP). |
| **Venta local** | Compra los materiales, fabrica y vende en la misma ciudad (sin transporte). Modo «todo en una ciudad» (con filtro «solo con bono») o «cada objeto en su ciudad con bono». |
| **Refinado local** | Compra el recurso en bruto, refina y vende en la misma ciudad (sin transporte). Modo «cada recurso en su ciudad con bono» o «todo en una ciudad». |
| **Reventa** | Flipping sin fabricar: en la misma ciudad (orden de compra → orden de venta) o entre ciudades, con liquidez y cantidad sugerida. |
| **Diario** | Tus lotes y ventas reales: ganancia realizada, ventas por día, stock, y tu parte real del mercado para usarla en «Cantidad óptima». Exporta/importa respaldo JSON. |
| **Mi silver** | *Silver Opportunity Finder*: alternativas según capital, ciudad, tiempo, premium, foco y riesgo. No declara ninguna como "la mejor". |
| **Ajustes** | Perfil, impuestos, tarifas, tiempos, caché, proxy, validación de mercados, alertas y fuentes. |

También: favoritos ⭐, alertas 🔔, caché con marca de tiempo, antigüedad de cada precio (fresco / reciente / antiguo / muy antiguo), indicador de confianza (Alta / Media / Baja, orientativo) y exportación CSV/JSON.

## Cómo ejecutarlo

**Opción 1 — sin instalar nada:** abre `index.html` con doble clic. La app usa `data/game-data.js` (los datos empaquetados) porque el navegador no deja leer archivos `.json` desde el disco.

**Opción 2 — con un servidor local** (lee `data/*.json` directamente):
```bash
cd silver-master
python3 -m http.server 8000
# abre http://localhost:8000
```

**Pruebas del motor de cálculo** (datos DEMO, separados de los reales):
```bash
node tests/run-tests.js
```

## Estructura

```
silver-master/
├── index.html
├── README.md
├── css/style.css
├── js/
│   ├── api.js              # ÚNICA capa de acceso a AODP: getPrices(), getHistory(), caché, reintentos, proxy
│   ├── version.js          # número de versión y registro de cambios
│   ├── storage.js          # localStorage: perfil, preferencias, favoritos, precios manuales, alertas
│   ├── crafting.js         # carga de datos del juego, búsqueda de objetos, bonos de ciudad
│   ├── returnRate.js       # retorno de recursos y costo de foco (fórmulas en data/settings.json)
│   ├── market.js           # órdenes de compra/venta, antigüedad, confianza, mejores precios
│   ├── profit.js           # motor puro: calculateMaterialCost() … calculateSilverPerHour(), craftBatch()
│   ├── scanner.js          # evaluación de un objeto y escaneo masivo
│   ├── routes.js           # análisis de rutas
│   ├── history.js          # historial y gráfico SVG
│   ├── finder.js           # Silver Opportunity Finder (perfiles de riesgo)
│   ├── demand.js           # cantidad óptima: probabilidad de venta, tendencia de precio, ganancia esperada
│   ├── chain.js            # cadena de producción: comprar el refinado vs refinarlo tú
│   ├── flipping.js         # reventa sin fabricar
│   ├── journal.js          # diario de producción
│   ├── view-extra.js       # pantallas Refinado local, Reventa y Diario
│   ├── alerts.js           # reglas de alertas
│   ├── export.js           # CSV / JSON
│   ├── ui.js               # componentes de interfaz (tablas ordenables, buscador, detalle del cálculo)
│   ├── view-calculator.js  # pantalla Calculadora
│   ├── view-market.js      # pantallas Scanner, Black Market, Mercado global y Mi silver
│   ├── view-routes.js      # pantallas Rutas e Historial
│   └── app.js              # arranque, navegación, Inicio y Ajustes
├── data/
│   ├── items.json          # objetos (generado)
│   ├── recipes.json        # recetas (generado)
│   ├── materials.json      # nombres de materiales (generado)
│   ├── cities.json         # mercados y bonos de ciudad (con fuentes)
│   ├── stations.json       # códigos de estación → etiquetas
│   ├── settings.json       # impuestos, fórmula de retorno, foco, servidores (con fuentes y fechas)
│   └── game-data.js        # todo lo anterior empaquetado para abrir sin servidor (generado)
├── scripts/
│   ├── convert_ao_bin_dumps.py   # descarga y convierte los datos oficiales del juego
│   └── build_bundle.py           # regenera data/game-data.js
├── tests/
│   ├── fixtures.demo.js    # datos DEMO ficticios
│   └── run-tests.js        # 57 pruebas del motor
├── worker/
│   ├── cloudflare-worker.js  # proxy opcional
│   └── wrangler.toml
└── assets/icons/silver-master.svg
```

**Cambios respecto a la estructura propuesta:** `returnRate.js`, `history.js`, `finder.js`, `alerts.js` y `export.js` son módulos separados para poder probarlos y cambiarlos por separado. Las pantallas están en `view-*.js` para que `ui.js` solo tenga componentes reutilizables. Se usan scripts clásicos (no módulos ES) para que `index.html` funcione con doble clic, sin servidor.

## Datos del juego (objetos y recetas)

Fuente: **[ao-data/ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps)**, los datos extraídos del cliente del juego que mantiene el mismo proyecto que AODP. Las cantidades, IDs, foco base y unidades producidas salen tal cual; no hay recetas escritas a mano.

Para actualizar después de un parche:
```bash
python3 scripts/convert_ao_bin_dumps.py   # descarga items.json y formatted/items.json y genera data/*.json
python3 scripts/build_bundle.py           # regenera data/game-data.js
```

**Añadir objetos o categorías:** edita la lista `INCLUDE` al inicio de `scripts/convert_ao_bin_dumps.py` y vuelve a ejecutar ambos scripts. No hace falta tocar el código de la app.

Incluye: armas, armaduras, cascos, botas, secundarias, capas, bolsos, pociones, comida, refinado, herramientas y equipo de recolector (T2–T8, encantamientos .0 a .4 cuando existen). Cada encantamiento es un objeto distinto con su propio ID (por ejemplo `T6_MAIN_SWORD` y `T6_MAIN_SWORD@1`).

## Precios: Albion Online Data Project (AODP)

- Servidores (en `data/settings.json`): Américas `west.albion-online-data.com`, Europa `europe.albion-online-data.com`, Asia `east.albion-online-data.com`. Cambia de servidor en la barra superior o en Ajustes. La caché se vacía al cambiar, así que los precios no se mezclan.
- Endpoints usados: `/api/v2/stats/prices/{ids}.json` y `/api/v2/stats/history/{ids}.json` con `locations`, `qualities` y `time-scale`.
- Límites publicados por AODP: 180 consultas por minuto y 300 cada 5 minutos. La app agrupa IDs por consulta, usa caché (5 minutos por defecto) y reintenta cuando recibe 429.
- En **Ajustes → Probar conexión y validar mercados** la app comprueba qué ubicaciones devuelven datos reales (incluido `Black Market`, el nombre que usa AODP para el Mercado Negro).
- Si AODP no responde, la app muestra "⚠ No se pudo actualizar el mercado. Los cálculos utilizan el último dato disponible." Un precio que no existe se muestra como **Sin datos**, nunca como 0.

### CORS y proxy (Cloudflare Worker)

La app intenta consultar AODP directo desde el navegador. Si no puede (CORS o red), el indicador **API** se pone en rojo y la app sigue funcionando en modo manual. Para usar un proxy:

```bash
cd worker
npx wrangler deploy          # requiere cuenta de Cloudflare
```
Copia la URL del Worker (por ejemplo `https://silver-master-proxy.TU-CUENTA.workers.dev`) en **Ajustes → Proxy**. Todas las consultas pasan por `js/api.js`, así que no hay que cambiar nada más. El Worker solo reenvía rutas `/api/v2/stats/`, agrega cabeceras CORS y cachea 2 minutos.

## Desplegar en Cloudflare Pages

1. Sube la carpeta `silver-master` a un repositorio de GitHub.
2. En Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** y elige el repositorio.
3. *Framework preset*: None. *Build command*: vacío. *Build output directory*: `/` (o la carpeta del proyecto si no está en la raíz).
4. Deploy. La app queda en `https://TU-PROYECTO.pages.dev`. Cada `git push` la actualiza.

También funciona en GitHub Pages o cualquier hosting estático.

## Impuestos, retorno y foco: qué está verificado

Todos estos valores viven en `data/settings.json` con su fuente y fecha, y se pueden cambiar en **Ajustes** sin tocar código.

| Dato | Valor | Estado | Fuente |
|---|---|---|---|
| Impuesto de venta | 8% sin premium, 4% con premium | Verificado | [albionmarket.gg](https://albionmarket.gg/guides/crafting-and-refining-profit) (2026-07-11) |
| Tarifa de publicación | 2,5% al publicar una orden; la venta inmediata (incluido el Mercado Negro) no la paga | Verificado | [albionmarket.gg](https://albionmarket.gg/guides/black-market-flipping) (2026-07-09) |
| Fórmula de retorno | bono / (100 + bono) | Verificado | [albionfreemarket.com](https://albionfreemarket.com/articles/view/how-resource-return-rate-is-calculated-in-albion-online) (2026-09-19) |
| Puntos de producción | base de ciudad 18, bono crafteo +15, bono refinado +40, foco +59 | Verificado | ídem |
| Costo de foco | base × 0,5^(eficiencia/10.000); 250 por nivel de la especialización del objeto, 30 por nivel de maestría y de otras especializaciones | Verificado | [albionfreemarket.com](https://albionfreemarket.com/articles/view/how-crafting-specialization-reduces-focus-costs-in-albion-online) (2026-09-19) |
| Bonos de crafteo de ciudades reales | Lymhurst, Fort Sterling, Martlock, Thetford, Bridgewatch | Verificado | [albioncodex.com](https://www.albioncodex.com/guides/best-city-to-craft-albion-online) (2026-04-10) |
| Bonos de Caerleon y Brecilien | — | **No verificado** (fuentes contradictorias): no se aplican solos; márcalos a mano en la calculadora | — |
| Tarifa de la estación | — | **Manual**: la fórmula exacta no está verificada; cópiala de la ventana de fabricación | — |
| Retorno en islas y refugios | — | **Manual** | — |
| Valor del foco en plata | — | Lo defines tú (Ajustes) | — |

El retorno se muestra con su modo: **AUTOMÁTICO** (fórmula verificada) o **MANUAL** (porcentaje que ingresas). La especialización reduce el costo de foco, no el retorno.

Por qué la app no necesita datos que no existen: AODP no informa cuántas unidades pide cada orden (ni del Mercado Negro), por eso la **liquidez** se estima con el volumen diario del historial.

## Fórmulas del motor (`js/profit.js`)

```
Costo total  = costo efectivo de materiales + tarifa de fabricación + transporte + otros costos
Costo efectivo de un material = cantidad bruta × (1 − retorno) × precio   (los materiales no retornables no devuelven)
Ingreso neto = precio × unidades − impuesto − publicación (solo si publicas orden de venta)
Profit       = ingreso neto − costo total
ROI          = profit / capital utilizado × 100
Silver/hora  = profit / (minutos del ciclo / 60)
Beneficio económico = profit − foco usado × valor del foco
```
Si falta cualquier dato (receta, precio de un material, precio de venta o retorno) el resultado es **DATOS INSUFICIENTES** y no se muestra una rentabilidad ficticia.

## Cantidad óptima (`js/demand.js`)

En la Calculadora (sección **Cantidad óptima**) y como columnas en Scanner y Black Market.

1. **Ventas en tu plazo:** con las ventas diarias de los últimos 30 días (AODP, `time-scale=24`) se arman todas las ventanas de N días seguidos. Se descarta el día en curso porque está incompleto.
2. **Tu parte:** cada ventana se multiplica por tu parte del mercado. Si publicas una orden de venta y tu precio está sobre la mayoría de los días recientes, tu parte se reduce (heurística de la app: ×0,7 sobre la mediana, ×0,4 sobre el 75%, ×0,15 sobre el 90%). En venta inmediata no se reduce.
3. **Probabilidad de vender Q unidades** = proporción de ventanas en que tu parte ≥ Q.
4. **Tendencia del precio:** regresión lineal de los últimos 14 días; el precio esperado se ajusta a mitad del plazo (acotado a ±30%). «Sube/baja» = más de ±1% diario.
5. **Ganancia esperada(Q)** = ventas esperadas × ingreso neto esperado + (Q − ventas esperadas) × % del costo que recuperas − Q × costo unitario. La **cantidad óptima** es la de mayor ganancia esperada; la **cantidad segura** es la mayor que alcanza tu nivel de seguridad (80% por defecto).

Límites: AODP solo registra las ventas de jugadores que usan su cliente, tu parte del mercado es una suposición, y un parche o evento puede cambiar la demanda. Es una estimación, no una garantía.

## Cadena de producción, reventa y diario

- **Cadena de producción** (en la Calculadora): para cada material que también se puede refinar, compara su precio de compra con el costo de refinarlo (recurso en bruto + refinado del tier anterior, con el retorno de refinado de la ciudad con bono o de tu ciudad). Muestra el ahorro y el profit de la cadena completa. No incluye la tarifa de la estación de refinado ni el transporte.
- **Reventa**: misma ciudad = orden de compra 1 plata sobre la más alta (paga publicación) y orden de venta 1 plata bajo la más barata (impuesto + publicación). Entre ciudades = compra directa en A y venta en B (inmediata: solo impuesto; orden: impuesto + publicación) menos transporte por unidad. La cantidad sugerida es la menor entre lo que alcanza tu capital y tus días × tu parte de las ventas diarias.
- **Diario**: el neto de cada venta se calcula con tu impuesto al registrarla. «Mi parte real» = tus unidades vendidas ÷ unidades que AODP registró en ese mercado en esas fechas.

## Market Intelligence (v1.3)

Módulo independiente conectado a los motores existentes (no duplica fórmulas: el costo y la venta salen de `scanner.js` y `flipping.js`).

| Componente pedido | Archivo |
|---|---|
| MarketDataService | `js/api.js` (consultas agrupadas, caché, reintentos, control de 429) + `js/market.js` |
| ItemCatalogService | `js/crafting.js` + `data/` |
| PriceHistoryService | `js/api.js` (historial AODP) + `js/snapshots.js` (historial propio en IndexedDB del dispositivo) |
| CraftingEngine / RefiningEngine | `js/profit.js`, `js/scanner.js`, `js/returnRate.js` |
| MarketAnalysisEngine | `js/risk.js` (calidad de datos: ceros, atípicos, diferencias entre ciudades, volatilidad) + `js/forecast.js` (tendencias) |
| SalesForecastEngine | `js/forecast.js` |
| OpportunityScanner + RecommendationEngine | `js/recommend.js` |
| RiskEngine | `js/risk.js` |
| InvestmentCalculator | `js/invest.js` |
| MarketAssistantUI | `js/view-intel.js` + `js/assistant.js` |

**Rotación.** Se separan tres conceptos: *volumen observado* (unidades que registró AODP: datos de la comunidad, no el total real),
*demanda estimada* (unidades/día del mercado en 30 días: conservador = percentil 25, intermedio = promedio, optimista = percentil 75)
y *velocidad proyectada* (demanda × tu parte del mercado × factor de precio × factor propio). Con menos de 3 días con registros la estimación es provisional (confianza baja).

**Aprendizaje real.** Las operaciones guardadas llevan la velocidad proyectada. Cuando hay ≥ 3 operaciones medibles (terminadas o con ≥ 3 días), la mediana de *vendido real ÷ proyectado* (acotada a 0,25–2) se aplica a todas las estimaciones. No hay otro aprendizaje automático.

**Riesgo.** Puntos por regla (antigüedad, actividad, historial, volatilidad, exceso de inventario, precio atípico, tendencia a la baja, diferencia entre ciudades, dato sospechoso, competencia por precio, zona roja). ≤ 1 bajo, ≤ 3 moderado, más = alto; sin precio o sin historial = datos insuficientes. Todo se configura en *Riesgo*.

**Recomendaciones.** Puntaje = ganancia esperada en el plazo (escenario intermedio) × riesgo (1 / 0,75 / 0,4) × confianza (1 / 0,85 / 0,6). La cartera de cada estrategia toma las de mayor puntaje sin superar capital − reserva, y cada operación respeta el % máximo por operación.

**Asistente.** Reconoce el tipo de pregunta y responde con los motores de la app. No es un modelo de lenguaje y no envía datos a ningún lado. `SM.assistant.buildContext()` deja preparado el resumen que recibiría un modelo externo vía Worker.

**Pruebas.** `node tests/run-tests.js` (datos simulados, 88 pruebas). Las pruebas con datos reales se hacen en la app publicada.

## Versiones

La versión aparece arriba a la derecha (toca el número para ver los cambios). Al actualizar, cambia el número en tres lugares: `js/version.js` (`SM.VERSION` y `SM.CHANGELOG`), `data-version` en `<html>` de `index.html`, y los `?v=` de `index.html` (evitan que el navegador use archivos viejos guardados). Si la página y los archivos no coinciden, el número se pone naranja con ⚠: recarga o revisa que subiste todos los archivos.

| Versión | Fecha | Cambios |
|---|---|---|
| 1.4 | 2026-10-02 | Calculadora sencilla para el Mercado Negro: factible o no, materiales, precios editables, ventas de 7 días y cantidad sugerida. |
| 1.3 | 2026-10-01 | Market Intelligence: oportunidades por plazo, rotación, simulador, riesgo, operaciones, historial propio y asistente. |
| 1.2 | 2026-10-01 | Venta local: panel «Qué datos faltan» con detalle por material, venta y antigüedad. |
| 1.1 | 2026-10-01 | Venta local. |
| 1.0 | 2026-10-01 | Primera versión numerada: todos los módulos, cantidad óptima, refinado local, cadena de producción, reventa, diario y arreglo de apertura de resultados. |

## Fases

| Fase | Estado |
|---|---|
| 1 Interfaz | Completa |
| 2 Objetos y recetas | Completa (7.363 objetos desde los datos del juego) |
| 3 Motor de cálculo | Completo, 57 pruebas (incluye cantidad óptima, reventa y diario) |
| 4 AODP | Completa (directo o proxy, caché, reintentos, validación de mercados) |
| 5 Historial | Completo |
| 6 Black Market | Completo |
| 7 Market Scanner | Completo |
| 8 Route Analyzer | Completo (transporte en plata; peso/montura/viajes pendiente) |
| 9 Alertas | Revisión manual lista; Worker programado pendiente |
| 10 Optimización | Pendiente: base de datos de historial propio, alertas push, exportación a Excel nativo |

## Seguridad

No guarda contraseñas, credenciales ni tokens. Todo lo que guardas (perfil, precios manuales, favoritos, alertas) queda en `localStorage` de tu navegador. No hace acciones dentro del cliente de Albion.
