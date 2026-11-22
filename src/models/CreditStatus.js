// Modèle « CreditStatus » — collection MongoDB ff_creditStatuses
// Statut de dette (active, partielle, payée, en retard, annulée) — liste fixe.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const CreditStatus = {
  name: 'CreditStatus',
  collection: 'creditStatuses',
  permission: null, // créé uniquement par les opérations métier (voir son contrôleur)
  schema: { id: ID, code: ['ACTIVE', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'], label: 'string' },
};

export default CreditStatus;
