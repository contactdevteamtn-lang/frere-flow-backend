// Modèle « Credit » — collection MongoDB ff_credits
// Dette (crédit) : reste à payer d'une vente, dette manuelle ou échéance. Une dette de marché (client de marché) est séparée et gérée dans Marchés.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const Credit = {
  name: 'Credit',
  collection: 'credits',
  permission: null, // créé uniquement par les opérations métier (voir son contrôleur)
  schema: {
    id: ID, clientId: ID, teamId: ID, 'saleId?': ID, creditStatusId: ID, totalAmount: 'number', paidAmount: 'number', remainingAmount: 'number',
    dueDate: 'string', createdAt: 'string', 'notes?': 'string', 'frigoId?': ID, 'marketId?': ID, 'reminderDays?': 'number',
    'reminderHistory?': 'array', 'deadlineCancelled?': 'boolean',
  },
};

export default Credit;
