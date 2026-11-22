// Modèle « Frigo » — collection MongoDB ff_frigos
// Chambre froide : le stock est suivi par produit et par frigo.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const Frigo = {
  name: 'Frigo',
  collection: 'frigos',
  permission: 'frigos', // droit requis pour créer / modifier / supprimer
  schema: { id: ID, name: 'string', 'nameAlt?': 'string', code: 'string', capacity: 'number', location: 'string', description: 'string', active: 'boolean' },
};

export default Frigo;
