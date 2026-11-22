// Modèle « SaleStatus » — collection MongoDB ff_saleStatuses
// Statut de vente (en attente, payée, partielle, annulée…) — liste fixe.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const SaleStatus = {
  name: 'SaleStatus',
  collection: 'saleStatuses',
  permission: null, // créé uniquement par les opérations métier (voir son contrôleur)
  schema: { id: ID, code: ['PENDING', 'CONFIRMED', 'PAID', 'PARTIAL', 'CANCELLED'], label: 'string' },
};

export default SaleStatus;
