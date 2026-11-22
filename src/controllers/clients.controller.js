// Contrôleur « Clients » (modèle Client) — clients de l'application.
// Les clients des marchés (marketId) sont séparés : voir markets.controller (GET /api/markets/clients).
import { Client } from '../models/index.js';
import { clientBoxBalance, effectiveCreditCode, packBalance } from '../domain/domain.mjs';
import { controleurEntite } from './base.js';

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export const clientsController = (ctx) => controleurEntite(ctx, {
  nom: 'clients', chemin: 'clients', model: Client,
  liste: (v) => v.clients.filter((c) => !c.marketId),
  details: (v, c) => ({
    ventes: v.sales.filter((s) => s.clientId === c.id).map((s) => ({ id: s.id, number: s.number, saleDate: s.saleDate, totalAmount: s.totalAmount, remainingAmount: s.remainingAmount, saleStatusId: s.saleStatusId })),
    dettes: v.credits.filter((d) => d.clientId === c.id).map((d) => ({ ...d, statut: effectiveCreditCode(v, d, aujourdhui()) })),
    resteAPayer: Math.round(v.credits.filter((d) => d.clientId === c.id).reduce((a, d) => a + d.remainingAmount, 0) * 1000) / 1000,
    caisses: packBalance(v, { clientId: c.id }),            // nos caisses chez le client
    caissesDuClient: clientBoxBalance(v, { clientId: c.id }), // ses caisses chez nous (à lui rendre)
  }),
});
