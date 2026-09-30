/* DATOS DEMO — ficticios, solo para pruebas. No son recetas ni precios reales de Albion Online. */
(function (root) {
  root.SM_DEMO = {
    recipe: { recipe_id: 'DEMO_ITEM', quantity_produced: 1, focus_base: 1000,
      materials: [ { item_id: 'DEMO_MAT_A', quantity: 100, returnable: true }, { item_id: 'DEMO_MAT_B', quantity: 50, returnable: true }, { item_id: 'DEMO_ARTIFACT', quantity: 1, returnable: false } ] },
    potionRecipe: { recipe_id: 'DEMO_POTION', quantity_produced: 5, materials: [ { item_id: 'DEMO_HERB', quantity: 24, returnable: true } ] },
    prices: { DEMO_MAT_A: 1000, DEMO_MAT_B: 2000, DEMO_ARTIFACT: 5000, DEMO_HERB: 200 },
    rows: [
      { item_id: 'DEMO_MAT_A', city: 'Lymhurst', quality: 1, sell_price_min: 1000, sell_price_min_date: 'NOW', buy_price_max: 900, buy_price_max_date: 'NOW' },
      { item_id: 'DEMO_MAT_A', city: 'Martlock', quality: 1, sell_price_min: 950, sell_price_min_date: 'NOW', buy_price_max: 0, buy_price_max_date: '0001-01-01T00:00:00' },
      { item_id: 'DEMO_MAT_A', city: 'Thetford', quality: 1, sell_price_min: 0, sell_price_min_date: '0001-01-01T00:00:00', buy_price_max: 0, buy_price_max_date: '0001-01-01T00:00:00' },
      { item_id: 'DEMO_ITEM', city: 'Black Market', quality: 1, sell_price_min: 0, sell_price_min_date: '0001-01-01T00:00:00', buy_price_max: 500000, buy_price_max_date: 'NOW' },
      { item_id: 'DEMO_ITEM', city: 'Caerleon', quality: 1, sell_price_min: 480000, sell_price_min_date: 'NOW', buy_price_max: 400000, buy_price_max_date: 'NOW' }
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
