// Contrôleur « Caisse » (modèle CashEntry) — page Caisse.
//   GET  /api/cash/solde   solde par équipe et mode de paiement
//   POST /api/cash         encaissement / décaissement   droit « caisse »
import { CashEntry } from '../models/index.js';
import { controleurEntite, lire, operer, donnees } from './base.js';

const r3 = (n) => Math.round(n * 1000) / 1000;

export const cashController = (ctx) => controleurEntite(ctx, {
  nom: 'cash', chemin: 'cash', model: CashEntry,
  operations: ['addCash'],
  routes: {
    'GET /api/cash/solde': async (req) => {
      const { v } = await lire(ctx, req);
      const parEquipe = {};
      for (const c of v.cash) {
        const e = (parEquipe[c.teamId] ||= { total: 0, parMode: {} });
        const signe = c.type === 'ENCAISSEMENT' ? 1 : -1;
        e.total = r3(e.total + signe * c.amount);
        e.parMode[c.method] = r3((e.parMode[c.method] || 0) + signe * c.amount);
      }
      return { total: r3(Object.values(parEquipe).reduce((a, e) => a + e.total, 0)), parEquipe };
    },
    'POST /api/cash': (req, body) => operer(ctx, req, body, 'addCash', [donnees(body)]),
  },
});
