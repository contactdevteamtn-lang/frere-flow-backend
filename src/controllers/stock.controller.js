// Contrôleur « Stock » (modèle StockMovement) : niveaux par produit et frigo, mouvements.
//   GET  /api/stock                    niveaux (produit × frigo) + alertes
//   GET  /api/stock/mouvements[/:id]   mouvements
//   POST /api/stock/mouvements         entrée / sortie / transfert / ajustement  (droit « stock »)
import { StockMovement } from '../models/index.js';
import { stockOf, stockTotal } from '../domain/domain.mjs';
import { controleurEntite, lire, operer, donnees } from './base.js';

export const stockController = (ctx) => controleurEntite(ctx, {
  nom: 'stock', chemin: 'stock/mouvements', model: StockMovement,
  operations: ['addStockMovement'],
  routes: {
    'GET /api/stock': async (req) => {
      const { v } = await lire(ctx, req);
      return {
        items: v.products.map((p) => {
          const total = stockTotal(v, p.id);
          return { productId: p.id, produit: p.name, unite: p.unit, total, alerte: total < p.alertThreshold,
            parFrigo: Object.fromEntries(v.frigos.map((f) => [f.id, stockOf(v, p.id, f.id)])) };
        }),
      };
    },
    'POST /api/stock/mouvements': (req, body) => operer(ctx, req, body, 'addStockMovement', [donnees(body)]),
  },
});
