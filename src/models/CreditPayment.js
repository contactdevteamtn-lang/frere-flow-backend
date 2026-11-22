// Modèle « CreditPayment » — collection MongoDB ff_creditPayments
// Encaissement d'une dette.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID, PAIEMENT } from './types.js';

export const CreditPayment = {
  name: 'CreditPayment',
  collection: 'creditPayments',
  permission: null, // créé uniquement par les opérations métier (voir son contrôleur)
  schema: { id: ID, creditId: ID, clientId: ID, teamId: ID, userId: ID, amount: 'number', paymentDate: 'string', paymentMethod: PAIEMENT, notes: 'string' },
};

export default CreditPayment;
