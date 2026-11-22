// Modèle « Box » — collection MongoDB ff_packagingTypes
// Type de caisse (box). « clientOwned: true » = caisses appartenant au client (il amène ses propres caisses) : comptées « à lui rendre », jamais mélangées avec nos caisses.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const Box = {
  name: 'Box',
  collection: 'packagingTypes',
  permission: 'emballages', // droit requis pour créer / modifier / supprimer
  schema: {
    id: ID, name: 'string', 'nameAlt?': 'string', color: 'string', hex: 'string', description: 'string', totalAvailable: 'number', active: 'boolean',
    'clientOwned?': 'boolean', // caisses appartenant aux clients (à leur rendre)
  },
};

export default Box;
