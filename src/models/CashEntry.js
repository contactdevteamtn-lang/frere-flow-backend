// Modèle « CashEntry » — collection MongoDB ff_cash
// Opération de caisse : encaissement ou décaissement, par équipe et mode de paiement.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID, PAIEMENT } from './types.js';

export const CashEntry = {
  name: 'CashEntry',
  collection: 'cash',
  permission: null, // créé uniquement par les opérations métier (voir son contrôleur)
  schema: { id: ID, teamId: ID, userId: ID, type: ['ENCAISSEMENT', 'DECAISSEMENT'], method: PAIEMENT, amount: 'number', reference: 'string', date: 'string', description: 'string' },
};

export default CashEntry;
