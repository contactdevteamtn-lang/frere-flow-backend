// Contrôleur « Produits » (modèle Product) — formulaires Produits.
import { Product } from '../models/index.js';
import { stockOf, stockTotal } from '../domain/domain.mjs';
import { controleurEntite } from './base.js';

export const productsController = (ctx) => controleurEntite(ctx, {
  nom: 'products', chemin: 'products', model: Product,
  details: (v, p) => ({
    stockTotal: stockTotal(v, p.id),
    stockParFrigo: v.frigos.map((f) => ({ frigoId: f.id, frigo: f.name, quantite: stockOf(v, p.id, f.id) })),
  }),
});
