// Modèle « Client » — collection MongoDB ff_clients
// Client. Un client de marché a un « marketId » : il n'apparaît que dans la section Marchés (séparé des clients de l'application).
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const Client = {
  name: 'Client',
  collection: 'clients',
  permission: 'clients', // droit requis pour créer / modifier / supprimer
  schema: {
    id: ID, 'marketId?': 'string', code: 'string', name: 'string', 'nameAlt?': 'string', phone: 'string', address: 'string',
    email: 'string', taxId: 'string', active: 'boolean', createdAt: 'string',
  },
};

export default Client;
