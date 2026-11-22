// Contrôleur « Paiements » (modèles Payment, CreditPayment) — page Paiements (lecture).
// Les paiements sont créés par les ventes et les encaissements de dettes.
import { Payment, CreditPayment } from '../models/index.js';
import { controleurEntite, lire, paginer } from './base.js';

export const paymentsController = (ctx) => controleurEntite(ctx, {
  nom: 'payments', chemin: 'payments', model: Payment,
  routes: {
    'GET /api/payments/credits': async (req, body, url) => { const { v } = await lire(ctx, req); return paginer(v[CreditPayment.collection], url); },
  },
});
