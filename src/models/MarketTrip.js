// Modèle « MarketTrip » — collection MongoDB ff_marketTrips
// Journée de marché (MK-AAAA-NNNN) : chargement, ventes depuis le camion, clôture avec écarts.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const MarketTrip = {
  name: 'MarketTrip',
  collection: 'marketTrips',
  permission: null, // créé uniquement par les opérations métier (voir son contrôleur)
  schema: {
    id: ID, number: 'string', marketId: ID, teamId: ID, date: 'string', userId: ID, status: ['OPEN', 'CLOSED'],
    loads: 'array', boxes: 'array', notes: 'string', 'closing?': 'object',
  },
};

export default MarketTrip;
