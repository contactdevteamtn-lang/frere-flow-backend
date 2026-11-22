// Contrôleur « Frigos » (modèle Frigo) — chambres froides.
import { Frigo } from '../models/index.js';
import { stockOf } from '../domain/domain.mjs';
import { controleurEntite } from './base.js';

export const frigosController = (ctx) => controleurEntite(ctx, {
  nom: 'frigos', chemin: 'frigos', model: Frigo,
  details: (v, f) => {
    const stock = v.products.map((p) => ({ productId: p.id, produit: p.name, quantite: stockOf(v, p.id, f.id) })).filter((l) => l.quantite !== 0);
    const total = Math.round(stock.reduce((a, l) => a + l.quantite, 0) * 1000) / 1000;
    return { stock, total, remplissage: f.capacity ? Math.round((total / f.capacity) * 1000) / 10 : null };
  },
});
