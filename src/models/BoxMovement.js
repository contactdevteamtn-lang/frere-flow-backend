// Modèle « BoxMovement » — collection MongoDB ff_packagingMovements
// Mouvement de caisses avec un client : SORTIE (remises au client) ou RETOUR (rendues).
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const BoxMovement = {
  name: 'BoxMovement',
  collection: 'packagingMovements',
  permission: null, // créé uniquement par les opérations métier (voir son contrôleur)
  schema: { id: ID, clientId: ID, packagingTypeId: ID, teamId: ID, 'saleId?': ID, type: ['SORTIE', 'RETOUR'], quantity: 'number', date: 'string', userId: ID, notes: 'string' },
};

export default BoxMovement;
