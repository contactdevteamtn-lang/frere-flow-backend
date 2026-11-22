// Contrôleur « Ventes » (modèles Sale, SaleItem, Payment) — formulaire Nouvelle vente.
//   POST /api/sales                 créer une vente (stock, paiement, caisse, dette, caisses)   droit « ventes »
//   POST /api/sales/:id/annuler     { reason }      annuler (stock remis, remboursement)
//   POST /api/sales/:id/statut      { statusId }    changer le statut
import { Sale } from '../models/index.js';
import { controleurEntite, operer, donnees } from './base.js';

export const salesController = (ctx) => controleurEntite(ctx, {
  nom: 'sales', chemin: 'sales', model: Sale,
  operations: ['createSale', 'cancelSale', 'setSaleStatus'],
  details: (v, s) => ({
    lignes: v.saleItems.filter((i) => i.saleId === s.id),
    paiements: v.payments.filter((p) => p.saleId === s.id),
    dette: v.credits.find((c) => c.saleId === s.id) || null,
    caisses: v.packagingMovements.filter((m) => m.saleId === s.id),
  }),
  routes: {
    'POST /api/sales': (req, body) => operer(ctx, req, body, 'createSale', [donnees(body)]),
    'POST /api/sales/:id/annuler': (req, body, url, p) => operer(ctx, req, body, 'cancelSale', [p.id, String(body?.reason ?? '')]),
    'POST /api/sales/:id/statut': (req, body, url, p) => operer(ctx, req, body, 'setSaleStatus', [p.id, String(body?.statusId ?? '')]),
  },
});
