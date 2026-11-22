// Contrôleur « Marchés » (modèles Market, MarketTrip) — section Marchés (compte « marché » inclus).
// Clients et dettes des marchés : séparés des clients et dettes de l'application.
//   GET  /api/markets[/:id]                 marchés              POST /api/markets  { name, city }   droit « marches »
//   GET  /api/markets/clients               clients des marchés  POST /api/markets/clients  { marketId, name, phone, address }
//   GET  /api/markets/credits               dettes des marchés (encaisser : POST /api/credits/:id/paiements)
//   GET  /api/markets/trips[/:id]           journées (+ totaux, reste camion, caisses)
//   POST /api/markets/trips                 départ (chargement)
//   POST /api/markets/trips/:id/ventes      vente depuis le camion
//   POST /api/markets/trips/:id/cloture     clôture (retours, comptage, écarts)
import { Market, MarketTrip } from '../models/index.js';
import { effectiveCreditCode, isMarketCredit, tripBoxBalance, tripProductBalance, tripTotals, tripSales } from '../domain/domain.mjs';
import { controleurEntite, lire, paginer, trouverOu404, operer, donnees } from './base.js';

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export const marketsController = (ctx) => controleurEntite(ctx, {
  nom: 'markets', chemin: 'markets', model: Market,
  operations: ['saveMarket', 'saveMarketClient', 'createMarketTrip', 'createMarketSale', 'closeMarketTrip'],
  details: (v, m) => ({
    clients: v.clients.filter((c) => c.marketId === m.id).length,
    journees: v.marketTrips.filter((t) => t.marketId === m.id).length,
  }),
  routes: {
    'POST /api/markets': (req, body) => operer(ctx, req, body, 'saveMarket', [donnees(body)]),
    'GET /api/markets/clients': async (req, body, url) => { const { v } = await lire(ctx, req); return paginer(v.clients.filter((c) => c.marketId), url); },
    'POST /api/markets/clients': (req, body) => operer(ctx, req, body, 'saveMarketClient', [donnees(body)]),
    'GET /api/markets/credits': async (req, body, url) => {
      const { v } = await lire(ctx, req);
      return paginer(v.credits.filter((c) => isMarketCredit(v, c)).map((c) => ({ ...c, statut: effectiveCreditCode(v, c, aujourdhui()) })), url);
    },
    'GET /api/markets/trips': async (req, body, url) => { const { v } = await lire(ctx, req); return paginer(v[MarketTrip.collection], url); },
    'GET /api/markets/trips/:id': async (req, body, url, p) => {
      const { v } = await lire(ctx, req);
      const t = trouverOu404(v.marketTrips, p.id);
      // Map → liste (une Map deviendrait {} en JSON)
      const produits = [...tripProductBalance(v, t)].map(([productId, r]) => ({ productId, produit: v.products.find((x) => x.id === productId)?.name ?? productId, ...r }));
      const caisses = [...tripBoxBalance(v, t)].map(([typeId, r]) => ({ typeId, caisse: v.packagingTypes.find((x) => x.id === typeId)?.name ?? typeId, ...r }));
      return { ...t, totaux: tripTotals(v, t), produits, caisses, ventes: tripSales(v, t.id) };
    },
    'POST /api/markets/trips': (req, body) => operer(ctx, req, body, 'createMarketTrip', [donnees(body)]),
    'POST /api/markets/trips/:id/ventes': (req, body, url, p) => operer(ctx, req, body, 'createMarketSale', [{ ...donnees(body), tripId: p.id }]),
    'POST /api/markets/trips/:id/cloture': (req, body, url, p) => operer(ctx, req, body, 'closeMarketTrip', [{ ...donnees(body), tripId: p.id }]),
  },
});
