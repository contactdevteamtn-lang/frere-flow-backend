// Modèle « StockMovement » — collection MongoDB ff_stockMovements
// Mouvement de stock : entrée, sortie, transfert entre frigos, ajustement d'inventaire. Le stock = somme des mouvements.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const StockMovement = {
  name: 'StockMovement',
  collection: 'stockMovements',
  permission: null, // créé uniquement par les opérations métier (voir son contrôleur)
  schema: {
    id: ID, productId: ID, frigoId: ID, 'toFrigoId?': ID, quantity: 'number',
    movementType: ['ENTREE', 'SORTIE', 'TRANSFERT', 'AJUSTEMENT'], date: 'string', userId: ID, reference: 'string', notes: 'string',
  },
};

export default StockMovement;
