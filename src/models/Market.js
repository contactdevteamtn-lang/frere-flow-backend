// Modèle « Market » — collection MongoDB ff_markets
// Marché (souk) où l'équipe va vendre.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const Market = {
  name: 'Market',
  collection: 'markets',
  permission: null, // créé uniquement par les opérations métier (voir son contrôleur)
  schema: { id: ID, name: 'string', 'nameAlt?': 'string', city: 'string', active: 'boolean' },
};

export default Market;
