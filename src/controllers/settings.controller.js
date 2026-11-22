// Contrôleur « Paramètres » : nom de l'entreprise, délai de paiement par défaut, alerte caisses ; statuts.
//   GET  /api/settings          POST /api/settings  { companyName, currency, defaultDueDays, packagingAlert }  droit « parametres »
//   GET  /api/settings/statuts  statuts de vente et de dette
import { lire, operer, donnees } from './base.js';

export const settingsController = (ctx) => ({
  nom: 'settings', chemin: 'settings', model: null,
  operations: ['saveSettings'],
  routes: {
    'GET /api/settings': async (req) => (await lire(ctx, req)).v.settings,
    'GET /api/settings/statuts': async (req) => { const { v } = await lire(ctx, req); return { ventes: v.saleStatuses, dettes: v.creditStatuses }; },
    'POST /api/settings': (req, body) => operer(ctx, req, body, 'saveSettings', [donnees(body)]),
  },
});
