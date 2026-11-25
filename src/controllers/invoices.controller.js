// Contrôleur « Factures » (modèle Invoice) — section Factures.
//   GET  /api/invoices[/:id]          factures (une par vente) ; détail : vente, lignes, crédit
//   POST /api/invoices/:id/statut     { status: VALIDEE | A_VOIR | ANNULEE, note }
//        « à voir » et « annulée » demandent un motif ; « annulée » annule aussi la vente
//        (droit « ventes », ou « marchés » pour une vente du marché)
import { Invoice } from '../models/index.js';
import { controleurEntite, operer } from './base.js';

export const invoicesController = (ctx) => controleurEntite(ctx, {
  nom: 'invoices', chemin: 'invoices', model: Invoice,
  operations: ['setInvoiceStatus'],
  details: (v, f) => ({
    vente: v.sales.find((x) => x.id === f.saleId) || null,
    lignes: v.saleItems.filter((i) => i.saleId === f.saleId),
    dette: v.credits.find((c) => c.saleId === f.saleId) || null,
  }),
  routes: {
    'POST /api/invoices/:id/statut': (req, body, url, p) =>
      operer(ctx, req, body, 'setInvoiceStatus', [p.id, String(body?.status ?? ''), String(body?.note ?? '')]),
  },
});
