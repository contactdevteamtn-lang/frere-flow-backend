// Modèle « SaleItem » — collection MongoDB ff_saleItems
// Ligne de vente : produit, quantité, prix.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const SaleItem = {
  name: 'SaleItem',
  collection: 'saleItems',
  permission: null, // créé uniquement par les opérations métier (voir son contrôleur)
  schema: { id: ID, saleId: ID, productId: ID, quantity: 'number', unitPrice: 'number', total: 'number' },
};

export default SaleItem;
