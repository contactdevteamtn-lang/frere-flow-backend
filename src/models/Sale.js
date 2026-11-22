// Modèle « Sale » — collection MongoDB ff_sales
// Vente (facture FM-AAAA-NNNN). Une vente de marché a un « marketTripId ».
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID, PAIEMENT } from './types.js';

export const Sale = {
  name: 'Sale',
  collection: 'sales',
  permission: null, // créé uniquement par les opérations métier (voir son contrôleur)
  schema: {
    id: ID, 'marketTripId?': ID, number: 'string', clientId: ID, teamId: ID, frigoId: ID, userId: ID, saleStatusId: ID, saleDate: 'string',
    totalAmount: 'number', paidAmount: 'number', remainingAmount: 'number', paymentType: PAIEMENT, notes: 'string',
  },
};

export default Sale;
