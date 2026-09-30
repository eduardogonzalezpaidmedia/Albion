/* Pruebas del motor con datos DEMO. Ejecutar: node tests/run-tests.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Date, JSON, isFinite, Number, String, Object, Array, Set, Map, Promise, setTimeout };
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['../js/profit.js', '../js/returnRate.js', '../js/market.js', './fixtures.demo.js'])
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

console.log('\n' + pass + ' pruebas correctas, ' + fail + ' fallidas');
process.exit(fail ? 1 : 0);
