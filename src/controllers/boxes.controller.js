// Contrôleur « Caisses / Box » (modèles Box = packagingTypes, BoxMovement = packagingMovements).
// Option « le client amène ses propres caisses » : type avec clientOwned = true (« صناديق العميل ») ;
// ces caisses sont comptées à part (à lui rendre) et ne touchent jamais notre stock de caisses.
//   GET  /api/boxes[/:id]            types de caisses              POST /api/boxes (droit « emballages »)
//   GET  /api/boxes/soldes           par client : nos caisses chez lui / ses caisses chez nous
//   GET  /api/boxes/mouvements       mouvements
//   POST /api/boxes/mouvements       { clientId, packagingTypeId, teamId, type: SORTIE|RETOUR, quantity, notes }
import { Box, BoxMovement } from '../models/index.js';
import { clientBoxBalance, packBalance } from '../domain/domain.mjs';
import { controleurEntite, lire, paginer, operer, donnees } from './base.js';

export const boxesController = (ctx) => controleurEntite(ctx, {
  nom: 'boxes', chemin: 'boxes', model: Box,
  operations: ['addPackMovement'],
  details: (v, t) => (t.clientOwned
    ? { caissesDesClients: clientBoxBalance(v, {}) }
    : { chezLesClients: packBalance(v, { typeId: t.id }) }),
  routes: {
    'GET /api/boxes/soldes': async (req) => {
      const { v } = await lire(ctx, req);
      const ids = [...new Set(v.packagingMovements.map((m) => m.clientId))];
      return {
        items: ids.map((clientId) => {
          const c = v.clients.find((x) => x.id === clientId);
          return { clientId, client: c?.name ?? clientId, marche: !!c?.marketId, nosCaisses: packBalance(v, { clientId }), sesCaisses: clientBoxBalance(v, { clientId }) };
        }).filter((l) => l.nosCaisses.remaining || l.sesCaisses.owed),
      };
    },
    'GET /api/boxes/mouvements': async (req, body, url) => { const { v } = await lire(ctx, req); return paginer(v[BoxMovement.collection], url); },
    'POST /api/boxes/mouvements': (req, body) => operer(ctx, req, body, 'addPackMovement', [donnees(body)]),
  },
});
