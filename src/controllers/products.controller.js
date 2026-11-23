// Contrôleur « Produits » (modèle Product) — formulaires Produits.
//   POST /api/products/avec-stock   { produit, stock: { frigoId, quantite } | null }
//        produit créé / modifié + quantité entrée dans le frigo choisi, en une seule opération
//        (droit « produits » ; droit « stock » en plus si une quantité est saisie)
import { Product } from '../models/index.js';
import { stockOf, stockTotal } from '../domain/domain.mjs';
import { controleurEntite, operer } from './base.js';
import { HttpError } from '../services/engine.js';

const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

export const productsController = (ctx) => controleurEntite(ctx, {
  nom: 'products', chemin: 'products', model: Product,
  operations: ['saveProduct'],
  details: (v, p) => ({
    stockTotal: stockTotal(v, p.id),
    stockParFrigo: v.frigos.map((f) => ({ frigoId: f.id, frigo: f.name, quantite: stockOf(v, p.id, f.id) })),
  }),
  routes: {
    'POST /api/products/avec-stock': (req, body) => {
      const produit = objet(body?.produit);
      if (!produit) throw new HttpError(400, 'données invalides', 'DONNEES');
      const s = objet(body?.stock);
      return operer(ctx, req, body, 'saveProduct', [produit, s ? { frigoId: s.frigoId, quantity: s.quantite ?? s.quantity } : null]);
    },
  },
});
