// Contrôleur « Dettes » (modèles Credit, CreditPayment) — pages Dettes et Échéances.
// Les dettes des clients de marché sont séparées : voir GET /api/markets/credits.
//   POST /api/credits                       dette manuelle                         droit « credits »
//   POST /api/credits/:id/paiements         encaisser { amount, method, notes }    « credits » / « paiements »
//   POST /api/credits/:id/statut            { statusId }
//   POST /api/credits/echeances             nouvelle échéance
//   POST /api/credits/:id/echeance          modifier { dueDate, amount, reminderDays, notes, reason }
//   POST /api/credits/:id/echeance/payer    payer une échéance
//   POST /api/credits/:id/rappel            noter un rappel
//   POST /api/credits/:id/echeance/annuler  { reason }
import { Credit } from '../models/index.js';
import { effectiveCreditCode, isMarketCredit } from '../domain/domain.mjs';
import { controleurEntite, operer, donnees } from './base.js';

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export const creditsController = (ctx) => controleurEntite(ctx, {
  nom: 'credits', chemin: 'credits', model: Credit,
  operations: ['addManualCredit', 'addCreditPayment', 'setCreditStatus', 'createDeadline', 'updateDeadline', 'payDeadline', 'markReminder', 'cancelDeadline'],
  liste: (v) => v.credits.filter((c) => !isMarketCredit(v, c)).map((c) => ({ ...c, statut: effectiveCreditCode(v, c, aujourdhui()) })),
  details: (v, c) => ({ paiements: v.creditPayments.filter((p) => p.creditId === c.id) }),
  routes: {
    'POST /api/credits': (req, body) => operer(ctx, req, body, 'addManualCredit', [donnees(body)]),
    'POST /api/credits/echeances': (req, body) => operer(ctx, req, body, 'createDeadline', [donnees(body)]),
    'POST /api/credits/:id/paiements': (req, body, url, p) => operer(ctx, req, body, 'addCreditPayment', [{ ...donnees(body), creditId: p.id }]),
    'POST /api/credits/:id/statut': (req, body, url, p) => operer(ctx, req, body, 'setCreditStatus', [p.id, String(body?.statusId ?? '')]),
    'POST /api/credits/:id/echeance': (req, body, url, p) => operer(ctx, req, body, 'updateDeadline', [{ ...donnees(body), creditId: p.id }]),
    'POST /api/credits/:id/echeance/payer': (req, body, url, p) => operer(ctx, req, body, 'payDeadline', [{ ...donnees(body), creditId: p.id }]),
    'POST /api/credits/:id/rappel': (req, body, url, p) => operer(ctx, req, body, 'markReminder', [p.id]),
    'POST /api/credits/:id/echeance/annuler': (req, body, url, p) => operer(ctx, req, body, 'cancelDeadline', [p.id, String(body?.reason ?? '')]),
  },
});
