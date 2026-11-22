// Modèle « Role » — collection MongoDB ff_roles
// Rôle et ses permissions (ex. المدير العام, مسؤول السوق, اطلاع فقط). Le rôle « Directeur général » garde toujours toutes les permissions.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const Role = {
  name: 'Role',
  collection: 'roles',
  permission: 'administration', // droit requis pour créer / modifier / supprimer
  schema: { id: ID, name: 'string', 'nameAlt?': 'string', description: 'string', permissions: 'array' },
};

export default Role;
