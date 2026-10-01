/* Pruebas del motor con datos DEMO. Ejecutar: node tests/run-tests.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const mem = {}; const localStorage = { getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
const ctx = { console, Math, Date, JSON, isFinite, Number, String, Object, Array, Set, Map, Promise, setTimeout, localStorage };
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['../js/storage.js', '../js/profit.js', '../js/returnRate.js', '../js/market.js', '../js/demand.js', '../js/flipping.js', '../js/journal.js', './fixtures.demo.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });
const { SM, SM_DEMO: DEMO } = ctx;
const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/settings.json'), 'utf8'));
const now = new Date(Date.now() - 5 * 60000).toISOString().slice(0, 19);
DEMO.rows.forEach(r => { for (const k in r) if (r[k] === 'NOW') r[k] = now; });

let pass = 0, fail = 0;
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-6);
function t(name, cond) { if (cond) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  FALLA', name); } }

console.log('Costo de materiales');
const mc = SM.profit.calculateMaterialCost([{ item_id: 'A', quantity: 100, price: 1000 }, { item_id: 'B', quantity: 50, price: 2000 }]);
t('100×1.000 + 50×2.000 = 200.000', mc.total === 200000);
t('precio faltante no se toma como 0', SM.profit.calculateMaterialCost([{ item_id: 'A', quantity: 1, price: null }]).total === null);

console.log('Retorno');
const rp = settings.return_rate.production_bonus;
t('ciudad sin bono 18 → 15,25%', near(SM.returnRate.fromBonus(18), 0.152542, 1e-5));
t('ciudad con bono 33 → 24,81%', near(SM.returnRate.compute({ locationType: 'royal', bonusKind: 'crafting' }, rp).rate, 0.248120, 1e-5));
t('foco sin bono 77 → 43,50%', near(SM.returnRate.compute({ locationType: 'royal', focus: true }, rp).rate, 0.435028, 1e-5));
t('foco + bono 92 → 47,92%', near(SM.returnRate.compute({ locationType: 'royal', bonusKind: 'crafting', focus: true }, rp).rate, 0.479167, 1e-5));
t('refinado con bono 58 → 36,71%', near(SM.returnRate.compute({ locationType: 'royal', bonusKind: 'refining' }, rp).rate, 0.367089, 1e-5));
t('modo manual', SM.returnRate.compute({ manualPct: 30 }, rp).mode === 'MANUAL');
t('ubicación sin fórmula pide manual', SM.returnRate.compute({ locationType: 'other' }, rp).rate === null);
const r1 = SM.profit.calculateReturn(100, 0.25, true);
t('100 con 25% → recupera 25, compra 75', r1.recovered === 25 && r1.net === 75);
t('no retornable no devuelve', SM.profit.calculateReturn(10, 0.5, false).recovered === 0);

console.log('Foco');
const eff = SM.returnRate.focusEfficiency({ ownSpec: 100, mastery: 100, otherSpecsSum: 0 }, settings.focus.efficiency_per_level);
t('eficiencia 100 spec + 100 maestría = 28.000', eff === 28000);
t('ejemplo fuente: 1.286 × 0,5^3,1 ≈ 149,99', near(SM.returnRate.focusCost(1286, 31000), 149.9851, 1e-3));

console.log('Impuestos y venta');
t('impuesto 8% de 100.000 = 8.000', SM.profit.calculateSaleTax(100000, 8) === 8000);
t('venta inmediata no paga publicación', SM.profit.calculateSetupFee(100000, 2.5, 'instant') === 0);
t('orden de venta paga 2,5%', SM.profit.calculateSetupFee(100000, 2.5, 'order') === 2500);
const nr = SM.profit.calculateNetRevenue(1000, 10, { taxPct: 4, setupPct: 2.5, mode: 'order' });
t('neto orden: 10.000 − 400 − 250 = 9.350', nr.net === 9350);
t('sin precio de venta → null', SM.profit.calculateNetRevenue(null, 10, { taxPct: 4, setupPct: 2.5, mode: 'order' }) === null);

console.log('Transporte, profit, ROI, silver/h');
t('transporte 2 tramos + por unidad', SM.profit.calculateTransportCost([1000, 500], 10, 20) === 1700);
t('profit', SM.profit.calculateProfit(9350, 8000) === 1350);
t('ROI = 1.350 / 8.000 × 100 = 16,875', near(SM.profit.calculateROI(1350, 8000), 16.875));
t('silver/h: 60.000 en 30 min = 120.000/h', SM.profit.calculateSilverPerHour(60000, 30) === 120000);

console.log('Lote completo (DEMO)');
const b = SM.profit.craftBatch({ recipe: DEMO.recipe, units: 2, prices: DEMO.prices, returnRate: 0.2,
  craftingFee: { value: 1000, mode: 'total' }, transport: { legs: [2000], perUnit: 0 },
  sale: { unitPrice: 500000, mode: 'instant', taxPct: 8, setupPct: 2.5 }, minutes: 60 });
// materiales: A 200 bruto → 160 × 1000 = 160.000; B 100 → 80 × 2000 = 160.000; artefacto 2 × 5000 = 10.000 (no retorna)
t('costo materiales = 330.000', b.materialCost === 330000);
t('costo total = 333.000', b.totalCost === 333000);
t('neto = 1.000.000 − 8% = 920.000', b.sale.net === 920000);
t('profit = 587.000', b.profit === 587000);
t('ROI ≈ 176,28%', near(b.roi, 587000 / 333000 * 100));
t('recuperado A = 40', b.lines[0].recovered === 40);
const miss = SM.profit.craftBatch({ recipe: DEMO.recipe, units: 1, prices: { DEMO_MAT_A: 1000 }, returnRate: 0, sale: { unitPrice: 1, mode: 'instant', taxPct: 8, setupPct: 2.5 } });
t('datos insuficientes si falta un precio', !miss.ok && miss.profit === null);
const pot = SM.profit.craftBatch({ recipe: DEMO.potionRecipe, units: 12, prices: DEMO.prices, returnRate: 0, sale: { unitPrice: 100, mode: 'instant', taxPct: 8, setupPct: 2.5 } });
t('pociones: 12 pedidas → 3 crafteos → 15 hechas', pot.crafts === 3 && pot.made === 15);
const f = SM.profit.craftBatch({ recipe: DEMO.recipe, units: 1, prices: DEMO.prices, returnRate: 0, sale: { unitPrice: 500000, mode: 'instant', taxPct: 8, setupPct: 2.5 }, focus: { use: true, costPerCraft: 100, silverPerFocus: 50 } });
t('beneficio económico descuenta el foco valorado', f.economicProfit === f.profit - 5000);

console.log('Mercado');
const idx = SM.market.index(DEMO.rows);
t('material más barato: Martlock 950', SM.market.cheapestBuy(idx, 'DEMO_MAT_A', ['Lymhurst', 'Martlock', 'Thetford'], 12).location === 'Martlock');
t('venta inmediata: mejor orden de compra (MN 500.000)', SM.market.bestSale(idx, 'DEMO_ITEM', ['Caerleon', 'Black Market'], 'instant', 1, 12).location === 'Black Market');
t('orden de venta ignora el MN', SM.market.bestSale(idx, 'DEMO_ITEM', ['Caerleon', 'Black Market'], 'order', 1, 12).location === 'Caerleon');
t('fecha 0001 = sin datos', SM.market.ageClass('0001-01-01T00:00:00').key === 'none');
t('5 min = fresco', SM.market.ageClass(now).key === 'fresh');
t('ubicaciones con datos reales', [...SM.market.locationsWithData(DEMO.rows)].sort().join(',') === 'Black Market,Caerleon,Lymhurst,Martlock');
t('confianza alta con datos frescos y volumen', SM.market.confidence({ ageMinutes: 5, hasBuy: true, hasSell: true, dailyVolume: 50, historyDays: 7 }) === 'Alta');
t('confianza baja sin datos', SM.market.confidence({ ageMinutes: null, hasBuy: false, hasSell: false, dailyVolume: null }) === 'Baja');

console.log('Cantidad óptima (DEMO)');
const mk = (counts, prices) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return { data: counts.map((c, i) => ({ item_count: c, avg_price: prices ? prices[i] : 1000, timestamp: new Date(d.getTime() - (counts.length - i) * 86400000).toISOString().slice(0, 19) })) }; };
const flat = mk(Array(30).fill(100));
const ser = SM.demand.dailySeries(flat, 30);
t('serie de 30 días completa', ser.length === 30 && ser.every(x => x.count === 100));
t('ventanas de 3 días suman 300', SM.demand.windowSums(ser, 3).every(v => v === 300));
t('percentil 50 de [1..5] = 3', SM.demand.percentile([5, 1, 3, 2, 4], 0.5) === 3);
const a1 = SM.demand.analyze({ histRow: flat, days: 3, share: 0.3, confidence: 0.8, salePrice: 1000, netUnit: 900, unitCost: 500, salvagePct: 0.5 });
t('mercado estable: vendes 90 con 100% de prob.', a1.ok && a1.evalQ(90).prob === 1 && a1.evalQ(91).prob === 0);
t('cantidad óptima = 90 (todo lo que absorbe el mercado)', a1.best.q === 90);
t('cantidad segura al 80% = 90', a1.safe.q === 90);
const up = mk(Array(30).fill(50), Array.from({ length: 30 }, (_, i) => 1000 + i * 20));
t('tendencia al alza detectada', SM.demand.priceTrend(SM.demand.dailySeries(up, 30), 14).direction === 'sube');
t('precio sobre casi todo lo reciente reduce la venta', SM.demand.pricePosition(ser.map((d, i) => ({ price: 1000 + i })), 5000).factor < 0.5);
t('sin historial suficiente → no calcula', SM.demand.analyze({ histRow: mk([0, 0, 5]), days: 3, netUnit: 1, unitCost: 1 }).ok === false);
const loss = SM.demand.analyze({ histRow: flat, days: 3, share: 0.3, salePrice: 1000, netUnit: 400, unitCost: 500, salvagePct: 0.5 });
t('si pierdes plata la óptima es la mínima', loss.best.q === 1 && loss.best.expProfit < 0);
t('venta inmediata no se penaliza por precio', SM.demand.analyze({ histRow: flat, days: 3, share: 0.3, salePrice: 99999, mode: 'instant', netUnit: 900, unitCost: 500 }).pos.factor === 1);
console.log('Reventa (DEMO)');
const tx = { taxPct: 8, setupPct: 2.5, undercut: 1 };
const fs1 = SM.flipping.sameMarket({ price: 1000 }, { price: 1300 }, tx);
// compra 1001 × 1,025 = 1026,025 ; venta 1299 × (1 − 0,105) = 1162,605 ; ganancia 136,58
t('misma ciudad: ganancia por unidad ≈ 136,58', Math.abs(fs1.profit - 136.58) < 0.01);
t('sin margen entre órdenes → no hay reventa', SM.flipping.sameMarket({ price: 1000 }, { price: 1001 }, tx) === null);
const cr = SM.flipping.crossMarket({ price: 1000 }, { buy_price_max: 1200, buy_price_max_date: now }, 'instant', Object.assign({ transportPerUnit: 50 }, tx));
// neto 1200 × 0,92 = 1104 ; costo 1050 ; ganancia 54
t('entre ciudades con transporte: ganancia 54', Math.abs(cr.profit - 54) < 1e-9);

console.log('Diario (DEMO)');
const jb = SM.journal.addBatch({ item_id: 'DEMO_ITEM', location: 'Lymhurst', units: 10, totalCost: 10000, date: Date.now() - 2 * 86400000 });
SM.journal.addSale(jb.id, { units: 4, unitPrice: 2000, mode: 'order', date: Date.now() - 86400000 }, { taxPct: 8, setupPct: 2.5 });
const js = SM.journal.stats(SM.journal.all()[0]);
// neto 8000 × 0,895 = 7160 ; costo vendido 4000 ; ganancia 3160
t('ganancia realizada = 3.160', Math.abs(js.realizedProfit - 3160) < 1e-6);
t('quedan 6 por vender', js.remaining === 6);
const hist = { data: [0, 1, 2].map(i => ({ item_count: 20, avg_price: 2000, timestamp: new Date(Date.now() - (2 - i) * 86400000).toISOString().slice(0, 19) })) };
const rs = SM.journal.realShare(SM.journal.all()[0], hist);
t('parte real del mercado = 4 de 60', rs && Math.abs(rs.share - 4 / 60) < 1e-9);
const exp = SM.journal.exportJSON(); SM.journal.removeBatch(jb.id);
t('exportar e importar respaldo', SM.journal.importJSON(exp, 'merge') === 1 && SM.journal.all().length === 1);
console.log('\n' + pass + ' pruebas correctas, ' + fail + ' fallidas');
process.exit(fail ? 1 : 0);
