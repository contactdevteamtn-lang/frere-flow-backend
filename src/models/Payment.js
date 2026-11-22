// Modèle « Payment » — collection MongoDB ff_payments
// Paiement reçu au moment d'une vente.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID, PAIEMENT } from './types.js';

export const Payment = {
  name: 'Payment',
  collection: 'payments',
  permission: null, // créé uniquement par les opérations métier (voir son contrôleur)
  schema: { id: ID, saleId: ID, clientId: ID, teamId: ID, userId: ID, amount: 'number', paymentDate: 'string', paymentMethod: PAIEMENT },
};

export default Payment;
