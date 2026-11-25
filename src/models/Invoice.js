// Modèle « Invoice » — collection MongoDB ff_invoices
// Facture d'une vente : créée automatiquement avec la vente (une par vente).
// Statuts : VALIDEE (validée), A_VOIR (à revoir / à modifier, avec motif), ANNULEE (annule aussi la vente).
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
import { ID } from './types.js';

export const Invoice = {
  name: 'Invoice',
  collection: 'invoices',
  permission: null, // créée par la vente, modifiée uniquement par l'opération setInvoiceStatus
  schema: {
    id: ID, number: 'string', saleId: ID, clientId: ID, teamId: ID, amount: 'number',
    status: ['VALIDEE', 'A_VOIR', 'ANNULEE'], date: 'string', notes: 'string', 'updatedAt?': 'string',
  },
};

export default Invoice;
